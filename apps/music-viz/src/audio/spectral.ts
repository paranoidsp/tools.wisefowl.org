/**
 * Shared spectral helpers: frequency scales, the AudioFeatures container,
 * band mapping, peak picking. Used by the live extractor (features.ts) and
 * by syntheticFeatures (synthetic.ts). Nothing here allocates per frame.
 */
import type { AnalysisSettings, AudioFeatures, FreqScale, Partial_ } from '../core/types';

export const DB_FLOOR = -200;
export const MAX_PEAKS = 16;
export const MAX_PARTIALS = 12;

// ───────────────────────────────────────────────────────────── scales ──

export function hzToScale(f: number, scale: FreqScale): number {
  switch (scale) {
    case 'linear': return f;
    case 'mel': return 2595 * Math.log10(1 + f / 700);
    case 'bark': return (26.81 * f) / (1960 + f) - 0.53;
    case 'log':
    default: return Math.log2(Math.max(1e-3, f));
  }
}

export function scaleToHz(v: number, scale: FreqScale): number {
  switch (scale) {
    case 'linear': return v;
    case 'mel': return 700 * (Math.pow(10, v / 2595) - 1);
    case 'bark': return (1960 * (v + 0.53)) / (26.28 - v);
    case 'log':
    default: return Math.pow(2, v);
  }
}

/** 0..1 position of f on the settings' band scale between minFreq..maxFreq. */
export function scalePos(f: number, s: AnalysisSettings): number {
  if (!(f > 0)) return 0;
  const a = hzToScale(s.minFreq, s.freqScale);
  const b = hzToScale(s.maxFreq, s.freqScale);
  const v = (hzToScale(f, s.freqScale) - a) / (b - a || 1);
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** 0..1 log position of f between minFreq..maxFreq. */
export function logPos(f: number, s: AnalysisSettings): number {
  if (!(f > 0)) return 0;
  const v = Math.log(f / s.minFreq) / Math.log(s.maxFreq / s.minFreq || 2);
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// ─────────────────────────────────────────────────────── features obj ──

export function createFeatures(fftSize: number, bandCount: number, sampleRate = 48000): AudioFeatures {
  const peaks: Partial_[] = [];
  const partials: Partial_[] = [];
  const f: AudioFeatures = {
    time: 0, duration: 0, playing: false, sampleRate, fftSize,
    spectrum: new Float32Array(fftSize / 2),
    spectrumDb: new Float32Array(fftSize / 2).fill(DB_FLOOR),
    waveform: new Float32Array(fftSize),
    bands: new Float32Array(bandCount),
    bandFreqs: new Float32Array(bandCount),
    chroma: new Float32Array(12),
    rms: 0, loudness: 0, peak: 0, bass: 0, mid: 0, treble: 0,
    centroid: 0, centroidNorm: 0, flux: 0,
    beat: false, beatPulse: 0, bpm: null, beatPhase: 0, beatCount: 0,
    pitch: { freq: 0, clarity: 0, norm: 0 },
    partials, peaks,
  };
  return f;
}

/** Reallocate arrays whose size no longer matches. Returns true if anything changed. */
export function ensureFeatureSizes(f: AudioFeatures, fftSize: number, bandCount: number): boolean {
  let changed = false;
  if (f.fftSize !== fftSize || f.spectrum.length !== fftSize / 2) {
    f.fftSize = fftSize;
    f.spectrum = new Float32Array(fftSize / 2);
    f.spectrumDb = new Float32Array(fftSize / 2).fill(DB_FLOOR);
    f.waveform = new Float32Array(fftSize);
    changed = true;
  }
  if (f.bands.length !== bandCount) {
    f.bands = new Float32Array(bandCount);
    f.bandFreqs = new Float32Array(bandCount);
    changed = true;
  }
  return changed;
}

/** Fixed pool of Partial_ objects so peaks / partials never allocate per frame. */
export class PartialPool {
  private pool: Partial_[];
  constructor(size: number) {
    this.pool = Array.from({ length: size }, () => ({ freq: 0, amp: 0 }));
  }
  /** Fill `out` with `n` pooled entries from parallel arrays. */
  fill(out: Partial_[], n: number, freq: ArrayLike<number>, amp: ArrayLike<number>) {
    n = Math.min(n, this.pool.length);
    for (let i = 0; i < n; i++) {
      const p = this.pool[i];
      p.freq = freq[i];
      p.amp = amp[i];
      out[i] = p;
    }
    out.length = n;
  }
}

// ───────────────────────────────────────────────────────────── bands ──

/**
 * Precomputed mapping from FFT bins to perceptual bands. Rebuilt only when
 * the relevant settings / sizes change.
 */
export class BandMap {
  private key = '';
  lo = new Int32Array(0);
  hi = new Int32Array(0);
  center = new Float32Array(0);
  freqs = new Float32Array(0);
  /** dB added per band: gentle +3 dB/oct tilt around 1 kHz so treble isn't dwarfed */
  tilt = new Float32Array(0);

  update(binCount: number, binHz: number, s: AnalysisSettings): void {
    const n = Math.max(1, s.bandCount | 0);
    const key = `${binCount}|${binHz}|${n}|${s.freqScale}|${s.minFreq}|${s.maxFreq}`;
    if (key === this.key) return;
    this.key = key;
    if (this.lo.length !== n) {
      this.lo = new Int32Array(n);
      this.hi = new Int32Array(n);
      this.center = new Float32Array(n);
      this.freqs = new Float32Array(n);
      this.tilt = new Float32Array(n);
    }
    const nyq = binHz * binCount;
    const minF = Math.max(1, Math.min(s.minFreq, nyq * 0.95));
    const maxF = Math.max(minF * 1.01, Math.min(s.maxFreq, nyq));
    const a = hzToScale(minF, s.freqScale);
    const b = hzToScale(maxF, s.freqScale);
    for (let j = 0; j < n; j++) {
      const e0 = scaleToHz(a + ((b - a) * j) / n, s.freqScale);
      const e1 = scaleToHz(a + ((b - a) * (j + 1)) / n, s.freqScale);
      const c = scaleToHz(a + ((b - a) * (j + 0.5)) / n, s.freqScale);
      this.freqs[j] = c;
      this.center[j] = Math.min(binCount - 1.001, c / binHz);
      this.lo[j] = Math.max(1, Math.ceil(e0 / binHz));
      this.hi[j] = Math.min(binCount - 1, Math.floor(e1 / binHz));
      this.tilt[j] = 3 * Math.log2(c / 1000);
    }
  }
}

/** dB spectrum → 0..1 bands (max of bins in range, interpolated when narrower than a bin). */
export function computeBands(db: Float32Array, map: BandMap, s: AnalysisSettings, out: Float32Array, outFreqs: Float32Array) {
  const n = out.length;
  const range = s.maxDb - s.minDb || 1;
  const gain = s.gain;
  for (let j = 0; j < n; j++) {
    const lo = map.lo[j];
    const hi = map.hi[j];
    let v: number;
    if (hi <= lo) {
      const c = map.center[j];
      const i0 = c | 0;
      const fr = c - i0;
      v = db[i0] * (1 - fr) + db[i0 + 1] * fr;
      if (hi === lo && db[lo] > v) v = db[lo];
    } else {
      v = db[lo];
      for (let i = lo + 1; i <= hi; i++) if (db[i] > v) v = db[i];
    }
    let x = ((v + map.tilt[j] - s.minDb) / range) * gain;
    out[j] = x < 0 ? 0 : x > 1 ? 1 : x;
    outFreqs[j] = map.freqs[j];
  }
}

/** Parabolic interpolation around bin i of y: returns fractional offset −0.5..0.5. */
export function parabolicOffset(a: number, b: number, c: number): number {
  const d = a - 2 * b + c;
  if (d === 0) return 0;
  const p = (0.5 * (a - c)) / d;
  return p < -0.5 ? -0.5 : p > 0.5 ? 0.5 : p;
}

/** A-weighting as a linear power factor. */
export function aWeightPower(f: number): number {
  if (f <= 0) return 0;
  const f2 = f * f;
  const ra = (12194 ** 2 * f2 * f2) / ((f2 + 20.6 ** 2) * Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194 ** 2));
  return ra * ra * 1.5849; // +2 dB normalisation at 1 kHz
}
