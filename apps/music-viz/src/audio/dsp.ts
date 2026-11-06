/**
 * Tiny sample-level synthesis toolkit for the demo tracks.
 *
 * Voices are rendered straight into Float32Arrays (dry + reverb-send stereo
 * buses); the buses are then mixed through a convolution reverb and a
 * compressor in an OfflineAudioContext. Doing the notes in JS rather than as
 * thousands of Web Audio nodes keeps a 40 s demo well under a second to
 * render (Web Audio node graphs cost per node per render quantum).
 */

const TBL = 8192;
const SINE = new Float32Array(TBL + 1);
for (let i = 0; i <= TBL; i++) SINE[i] = Math.sin((2 * Math.PI * i) / TBL);

export type Wave = 'sine' | 'tri' | 'saw';

export interface Mix {
  sr: number;
  n: number;
  L: Float32Array;
  R: Float32Array;
  /** reverb send */
  sL: Float32Array;
  sR: Float32Array;
}

export function createMix(sr: number, seconds: number): Mix {
  const n = Math.ceil(sr * seconds);
  return { sr, n, L: new Float32Array(n), R: new Float32Array(n), sL: new Float32Array(n), sR: new Float32Array(n) };
}

export interface FilterEnv {
  type: 'lowpass' | 'highpass' | 'bandpass';
  /** cutoff at note start, Hz */
  from: number;
  /** cutoff after `time` (exponential glide), Hz */
  to?: number;
  time?: number;
  q: number;
}

export interface VoiceOpts {
  t: number;
  dur: number;
  freq: number;
  /** exponential pitch glide to freqEnd over `glide` seconds */
  freqEnd?: number;
  glide?: number;
  wave?: Wave;
  amp: number;
  attack?: number;
  /** seconds to fall by 60 dB (0 = sustain) */
  decay?: number;
  /** linear fade at the end, seconds */
  release?: number;
  pan?: number;
  send?: number;
  filter?: FilterEnv;
  /** extra amplitude curve, evaluated every 64 samples with seconds since note start */
  curve?: (tau: number) => number;
}

/** RBJ biquad, coefficients recomputed on demand. */
class Biquad {
  b0 = 1; b1 = 0; b2 = 0; a1 = 0; a2 = 0;
  x1 = 0; x2 = 0; y1 = 0; y2 = 0;
  set(type: FilterEnv['type'], f: number, q: number, sr: number) {
    const w = (2 * Math.PI * Math.min(f, sr * 0.45)) / sr;
    const cw = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    let b0: number, b1: number, b2: number;
    if (type === 'lowpass') {
      b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2;
    } else if (type === 'highpass') {
      b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2;
    } else {
      b0 = alpha; b1 = 0; b2 = -alpha;
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0;
    this.a1 = (-2 * cw) / a0; this.a2 = (1 - alpha) / a0;
  }
  run(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x;
    this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

function polyBlep(t: number, dt: number): number {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}

const BLOCK = 64;

/** Render one oscillator voice into the mix. */
export function voice(m: Mix, o: VoiceOpts) {
  const { sr } = m;
  const s0 = Math.max(0, Math.floor(o.t * sr));
  const s1 = Math.min(m.n, Math.floor((o.t + o.dur) * sr));
  if (s1 <= s0) return;
  const L = m.L, R = m.R, SL = m.sL, SR_ = m.sR;
  const waveId = o.wave === 'tri' ? 1 : o.wave === 'saw' ? 2 : 0;
  const attackN = Math.max(1, Math.round((o.attack ?? 0.005) * sr));
  const decayMul = o.decay ? Math.exp(-6.9 / (o.decay * sr)) : 1;
  const releaseN = Math.max(1, Math.round((o.release ?? 0.01) * sr));
  const pan = Math.max(-1, Math.min(1, o.pan ?? 0));
  const gl = Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = Math.sin(((pan + 1) * Math.PI) / 4);
  const send = o.send ?? 0;
  const glideK = o.freqEnd && o.glide ? Math.log(o.freqEnd / o.freq) / o.glide : 0;
  const fo = o.filter;
  const filt = fo ? new Biquad() : null;
  const fGlideK = fo && fo.to && fo.time ? Math.log(fo.to / fo.from) / fo.time : 0;
  const curve = o.curve;
  const total = s1 - s0;
  let phase = 0;
  let dec = 1;
  let dt = o.freq / sr;
  let gain = o.amp;
  for (let blk = 0; blk < total; blk += BLOCK) {
    const tau = blk / sr;
    // per-block parameters
    if (glideK) dt = (o.freq * Math.exp(glideK * Math.min(tau, o.glide!))) / sr;
    gain = curve ? o.amp * curve(tau) : o.amp;
    if (filt) filt.set(fo!.type, fGlideK ? fo!.from * Math.exp(fGlideK * Math.min(tau, fo!.time!)) : fo!.from, fo!.q, sr);
    const end = Math.min(total, blk + BLOCK);
    for (let k = blk; k < end; k++) {
      let x: number;
      if (waveId === 0) x = SINE[(phase * TBL) | 0];
      else if (waveId === 1) x = phase < 0.5 ? 4 * phase - 1 : 3 - 4 * phase;
      else x = 2 * phase - 1 - polyBlep(phase, dt);
      phase += dt;
      if (phase >= 1) phase -= 1;
      if (filt) x = filt.run(x);
      let env = dec;
      if (k < attackN) env *= k / attackN;
      else dec *= decayMul;
      const left = total - k;
      if (left < releaseN) env *= left / releaseN;
      const v = x * env * gain;
      const s = s0 + k;
      L[s] += v * gl;
      R[s] += v * gr;
      if (send) {
        SL[s] += v * gl * send;
        SR_[s] += v * gr * send;
      }
    }
  }
}

export interface BankOpts {
  t: number;
  dur: number;
  /** partial frequencies, Hz */
  freqs: number[];
  /** per partial base amplitude */
  amps: number[];
  /** per partial amplitude curve, evaluated every 64 samples (seconds since start) */
  curves: ((tau: number) => number)[];
  pan?: number;
  send?: number;
}

/** Additive sine bank: many constant-frequency partials summed in one pass. */
export function bank(m: Mix, o: BankOpts) {
  const { sr } = m;
  const s0 = Math.max(0, Math.floor(o.t * sr));
  const s1 = Math.min(m.n, Math.floor((o.t + o.dur) * sr));
  if (s1 <= s0) return;
  const np = o.freqs.length;
  const ph = new Float64Array(np);
  const inc = new Float64Array(np);
  const g0 = new Float32Array(np);
  const g1 = new Float32Array(np);
  for (let p = 0; p < np; p++) {
    inc[p] = o.freqs[p] / sr;
    ph[p] = p * 0.137;
    g1[p] = o.amps[p] * o.curves[p](0);
  }
  const pan = Math.max(-1, Math.min(1, o.pan ?? 0));
  const gl = Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = Math.sin(((pan + 1) * Math.PI) / 4);
  const send = o.send ?? 0;
  const L = m.L, R = m.R, SL = m.sL, SR_ = m.sR;
  const total = s1 - s0;
  const tmp = new Float32Array(BLOCK);
  for (let blk = 0; blk < total; blk += BLOCK) {
    const end = Math.min(total, blk + BLOCK);
    const len = end - blk;
    const tauNext = Math.min(total, blk + BLOCK) / sr;
    tmp.fill(0);
    for (let p = 0; p < np; p++) {
      g0[p] = g1[p];
      g1[p] = o.amps[p] * o.curves[p](tauNext);
      // linear gain ramp across the block (no zipper noise)
      let g = g0[p];
      const dg = (g1[p] - g) / BLOCK;
      let phase = ph[p];
      const di = inc[p];
      for (let k = 0; k < len; k++) {
        tmp[k] += SINE[(phase * TBL) | 0] * g;
        g += dg;
        phase += di;
        if (phase >= 1) phase -= 1;
      }
      ph[p] = phase;
    }
    for (let k = 0; k < len; k++) {
      const s = s0 + blk + k;
      const v = tmp[k];
      L[s] += v * gl;
      R[s] += v * gr;
      if (send) {
        SL[s] += v * gl * send;
        SR_[s] += v * gr * send;
      }
    }
  }
}

export interface NoiseOpts {
  t: number;
  dur: number;
  amp: number;
  attack?: number;
  decay: number;
  filter: FilterEnv;
  pan?: number;
  send?: number;
}

let noiseSeed = 0x1234567;
function noiseSample(): number {
  // xorshift32
  noiseSeed ^= noiseSeed << 13;
  noiseSeed ^= noiseSeed >>> 17;
  noiseSeed ^= noiseSeed << 5;
  return ((noiseSeed >>> 0) / 4294967296) * 2 - 1;
}
export function seedNoise(seed: number) {
  noiseSeed = seed | 0 || 1;
}

/** Filtered noise burst. */
export function noise(m: Mix, o: NoiseOpts) {
  const { sr } = m;
  const s0 = Math.max(0, Math.floor(o.t * sr));
  const s1 = Math.min(m.n, Math.floor((o.t + o.dur) * sr));
  const filt = new Biquad();
  filt.set(o.filter.type, o.filter.from, o.filter.q, sr);
  const attack = Math.max(1 / sr, o.attack ?? 0.001);
  const decayK = 6.9 / o.decay;
  const pan = Math.max(-1, Math.min(1, o.pan ?? 0));
  const gl = Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = Math.sin(((pan + 1) * Math.PI) / 4);
  const send = o.send ?? 0;
  const fadeN = Math.min(s1 - s0, Math.floor(0.005 * sr));
  for (let s = s0, k = 0; s < s1; s++, k++) {
    const tau = k / sr;
    let env = tau < attack ? tau / attack : Math.exp(-decayK * (tau - attack));
    if (s1 - s < fadeN) env *= (s1 - s) / fadeN;
    const v = filt.run(noiseSample()) * env * o.amp;
    m.L[s] += v * gl;
    m.R[s] += v * gr;
    if (send) {
      m.sL[s] += v * gl * send;
      m.sR[s] += v * gr * send;
    }
  }
}

/**
 * Freeverb-style algorithmic reverb (8 damped combs + 4 allpasses per
 * channel). Much faster than an offline ConvolverNode, which in Chrome
 * renders a 30 s track with a 2.5 s impulse in several seconds.
 */
async function reverb(inL: Float32Array, inR: Float32Array, outL: Float32Array, outR: Float32Array, sr: number, room: number, wet: number, tick: () => Promise<void>) {
  const scale = sr / 44100;
  const COMBS = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
  const APS = [556, 441, 341, 225];
  const feedback = 0.7 + 0.28 * Math.min(1, Math.max(0, room));
  const damp = 0.3;
  const n = inL.length;
  // mono input
  const mono = new Float32Array(n);
  for (let i = 0; i < n; i++) mono[i] = (inL[i] + inR[i]) * 0.015;
  const y = new Float32Array(n);
  for (let ch = 0; ch < 2; ch++) {
    const spread = ch ? 23 : 0;
    y.fill(0);
    // each comb filter over the whole signal (tight, monomorphic inner loop)
    for (const c of COMBS) {
      const len = Math.round((c + spread) * scale);
      const buf = new Float32Array(len);
      let j = 0;
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const o = buf[j];
        lp = o * (1 - damp) + lp * damp;
        buf[j] = mono[i] + lp * feedback;
        if (++j === len) j = 0;
        y[i] += o;
      }
      await tick();
    }
    for (const a of APS) {
      const len = Math.round((a + spread) * scale);
      const buf = new Float32Array(len);
      let j = 0;
      for (let i = 0; i < n; i++) {
        const bo = buf[j];
        const x = y[i];
        buf[j] = x + bo * 0.5;
        y[i] = bo - x;
        if (++j === len) j = 0;
      }
      await tick();
    }
    const out = ch ? outR : outL;
    for (let i = 0; i < n; i++) out[i] += y[i] * wet;
  }
}

/** Mix dry + reverb send, run through a gentle compressor (OfflineAudioContext), normalize to −1 dBFS. */
export async function finish(m: Mix, opts: { room?: number; wet?: number; tick: () => Promise<void> }): Promise<AudioBuffer> {
  await reverb(m.sL, m.sR, m.L, m.R, m.sr, opts.room ?? 0.8, opts.wet ?? 0.6, opts.tick);
  const ctx = new OfflineAudioContext(2, m.n, m.sr);
  const dryBuf = ctx.createBuffer(2, m.n, m.sr);
  dryBuf.copyToChannel(m.L as Float32Array<ArrayBuffer>, 0);
  dryBuf.copyToChannel(m.R as Float32Array<ArrayBuffer>, 1);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 12;
  comp.ratio.value = 2.5;
  comp.attack.value = 0.008;
  comp.release.value = 0.25;
  comp.connect(ctx.destination);
  const src = ctx.createBufferSource();
  src.buffer = dryBuf;
  src.connect(comp);
  src.start(0);
  const buf = await ctx.startRendering();

  let peak = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const a = d[i] < 0 ? -d[i] : d[i];
      if (a > peak) peak = a;
    }
  }
  if (peak > 0) {
    const g = 0.89 / peak;
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] *= g;
    }
  }
  return buf;
}
