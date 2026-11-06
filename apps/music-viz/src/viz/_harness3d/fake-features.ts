/**
 * Musical fake AudioFeatures for the 3D dev harness: 120 bpm kick, off-beat
 * hats, a moving melodic fundamental with a harmonic series whose timbre
 * slowly morphs, a pad chord, chroma derived from the spectrum.
 */
import type { AudioFeatures, Partial_ } from '../../core/types';

const SR = 48000;
const FFT = 4096;
const BINS = FFT / 2;
const BAND_COUNT = 64;
const MIN_F = 30;
const MAX_F = 16000;
const BIN_HZ = SR / FFT;
const MELODY = [57, 64, 69, 72, 76, 72, 69, 64, 55, 62, 67, 71, 74, 71, 67, 62, 53, 60, 65, 69, 72, 69, 65, 60, 52, 59, 64, 68, 71, 68, 64, 59];
const CHORDS = [[45, 52, 57, 60], [43, 50, 55, 59], [41, 48, 53, 57], [40, 47, 52, 56]];

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export function createFakeFeatures() {
  const f: AudioFeatures = {
    time: 0, duration: 180, playing: true, sampleRate: SR, fftSize: FFT,
    spectrum: new Float32Array(BINS), spectrumDb: new Float32Array(BINS), waveform: new Float32Array(FFT),
    bands: new Float32Array(BAND_COUNT), bandFreqs: new Float32Array(BAND_COUNT), chroma: new Float32Array(12),
    rms: 0, loudness: 0, peak: 0, bass: 0, mid: 0, treble: 0, centroid: 0, centroidNorm: 0, flux: 0,
    beat: false, beatPulse: 0, bpm: 120, beatPhase: 0, beatCount: 0,
    pitch: { freq: 220, clarity: 0.9, norm: 0.4 }, partials: [], peaks: [],
  };
  for (let i = 0; i < BAND_COUNT; i++) f.bandFreqs[i] = MIN_F * Math.pow(MAX_F / MIN_F, i / (BAND_COUNT - 1));
  const prevBands = new Float32Array(BAND_COUNT);
  const partials: Partial_[] = Array.from({ length: 12 }, () => ({ freq: 0, amp: 0 }));
  let lastBeat = -1;
  // deterministic noise
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

  const addPeak = (hz: number, amp: number, width = 1.6) => {
    const c = hz / BIN_HZ;
    const lo = Math.max(0, Math.floor(c - width * 3));
    const hi = Math.min(BINS - 1, Math.ceil(c + width * 3));
    for (let i = lo; i <= hi; i++) {
      const d = (i - c) / width;
      const v = amp * Math.exp(-d * d * 0.5);
      if (v > f.spectrum[i]) f.spectrum[i] = v;
    }
  };

  return function update(t: number): AudioFeatures {
    f.time = t;
    const beatLen = 0.5;
    const beatIdx = Math.floor(t / beatLen);
    const phase = t / beatLen - beatIdx;
    f.beat = beatIdx !== lastBeat;
    lastBeat = beatIdx;
    f.beatCount = beatIdx;
    f.beatPhase = phase;
    f.beatPulse = Math.pow(Math.max(0, 1 - (phase * beatLen) / 0.35), 2);
    const kick = Math.exp(-phase * 9);
    const hat = Math.exp(-Math.abs(phase - 0.5) * 30);

    // melody (16th-ish glide), timbre morph
    const noteIdx = Math.floor(t / (beatLen / 2)) % MELODY.length;
    const nf = (t / (beatLen / 2)) % 1;
    const prevNote = MELODY[(noteIdx + MELODY.length - 1) % MELODY.length];
    const m = MELODY[noteIdx] + (prevNote - MELODY[noteIdx]) * Math.exp(-nf * 18);
    const f0 = midiHz(m);
    const noteEnv = 0.55 + 0.45 * Math.exp(-nf * 3);
    const bright = 0.5 + 0.5 * Math.sin(t * 0.37);
    const swell = 0.75 + 0.25 * Math.sin(t * 0.13);

    f.spectrum.fill(0);
    for (let i = 1; i < BINS; i++) {
      const hz = i * BIN_HZ;
      f.spectrum[i] = 0.04 + 0.05 * Math.pow(60 / (hz + 60), 0.3) * rnd() + (hz > 5000 ? hat * 0.45 * (0.6 + 0.4 * rnd()) * Math.exp(-(hz - 9000) * (hz - 9000) / 2.5e7) : 0);
    }
    // kick
    for (let hz = 35; hz < 160; hz += BIN_HZ) addPeak(hz, kick * 0.95 * Math.exp(-((hz - 60) * (hz - 60)) / 2000), 2);
    // pad chord
    const chord = CHORDS[Math.floor(t / (beatLen * 8)) % CHORDS.length];
    for (const n of chord) for (let k = 1; k <= 4; k++) addPeak(midiHz(n) * k, (0.5 * swell) / (k * 1.3), 1.2);
    // melody partials
    for (let k = 1; k <= partials.length; k++) {
      const amp = Math.min(1, noteEnv * swell * Math.pow(k, -0.55 - (1 - bright) * 0.9) * (k % 2 === 0 ? 0.75 + 0.25 * bright : 1));
      partials[k - 1].freq = f0 * k;
      partials[k - 1].amp = amp;
      if (f0 * k < SR / 2) addPeak(f0 * k, amp, 1.4);
    }
    f.partials = partials;
    f.peaks = partials.slice(0, 8).slice().sort((a, b) => b.amp - a.amp);
    for (let i = 0; i < BINS; i++) {
      f.spectrum[i] = Math.min(1, f.spectrum[i]);
      f.spectrumDb[i] = -95 + f.spectrum[i] * 75;
    }

    // bands = max over band range
    let bass = 0, mid = 0, tre = 0, nb = 0, nm = 0, nt = 0, flux = 0, cen = 0, cenW = 0;
    for (let b = 0; b < BAND_COUNT; b++) {
      const hz = f.bandFreqs[b];
      const r = Math.pow(MAX_F / MIN_F, 0.5 / (BAND_COUNT - 1));
      const lo = Math.max(1, Math.floor(hz / r / BIN_HZ));
      const hi = Math.min(BINS - 1, Math.max(lo, Math.ceil((hz * r) / BIN_HZ)));
      let mx = 0;
      for (let i = lo; i <= hi; i++) mx = Math.max(mx, f.spectrum[i]);
      const v = mx * 0.85 + prevBands[b] * 0.15;
      flux += Math.max(0, v - prevBands[b]);
      prevBands[b] = v;
      f.bands[b] = v;
      cen += hz * v;
      cenW += v;
      if (hz < 250) { bass += v; nb++; } else if (hz < 4000) { mid += v; nm++; } else { tre += v; nt++; }
    }
    f.bass = bass / Math.max(1, nb);
    f.mid = mid / Math.max(1, nm);
    f.treble = tre / Math.max(1, nt);
    f.flux = Math.min(1, flux / 6);
    f.centroid = cen / Math.max(1e-6, cenW);
    f.centroidNorm = Math.log(f.centroid / MIN_F) / Math.log(MAX_F / MIN_F);
    f.rms = 0.25 + 0.25 * kick + 0.15 * noteEnv;
    f.loudness = Math.min(1, 0.35 + 0.35 * kick + 0.2 * noteEnv * swell);
    f.peak = Math.min(1, f.rms * 1.4);
    f.pitch.freq = f0;
    f.pitch.clarity = 0.85;
    f.pitch.norm = Math.log(f0 / MIN_F) / Math.log(MAX_F / MIN_F);

    // chroma
    f.chroma.fill(0);
    for (let i = 2; i < BINS; i++) {
      const hz = i * BIN_HZ;
      if (hz < 50 || hz > 5000) continue;
      const pc = ((Math.round(12 * Math.log2(hz / 440) + 9) % 12) + 12) % 12;
      f.chroma[pc] += f.spectrum[i] * f.spectrum[i];
    }
    let cm = 0;
    for (let i = 0; i < 12; i++) cm = Math.max(cm, f.chroma[i]);
    for (let i = 0; i < 12; i++) f.chroma[i] /= cm || 1;

    for (let i = 0; i < FFT; i++) {
      const s = i / SR;
      let v = 0;
      for (let k = 0; k < 5; k++) v += partials[k].amp * Math.sin(2 * Math.PI * partials[k].freq * s) * 0.3;
      v += kick * 0.5 * Math.sin(2 * Math.PI * 55 * s);
      f.waveform[i] = Math.max(-1, Math.min(1, v));
    }
    return f;
  };
}
