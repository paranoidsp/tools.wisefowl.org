/**
 * Audio engine: file / demo / microphone sources, transport, capture stream,
 * and per-frame feature extraction.
 *
 * Graph (created lazily on first user action):
 *
 *   file/demo source ─► bus ─┬─► analyser ─► (silent sink) ─► destination
 *                            └─► volume ─┬─► destination
 *                                        └─► MediaStreamDestination (captureStream)
 *   mic source ─► micBus ─┬─► analyser          (never to speakers: feedback)
 *                         └─► MediaStreamDestination
 *
 * The analyser taps pre-volume, so turning the volume down doesn't kill the
 * visuals.
 */
import type { AudioEngineApi, EngineState, SourceKind } from '../core/engine-api';
import type { AnalysisSettings, AudioFeatures } from '../core/types';
import { DEMOS, renderDemo } from './demos';
import { FeatureExtractor } from './features';
import { computeOverview } from './overview';
import { createFeatures } from './spectral';
import { explainDecodeError, explainReadError, formatBytes, isSilent, preCheck } from './fileCheck';

/** A fresh, silent AudioFeatures object sized for the settings. */
export function silent(s: AnalysisSettings): AudioFeatures {
  return createFeatures(s.fftSize, s.bandCount);
}

type Listener = (s: EngineState) => void;

const VOLUME_KEY = 'music-viz:volume';
const LOOP_KEY = 'music-viz:loop';

function readPref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
function writePref(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

function describeError(e: unknown): string {
  if (e instanceof DOMException) {
    if (e.name === 'NotAllowedError') return 'Microphone access was blocked. Allow it in the browser’s site settings and try again.';
    if (e.name === 'NotFoundError') return 'No microphone was found.';
    if (e.name === 'NotReadableError') return 'The microphone is in use by another application.';
    if (e.name === 'SecurityError') return 'Microphone access needs a secure (https) page.';
  }
  return e instanceof Error ? e.message : String(e);
}

class Engine implements AudioEngineApi {
  private _state: EngineState = {
    kind: 'none',
    name: '',
    duration: 0,
    playing: false,
    loading: false,
    loadingLabel: null,
    error: null,
    notice: null,
    volume: readPref(VOLUME_KEY, 0.8),
    loop: readPref(LOOP_KEY, true),
    overview: null,
  };
  private listeners = new Set<Listener>();

  private ctx: AudioContext | null = null;
  private bus!: GainNode;
  private micBus!: GainNode;
  private volume!: GainNode;
  private analyser!: AnalyserNode;
  private streamDest!: MediaStreamAudioDestinationNode;

  private buffer: AudioBuffer | null = null;
  private node: AudioBufferSourceNode | null = null;
  /** ctx time corresponding to track position 0 (while playing) */
  private startedAt = 0;
  /** paused position, seconds */
  private offset = 0;

  private mic: MediaStream | null = null;
  private micNode: MediaStreamAudioSourceNode | null = null;

  private loadToken = 0;
  /** bumped by every load request; a newer request cancels an older one still decoding */
  private pendingToken = 0;
  private extractor = new FeatureExtractor();
  private lastSmoothing = -1;
  private lastSettings: AnalysisSettings | null = null;
  private lastAnalyze = 0;

  readonly demos = DEMOS;

  get state(): EngineState {
    return this._state;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private set(patch: Partial<EngineState>) {
    this._state = { ...this._state, ...patch };
    for (const fn of this.listeners) {
      try {
        fn(this._state);
      } catch (e) {
        console.error('[audio] listener failed', e);
      }
    }
  }

  // ───────────────────────────────────────────────────────────── graph ──

  private ensureCtx(): AudioContext {
    if (this.ctx) return this.ctx;
    const Ctor: typeof AudioContext = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.bus = ctx.createGain();
    this.micBus = ctx.createGain();
    this.volume = ctx.createGain();
    this.volume.gain.value = this._state.volume;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 4096;
    this.analyser.smoothingTimeConstant = 0.6;
    this.streamDest = ctx.createMediaStreamDestination();
    const sink = ctx.createGain();
    sink.gain.value = 0;

    this.bus.connect(this.analyser);
    this.bus.connect(this.volume);
    this.volume.connect(ctx.destination);
    this.volume.connect(this.streamDest);
    this.micBus.connect(this.analyser);
    this.micBus.connect(this.streamDest);
    this.analyser.connect(sink).connect(ctx.destination); // keep the analyser pulled

    ctx.addEventListener('statechange', () => {
      // e.g. OS audio interruptions: reflect reality
      if (ctx.state !== 'running' && this._state.playing && this._state.kind !== 'mic') {
        this.offset = this.position();
        this.stopNode();
        this.set({ playing: false });
      }
    });
    return ctx;
  }

  /**
   * Resume the AudioContext. Browsers keep it suspended until the page gets a
   * user gesture, and resume() then stays pending (it doesn't reject), so
   * wait at most `ms` and report whether sound is actually running.
   */
  private async resumeCtx(ms = 1200): Promise<boolean> {
    const ctx = this.ensureCtx();
    if (ctx.state === 'running') return true;
    try {
      await Promise.race([ctx.resume(), new Promise((r) => setTimeout(r, ms))]);
    } catch {
      /* fall through to the state check */
    }
    return (ctx.state as string) === 'running';
  }

  // ──────────────────────────────────────────────────────────── loading ──

  async loadFile(file: File): Promise<boolean> {
    // Checks that need no decoding: refuse early, leaving the current track alone.
    const check = preCheck(file);
    if (!check.ok) {
      this.set({ error: check.error ?? 'That file can’t be played.', notice: null });
      return false;
    }
    const token = ++this.pendingToken;
    const label = `“${file.name}” (${formatBytes(file.size)})`;
    this.set({ loading: true, loadingLabel: `Reading ${label}…`, error: null, notice: check.warning ?? null });
    const fail = (error: string) => {
      if (token !== this.pendingToken) return false;
      this.set({ loading: false, loadingLabel: null, error });
      return false;
    };

    let data: ArrayBuffer;
    try {
      data = await file.arrayBuffer();
    } catch (e) {
      return fail(explainReadError(file, e));
    }
    if (token !== this.pendingToken) return false;

    this.set({ loadingLabel: `Decoding ${label}…` });
    let buf: AudioBuffer;
    try {
      buf = await this.ensureCtx().decodeAudioData(data);
    } catch {
      return fail(explainDecodeError(file));
    }
    if (token !== this.pendingToken) return false;
    if (!(buf.duration > 0.05)) return fail(`“${file.name}” decoded, but it contains no audio (duration ${buf.duration.toFixed(2)} s).`);

    // Success: only now replace the current source.
    const loadToken = this.beginLoad();
    this.useBuffer(buf, 'file', file.name.replace(/\.[^.]+$/, ''), loadToken);
    if (isSilent(buf)) this.set({ notice: `“${file.name}” loaded, but it seems to be silent, so the visuals won’t move much.` });
    else if (check.warning) this.set({ notice: null });
    return true;
  }

  async loadDemo(id: string): Promise<boolean> {
    const demo = DEMOS.find((d) => d.id === id);
    const name = demo?.name ?? id;
    const token = ++this.pendingToken;
    this.set({ loading: true, loadingLabel: `Synthesizing “${name}” in your browser…`, error: null, notice: null });
    try {
      this.ensureCtx();
      const buf = await renderDemo(id);
      if (token !== this.pendingToken) return false;
      const loadToken = this.beginLoad();
      this.useBuffer(buf, 'demo', name, loadToken);
      return true;
    } catch (e) {
      if (token !== this.pendingToken) return false;
      this.set({ loading: false, loadingLabel: null, error: `Couldn’t synthesize the “${name}” demo: ${describeError(e)}` });
      return false;
    }
  }

  unlock(): void {
    try {
      const ctx = this.ensureCtx();
      if (ctx.state !== 'running') void ctx.resume().catch(() => {});
    } catch {
      /* no Web Audio at all; reported when something tries to play */
    }
  }

  dismissMessage(): void {
    if (this._state.error || this._state.notice) this.set({ error: null, notice: null });
  }

  async useMicrophone(): Promise<void> {
    // Ask for the mic first: if that fails, whatever is playing keeps playing.
    const pending = ++this.pendingToken;
    this.set({ loading: true, loadingLabel: 'Waiting for microphone permission…', error: null, notice: null });
    let token = -1;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser has no microphone support (or the page isn’t served over https).');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      if (pending !== this.pendingToken) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      token = this.beginLoad();
      const ctx = this.ensureCtx();
      await this.resumeCtx();
      this.mic = stream;
      this.micNode = ctx.createMediaStreamSource(stream);
      this.micNode.connect(this.micBus);
      this.extractor.reset();
      stream.getAudioTracks()[0]?.addEventListener('ended', () => {
        if (this.mic === stream) {
          this.releaseMic();
          this.set({ playing: false, error: 'The microphone was disconnected.' });
        }
      });
      const label = stream.getAudioTracks()[0]?.label;
      this.set({ kind: 'mic', loading: false, loadingLabel: null, playing: true, duration: 0, overview: null, name: label ? `Mic — ${label}` : 'Microphone' });
    } catch (e) {
      if (pending !== this.pendingToken) return;
      if (token === -1) {
        // permission/device failed before we touched the current source: keep it
        this.set({ loading: false, loadingLabel: null, error: describeError(e) });
      } else if (token === this.loadToken) {
        this.set({ loading: false, loadingLabel: null, playing: false, error: describeError(e), kind: 'none', name: '' });
      }
    }
  }

  /** Stop whatever is playing and invalidate in-flight loads. */
  private beginLoad(): number {
    this.loadToken++;
    this.stopNode();
    this.releaseMic();
    this.buffer = null;
    this.offset = 0;
    if (this._state.playing) this.set({ playing: false });
    return this.loadToken;
  }

  private useBuffer(buf: AudioBuffer, kind: SourceKind, name: string, token: number) {
    this.buffer = buf;
    this.offset = 0;
    this.extractor.reset();
    this.set({ kind, name, duration: buf.duration, loading: false, loadingLabel: null, error: null, overview: null, playing: false });
    computeOverview(buf, 1200, () => token !== this.loadToken)
      .then((ov) => {
        if (ov && token === this.loadToken) this.set({ overview: ov });
      })
      .catch((e) => console.warn('[audio] overview failed', e));
  }

  private releaseMic() {
    if (this.micNode) {
      try {
        this.micNode.disconnect();
      } catch {
        /* ignore */
      }
      this.micNode = null;
    }
    if (this.mic) {
      this.mic.getTracks().forEach((t) => t.stop());
      this.mic = null;
    }
  }

  // ────────────────────────────────────────────────────────── transport ──

  private position(): number {
    const buf = this.buffer;
    if (!buf) return 0;
    if (!this.node || !this.ctx) return this.offset;
    const t = this.ctx.currentTime - this.startedAt;
    const d = buf.duration;
    if (this.node.loop) return d > 0 ? ((t % d) + d) % d : 0;
    return Math.min(Math.max(0, t), d);
  }

  currentTime(): number {
    return this.position();
  }

  private startNode(at: number) {
    const ctx = this.ctx!;
    const buf = this.buffer!;
    const node = ctx.createBufferSource();
    node.buffer = buf;
    node.loop = this._state.loop;
    node.loopStart = 0;
    node.loopEnd = buf.duration;
    node.connect(this.bus);
    const offset = Math.min(Math.max(0, at), Math.max(0, buf.duration - 1e-3));
    node.onended = () => {
      if (this.node !== node) return; // stopped deliberately / replaced
      this.node = null;
      this.offset = 0;
      this.set({ playing: false });
    };
    node.start(0, offset);
    this.startedAt = ctx.currentTime - offset;
    this.node = node;
  }

  private stopNode() {
    const n = this.node;
    if (!n) return;
    this.node = null;
    n.onended = null;
    try {
      n.stop();
    } catch {
      /* already stopped */
    }
    n.disconnect();
  }

  async play(): Promise<void> {
    // Kick the context synchronously: when play() is called from a click or
    // keypress, this is the moment the browser allows sound to start.
    this.unlock();
    if (this._state.kind === 'mic') {
      if (!this.micNode) return;
      await this.resumeCtx();
      try {
        this.micNode.connect(this.micBus);
      } catch {
        /* already connected */
      }
      if (!this._state.playing) this.set({ playing: true });
      return;
    }
    if (!this.buffer) {
      // nothing loaded: start the first demo so the play button always does something
      if (this._state.kind === 'none' && !this._state.loading) {
        await this.loadDemo(DEMOS[0].id);
        if (!this.buffer) return;
      } else return;
    }
    const running = await this.resumeCtx();
    if (!running) {
      // Autoplay policy: no sound until the page has had a click/keypress.
      // Say so instead of silently "playing" with a frozen clock.
      this.set({
        playing: false,
        notice:
          (this.ctx?.state as string) === 'interrupted'
            ? 'Sound was interrupted by the system (another app may be using audio). Press Play to resume.'
            : 'The browser is holding sound back until you interact with the page. Press Play to start.',
      });
      return;
    }
    if (this.node) return;
    if (this.offset >= this.buffer.duration - 0.01) this.offset = 0;
    this.startNode(this.offset);
    this.set({ playing: true, error: null, notice: this._state.notice?.startsWith('The browser is holding') ? null : this._state.notice });
  }

  pause(): void {
    if (this._state.kind === 'mic') {
      try {
        this.micNode?.disconnect();
      } catch {
        /* ignore */
      }
      if (this._state.playing) this.set({ playing: false });
      return;
    }
    if (!this.node) return;
    this.offset = this.position();
    this.stopNode();
    this.set({ playing: false });
  }

  async toggle(): Promise<void> {
    if (this._state.playing) this.pause();
    else await this.play();
  }

  seek(seconds: number): void {
    const buf = this.buffer;
    if (!buf) return;
    const t = Math.min(Math.max(0, seconds), buf.duration);
    if (this.node) {
      this.stopNode();
      if (t >= buf.duration - 0.01 && !this._state.loop) {
        this.offset = 0;
        this.set({ playing: false });
        return;
      }
      this.startNode(t);
    } else {
      this.offset = t;
    }
  }

  setVolume(v: number): void {
    const vol = Math.min(1, Math.max(0, v));
    if (this.ctx) this.volume.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.015);
    writePref(VOLUME_KEY, vol);
    if (vol !== this._state.volume) this.set({ volume: vol });
  }

  setLoop(on: boolean): void {
    if (on === this._state.loop) return;
    if (this.node && this.ctx) {
      // re-base so position stays continuous when (un)wrapping
      const pos = this.position();
      this.node.loop = on;
      this.startedAt = this.ctx.currentTime - pos;
    }
    writePref(LOOP_KEY, on);
    this.set({ loop: on });
  }

  captureStream(): MediaStream | null {
    if (!this.ctx || this._state.kind === 'none') return null;
    return this.streamDest.stream;
  }

  // ─────────────────────────────────────────────────────────── analysis ──

  analyze(settings: AnalysisSettings): AudioFeatures {
    const now = performance.now() / 1000;
    // Several consumers in one frame (stage + a UI meter, say) share one
    // analysis; re-running would zero the flux and confuse beat timing.
    if (settings === this.lastSettings && now - this.lastAnalyze < 0.004) return this.extractor.f;
    this.lastSettings = settings;
    this.lastAnalyze = now;
    const ex = this.extractor.prepare(settings);
    const ctx = this.ctx;
    const st = this._state;
    const live = !!ctx && ctx.state === 'running';
    if (live) {
      const an = this.analyser;
      if (an.fftSize !== settings.fftSize) an.fftSize = settings.fftSize;
      const sm = Math.min(0.99, Math.max(0, settings.smoothing));
      if (sm !== this.lastSmoothing) {
        an.smoothingTimeConstant = sm;
        this.lastSmoothing = sm;
      }
      an.getFloatFrequencyData(ex.db);
      an.getFloatTimeDomainData(ex.wave);
    } else {
      ex.decay(1 / 60);
    }
    const active = live && st.playing;
    return ex.process(settings, ctx?.sampleRate ?? 48000, now, this.position(), st.duration, st.playing, active);
  }
}

export const engine: AudioEngineApi = new Engine();

if (import.meta.env.DEV) (window as unknown as { __engine: AudioEngineApi }).__engine = engine;

// Browsers only let audio start from a user gesture. Unlock on the first
// click/keypress anywhere, so a later async play() (after a file has decoded)
// isn't blocked.
if (typeof window !== 'undefined') {
  const unlock = () => engine.unlock();
  window.addEventListener('pointerdown', unlock, { capture: true, passive: true });
  window.addEventListener('keydown', unlock, { capture: true });
}
