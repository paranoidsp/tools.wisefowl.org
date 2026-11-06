/**
 * Deterministic, musically plausible fake AudioFeatures as a function of
 * time — for gallery thumbnails, previews, tests and the idle state.
 *
 * Simulates: a 120 BPM beat (kick on every beat, hats on off-beats), an
 * Am–F–C–G progression with an 8th-note arpeggio as the fundamental (with
 * gliding, breathing partials), a soft bass, and a pink-ish noise floor.
 * The spectrum is synthesized in dB, then bands / centroid are derived from
 * it with the same code as the live engine.
 *
 * Returns a shared object that is mutated on each call (no per-call
 * allocation once sizes are stable). Consume it before calling again.
 */
import type { AnalysisSettings, AudioFeatures } from '../core/types';
import {
  BandMap,
  DB_FLOOR,
  MAX_PARTIALS,
  MAX_PEAKS,
  PartialPool,
  computeBands,
  createFeatures,
  ensureFeatureSizes,
  logPos,
  scalePos,
} from './spectral';

const SR = 48000;
const BPM = 120;
const BEAT = 60 / BPM;
const LN10_20 = Math.LN10 / 20;
const CHORDS = [
  [57, 60, 64], // Am
  [53, 57, 60], // F
  [48, 52, 55], // C
  [55, 59, 62], // G
];
// arpeggio over two octaves: up 6 + down 2 → 8 eighths per beat-pair loop
const ARP = [0, 1, 2, 3, 4, 5, 4, 2];

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** deterministic integer hash noise in −1..1 */
function hash(i: number, j: number): number {
  let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(j + 0x27d4eb2f, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h & 0xffff) / 32768 - 1;
}

/** static per-bin pink-ish floor (dB), cached per fftSize */
let floorDb = new Float32Array(0);
let floorKey = 0;
function pinkFloor(bins: number, binHz: number): Float32Array {
  if (floorKey !== bins) {
    floorKey = bins;
    floorDb = new Float32Array(bins);
    for (let i = 0; i < bins; i++) floorDb[i] = -72 - 3 * Math.log2(Math.max(binHz, i * binHz) / 200);
  }
  return floorDb;
}

let F: AudioFeatures | null = null;
const bandMap = new BandMap();
const peakPool = new PartialPool(MAX_PEAKS);
const partialPool = new PartialPool(MAX_PARTIALS);
const partF = new Float32Array(MAX_PARTIALS);
const partA = new Float32Array(MAX_PARTIALS); // linear
const partN = new Float32Array(MAX_PARTIALS); // normalized
const pkF = new Float32Array(MAX_PEAKS);
const pkA = new Float32Array(MAX_PEAKS);
const bassAmp = new Float32Array(4);

function noteAt(t: number) {
  const chordIdx = Math.floor(t / (BEAT * 8)); // one chord per 2 bars (4 s)
  const ch = CHORDS[((chordIdx % 4) + 4) % 4];
  const step = Math.floor(t / (BEAT / 2));
  const a = ARP[((step % 8) + 8) % 8];
  const note = ch[a % 3] + 12 * Math.floor(a / 3);
  return { ch, note, step, stepStart: step * (BEAT / 2) };
}

/** Add a sine (phasor rotation, no trig per sample) into w. */
function addSine(w: Float32Array, hz: number, phase0: number, amp: number) {
  if (amp <= 0) return;
  const om = (2 * Math.PI * hz) / SR;
  const c = Math.cos(om);
  const sn = Math.sin(om);
  let re = Math.cos(phase0) * amp;
  let im = Math.sin(phase0) * amp;
  const n = w.length;
  for (let i = 0; i < n; i++) {
    w[i] += im;
    const r2 = re * c - im * sn;
    im = re * sn + im * c;
    re = r2;
  }
}

export function syntheticFeatures(t: number, s: AnalysisSettings): AudioFeatures {
  if (!F) F = createFeatures(s.fftSize, s.bandCount, SR);
  const f = F;
  ensureFeatureSizes(f, s.fftSize, s.bandCount);
  f.time = t;
  f.duration = 0;
  f.playing = true;
  f.sampleRate = SR;
  f.fftSize = s.fftSize;

  const bins = s.fftSize / 2;
  const binHz = SR / s.fftSize;

  // ── rhythm
  const bt = t / BEAT;
  const beatIdx = Math.floor(bt);
  const ph = bt - beatIdx;
  const sinceBeat = ph * BEAT;
  const x = sinceBeat / Math.max(0.02, s.beatDecay);
  const pulse = x < 1 ? (1 - x) * (1 - x) : 0;
  const kickEnv = Math.exp(-sinceBeat * 9);
  const offPh = ph >= 0.5 ? (ph - 0.5) * BEAT : 1;
  const hatEnv = Math.exp(-offPh * 30);
  const snare = beatIdx % 2 === 1 ? Math.exp(-sinceBeat * 14) : 0;
  f.beat = sinceBeat < 1 / 60;
  f.beatPulse = pulse;
  f.bpm = BPM;
  f.beatPhase = ph;
  f.beatCount = Math.max(0, beatIdx);

  // ── harmony / fundamental (with a short glide between arp notes)
  const cur = noteAt(t);
  const prev = noteAt(Math.max(0, cur.stepStart - 1e-3));
  const glide = clamp01((t - cur.stepStart) / 0.035);
  const nLog = prev.note + (cur.note - prev.note) * glide;
  const f0 = midi(nLog + 0.08 * Math.sin(t * 5.5)); // gentle vibrato
  const noteEnv = 0.55 + 0.45 * Math.exp(-(t - cur.stepStart) * 5);
  const bright = 0.5 + 0.5 * Math.sin(t * 0.21);

  let np = 0;
  for (let k = 1; k <= MAX_PARTIALS; k++) {
    const fk = f0 * k;
    if (fk > SR / 2 - binHz * 4) break;
    const breathe = 0.55 + 0.45 * Math.sin(t * (0.4 + 0.13 * k) + k * 1.7);
    partF[np] = fk;
    partA[np] = (noteEnv * breathe * Math.pow(k, -(1.3 - 0.6 * bright))) * 0.5;
    np++;
  }
  const bassF = midi(cur.ch[0] - 24);
  for (let k = 0; k < 4; k++) bassAmp[k] = (0.35 + 0.5 * kickEnv) / (k + 1) ** 1.2 * 0.6;

  // ── spectrum (dB)
  const db = f.spectrumDb;
  const tq = Math.floor(t * 30);
  let cNum = 0, cDen = 0;
  const floor = pinkFloor(bins, binHz);
  const kickHi = Math.floor(150 / binHz), snLo = Math.floor(1200 / binHz), snHi = Math.floor(6000 / binHz), hatLo = Math.floor(5000 / binHz);
  const hatDb = 26 * hatEnv, snDb = 20 * snare;
  for (let i = 0; i < bins; i++) {
    // pink-ish floor, −3 dB/oct, with texture
    let d = floor[i] + 2.5 * hash(i, tq);
    if (i < kickHi) d += 30 * kickEnv * (1 - i / kickHi) + 6; // kick thump
    else if (i >= hatLo) d += hatDb; // hats
    if (i > snLo && i < snHi) d += snDb; // snare body
    db[i] = d;
  }
  const lobe = (hz: number, amp: number) => {
    if (amp <= 0) return;
    const pdb = 20 * Math.log10(amp) - 6;
    const c = hz / binHz;
    const i0 = Math.max(0, Math.floor(c - 4));
    const i1 = Math.min(bins - 1, Math.ceil(c + 4));
    for (let i = i0; i <= i1; i++) {
      const dd = i - c;
      const v = pdb - 3.5 * dd * dd;
      if (v > db[i]) db[i] = v;
    }
  };
  for (let k = 0; k < np; k++) lobe(partF[k], partA[k]);
  for (let k = 0; k < 4; k++) lobe(bassF * (k + 1), bassAmp[k]);

  // normalize, centroid
  const spec = f.spectrum;
  const range = s.maxDb - s.minDb || 1;
  const cLo = Math.max(1, Math.floor(s.minFreq / binHz));
  const cHi = Math.min(bins - 1, Math.ceil(s.maxFreq / binHz));
  for (let i = 0; i < bins; i++) {
    const d = Math.max(DB_FLOOR, db[i]);
    db[i] = d;
    spec[i] = clamp01(((d - s.minDb) / range) * s.gain);
    if (i >= cLo && i <= cHi && (i & 3) === 0) {
      const m = Math.exp(d * LN10_20);
      cNum += i * m;
      cDen += m;
    }
  }
  f.centroid = cDen > 0 ? (cNum / cDen) * binHz : 0;
  f.centroidNorm = scalePos(f.centroid, s);
  bandMap.update(bins, binHz, s);
  computeBands(db, bandMap, s, f.bands, f.bandFreqs);

  // ── partials, peaks
  for (let k = 0; k < np; k++) {
    const d = 20 * Math.log10(partA[k]) - 6;
    partN[k] = clamp01(((d - s.minDb) / range) * s.gain);
  }
  partialPool.fill(f.partials, np, partF, partN);
  let nk = 0;
  const pushPeak = (hz: number, a: number) => {
    if (hz < s.minFreq || hz > s.maxFreq) return;
    if (nk < MAX_PEAKS || a > pkA[nk - 1]) {
      let j = nk < MAX_PEAKS ? nk++ : nk - 1;
      while (j > 0 && pkA[j - 1] < a) {
        pkA[j] = pkA[j - 1];
        pkF[j] = pkF[j - 1];
        j--;
      }
      pkA[j] = a;
      pkF[j] = hz;
    }
  };
  for (let k = 0; k < np; k++) pushPeak(partF[k], partN[k]);
  for (let k = 0; k < 4; k++) {
    const d = 20 * Math.log10(bassAmp[k]) - 6;
    pushPeak(bassF * (k + 1), clamp01(((d - s.minDb) / range) * s.gain));
  }
  peakPool.fill(f.peaks, nk, pkF, pkA);

  f.pitch.freq = f0;
  f.pitch.clarity = 0.75 + 0.15 * Math.sin(t * 0.7);
  f.pitch.norm = logPos(f0, s);

  // ── chroma: chord tones + current note + a little leakage
  const chroma = f.chroma;
  for (let i = 0; i < 12; i++) chroma[i] = 0.08 + 0.05 * (0.5 + 0.5 * Math.sin(t * 0.9 + i * 2.1));
  for (const n of cur.ch) chroma[n % 12] = Math.max(chroma[n % 12], 0.55 + 0.1 * Math.sin(t + n));
  chroma[((cur.note % 12) + 12) % 12] = 1;
  const pcFifth = (cur.note + 7) % 12;
  chroma[pcFifth] = Math.max(chroma[pcFifth], 0.3 * noteEnv);

  // ── waveform: harmonic sum + kick, via phasor rotation (no trig per sample)
  const w = f.waveform;
  w.fill(0);
  const nW = Math.min(np, 6);
  let norm = 0;
  for (let k = 0; k < nW; k++) {
    addSine(w, partF[k], 2 * Math.PI * partF[k] * (t % 1) + k, partA[k]);
    norm += partA[k];
  }
  addSine(w, 52, 0, 0.9 * kickEnv);
  norm += 0.9 * kickEnv;
  const level = 0.35 + 0.35 * pulse + 0.1 * Math.sin(t * 0.37);
  const g = norm > 0 ? level / norm : 0;
  let sq = 0, pk = 0;
  for (let i = 0; i < w.length; i++) {
    const v = w[i] * g + 0.02 * hatEnv * hash(i, tq);
    w[i] = v;
    sq += v * v;
    const a = v < 0 ? -v : v;
    if (a > pk) pk = a;
  }

  // ── scalars
  f.rms = clamp01(Math.sqrt(sq / w.length) * 2.2);
  f.peak = clamp01(pk);
  f.loudness = clamp01(0.5 + 0.28 * pulse + 0.12 * Math.sin(t * 0.23) + 0.06 * noteEnv);
  f.bass = clamp01(0.3 + 0.62 * kickEnv + 0.05 * Math.sin(t * 0.5));
  f.mid = clamp01(0.4 + 0.25 * noteEnv + 0.2 * snare + 0.1 * Math.sin(t * 0.8));
  f.treble = clamp01(0.18 + 0.55 * hatEnv + 0.25 * snare + 0.1 * bright);
  f.flux = clamp01(0.08 + 0.75 * kickEnv * kickEnv + 0.35 * Math.exp(-(t - cur.stepStart) * 20) + 0.3 * hatEnv);
  return f;
}
