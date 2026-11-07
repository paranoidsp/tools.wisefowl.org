/** Imperative app actions shared by the top bar, transport and shortcuts. */
import { engine } from '../audio/engine';
import { stage } from '../core/stage';
import { useStore } from '../core/store';
import type { ProjectFile } from '../core/types';
import { toast, useUi } from './uiStore';
import { discardCurrentOnReplace, useHistory } from '../core/history';
import { newSeed, randomScene, shuffleLayer } from '../core/random';
import { getViz } from '../core/registry';

function slug(name: string) {
  return (name || 'music-viz').trim().replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-').toLowerCase() || 'music-viz';
}

function stamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function snapshot() {
  const blob = await stage.snapshot();
  if (!blob) return toast('Could not capture the stage', 'error');
  download(blob, `${slug(useStore.getState().name)}-${stamp()}.png`);
  toast('Snapshot saved', 'success');
}

// ─────────────────────────────────────────────────────────── recording ──

let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];

function pickMime(): string | undefined {
  const cands = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9', 'video/webm'];
  return cands.find((c) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c));
}

export function toggleRecording() {
  if (recorder && recorder.state !== 'inactive') {
    recorder.stop();
    return;
  }
  if (typeof MediaRecorder === 'undefined' || !stage.canvas.captureStream) {
    toast('Recording is not supported in this browser', 'error');
    return;
  }
  const video = stage.canvas.captureStream(60);
  const tracks: MediaStreamTrack[] = [...video.getVideoTracks()];
  let hasAudio = false;
  try {
    const audio = engine.captureStream();
    if (audio) {
      for (const t of audio.getAudioTracks()) tracks.push(t);
      hasAudio = audio.getAudioTracks().length > 0;
    }
  } catch {
    /* ignore */
  }
  const stream = new MediaStream(tracks);
  const mimeType = pickMime();
  try {
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 12_000_000 });
  } catch (e) {
    toast(`Could not start recording: ${String(e)}`, 'error');
    return;
  }
  chunks = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.onstop = () => {
    useUi.setState({ recording: false });
    video.getTracks().forEach((t) => t.stop());
    const blob = new Blob(chunks, { type: mimeType ?? 'video/webm' });
    chunks = [];
    recorder = null;
    if (blob.size) {
      download(blob, `${slug(useStore.getState().name)}-${stamp()}.webm`);
      toast('Recording saved', 'success');
    }
  };
  recorder.start(250);
  useUi.setState({ recording: true, recordStartedAt: performance.now() });
  toast(hasAudio ? 'Recording video + audio' : 'Recording video (no audio source)', 'info');
}

// ───────────────────────────────────────────────────────────── project ──

export function exportProject() {
  const p = useStore.getState().exportProject();
  download(new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' }), `${slug(p.name)}.mvs.json`);
  toast('Project exported', 'success');
}

export async function importProjectFile(file: File) {
  try {
    const p = JSON.parse(await file.text()) as ProjectFile;
    if (p.app !== 'music-viz-studio') throw new Error('Not a Music Viz Studio project');
    useStore.getState().importProject(p);
    useStore.getState().setTab('studio');
    toast(`Opened “${p.name}”`, 'success');
  } catch (e) {
    toast(`Could not import: ${e instanceof Error ? e.message : String(e)}`, 'error');
  }
}

/**
 * Show the browser's file picker. The input is attached to the document while
 * the dialog is open: a detached input can be garbage-collected mid-dialog,
 * in which case `change` never fires and picking a file silently does nothing.
 */
function pickFile(accept: string): Promise<File | null> {
  return new Promise((res) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;opacity:0';
    document.body.appendChild(input);
    let done = false;
    const finish = (f: File | null) => {
      if (done) return;
      done = true;
      input.remove();
      res(f);
    };
    input.addEventListener('change', () => finish(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => finish(null));
    input.click();
  });
}

export async function openProjectDialog() {
  const f = await pickFile('.json,application/json');
  if (f) await importProjectFile(f);
}

// ─────────────────────────────────────────────────────────────── audio ──

/**
 * Load a file and start it. Every way of choosing a file (Open, drag-and-drop)
 * ends up here. Nothing plays unless the load succeeded; otherwise the engine's
 * error (shown in the transport) says why, and we echo it in a toast.
 */
export async function loadAudioFile(file: File) {
  engine.unlock();
  const ok = await engine.loadFile(file);
  if (ok) await engine.play().catch((e) => toast(`Couldn’t start playback: ${String(e)}`, 'error'));
  // on failure the transport's message banner explains why (engine.state.error)
}

export async function openAudioDialog() {
  engine.unlock(); // inside the click, before the dialog takes focus
  const f = await pickFile('audio/*,video/*,.mp3,.wav,.ogg,.oga,.opus,.flac,.m4a,.aac,.aif,.aiff,.webm,.mp4');
  if (f) await loadAudioFile(f);
}

export async function loadDemo(id: string) {
  engine.unlock();
  const ok = await engine.loadDemo(id);
  if (ok) await engine.play().catch((e) => toast(`Couldn’t start playback: ${String(e)}`, 'error'));
  // on failure the transport's message banner explains why (engine.state.error)
}

export async function startMic() {
  engine.unlock();
  await engine.useMicrophone();
  if (engine.state.kind === 'mic') toast('Listening to your microphone. It isn’t played back or recorded anywhere.', 'info');
  // on failure the transport's message banner explains why (engine.state.error)
}

/** Route dropped files: project JSON → import, audio/video → engine. */
export async function handleFiles(files: FileList | File[]) {
  const arr = [...files];
  if (!arr.length) return;
  const json = arr.find((f) => f.name.toLowerCase().endsWith('.json') || f.type === 'application/json');
  if (json) return importProjectFile(json);
  // Prefer something that looks like audio; otherwise let the engine explain what's wrong with the file.
  const audio = arr.find((f) => f.type.startsWith('audio/') || f.type.startsWith('video/')) ?? arr[0];
  if (arr.length > 1) toast(`Opening “${audio.name}”. One file at a time for now.`, 'info');
  return loadAudioFile(audio);
}

export function toggleFullscreen() {
  const el = document.querySelector('.stage') as HTMLElement | null;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else el?.requestFullscreen?.().catch(() => toast('Fullscreen was blocked', 'error'));
}

export function togglePlay() {
  engine.unlock();
  if (engine.state.kind === 'none') {
    const demo = engine.demos[0];
    if (demo) return loadDemo(demo.id);
    return openAudioDialog();
  }
  engine.toggle().catch((e) => toast(String(e), 'error'));
}

// ──────────────────────────────────────────────────── random + history ──

/** Wildness for random rolls: 'mild' stays near presets, 'wild' strays far. */
export const WILDNESS = { mild: 0.12, medium: 0.22, wild: 0.5 } as const;
export type Wildness = keyof typeof WILDNESS;
let lastWildness: Wildness = (localStorage.getItem('mvs:wildness') as Wildness) || 'medium';
export const getWildness = () => lastWildness;
export function setWildness(w: Wildness) {
  lastWildness = w;
  localStorage.setItem('mvs:wildness', w);
}

/**
 * Replace the stage with a random visualization. The previous one is kept
 * in History, so rolling again is never destructive.
 */
export function rollRandom(w: Wildness = lastWildness, attempt = 0) {
  const scene = randomScene(newSeed(), WILDNESS[w]);
  const st = useStore.getState();
  st.loadScene(scene, 'random');
  st.setTab('studio');
  const epoch = useStore.getState().docEpoch;
  // Dud guard: some combinations draw (almost) nothing for the music that's
  // playing (e.g. beat-driven layers on a beatless track). If the stage is
  // still empty a moment later, quietly roll again and don't keep the dud.
  if (attempt < 3)
    setTimeout(() => {
      if (useStore.getState().docEpoch !== epoch || !engine.state.playing || !stageLooksEmpty()) return;
      discardCurrentOnReplace();
      rollRandom(w, attempt + 1);
    }, 1500);
  toast(`${scene.name}`, 'info', 3200, {
    label: 'Keep',
    run: () => {
      const id = useHistory.getState().entries.find((e) => e.current)?.id;
      if (id) {
        useHistory.getState().toggleStar(id);
        toast('Starred: it stays in History until you remove it', 'success');
      }
    },
  });
}

/** True if the stage is nearly uniform and dark (nothing visible drawn). */
function stageLooksEmpty(): boolean {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 40;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(stage.canvas, 0, 0, 64, 40);
  const d = g.getImageData(0, 0, 64, 40).data;
  let lit = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 90) lit++;
  return lit < 12; // fewer than ~0.5% of samples visibly lit
}

/** Vary the selected layer's settings around their current values. */
export function shuffleSelectedLayer() {
  const st = useStore.getState();
  const layer = st.layers.find((l) => l.id === st.selectedId);
  const def = layer && getViz(layer.vizId);
  if (!layer || !def) return toast('Select a layer to shuffle its settings', 'info');
  st.updateLayer(layer.id, shuffleLayer(layer, def, newSeed(), WILDNESS[lastWildness]));
}

/** Freeze the current visualization as a named checkpoint (⌘S). */
export function saveCheckpoint() {
  const id = useHistory.getState().checkpoint();
  if (!id) return;
  useUi.getState().setLeftView('history');
  useUi.getState().setDrawer(window.innerWidth < 800 ? 'left' : null);
  useHistory.getState().setRenaming(id);
}

export function renameCheckpointLater(id: string) {
  useUi.getState().setLeftView('history');
  useHistory.getState().setRenaming(id);
}
