/**
 * Dev-only: a deterministic, musical fake AudioFeatures generator for the
 * 2D viz harness. 120 bpm, a chord progression, bass + pad + a gliding
 * melody with an evolving timbre, kick on the beat and hats on off-beats.
 */
import type { AudioFeatures, Partial_ } from '../../core/types';

const SR = 48000;
const FFT = 4096;
const BINS = FFT / 2;
const BANDS = 64;
const FMIN = 30;
const FMAX = 16000;

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// Am  F  C  G  Dm7  E7  (MIDI note sets for the pad, octave 4)
const CHORDS: number[][] = [
  [57, 60, 64], // Am
  [53, 57, 60], // F
  [48, 52, 55, 60], // C
  [55, 59, 62], // G
  [50, 53, 57, 60], // Dm7
  [52, 56, 59, 62], // E7
];
const MELODY = [76, 72, 74, 71, 69, 72, 76, 79, 77, 76, 74, 72, 71, 74, 76, 80, 81, 79, 77, 76, 74, 72, 71, 69];

function rand(i: number) {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export class FakeAudio {
  f: AudioFeatures;
  private prevSpec = new Float32Array(BINS);
  private lastBeat = -1;
  private melodyHz = 440;
  private bandLo = new Int32Array(BANDS);
  private bandHi = new Int32Array(BANDS);
  private notes: { hz: number; amp: number; harm: number; bright: number }[] = [];

  constructor() {
    const bandFreqs = new Float32Array(BANDS);
    for (let i = 0; i < BANDS; i++) {
      const lo = FMIN * Math.pow(FMAX / FMIN, i / BANDS);
      const hi = FMIN * Math.pow(FMAX / FMIN, (i + 1) / BANDS);
      bandFreqs[i] = Math.sqrt(lo * hi);
      this.bandLo[i] = Math.floor(lo / (SR / FFT));
      this.bandHi[i] = Math.max(this.bandLo[i] + 1, Math.ceil(hi / (SR / FFT)));
    }
    this.f = {
      time: 0, duration: 180, playing: true, sampleRate: SR, fftSize: FFT,
      spectrum: new Float32Array(BINS), spectrumDb: new Float32Array(BINS), waveform: new Float32Array(FFT),
      bands: new Float32Array(BANDS), bandFreqs, chroma: new Float32Array(12),
      rms: 0, loudness: 0, peak: 0, bass: 0, mid: 0, treble: 0, centroid: 0, centroidNorm: 0, flux: 0,
      beat: false, beatPulse: 0, bpm: 120, beatPhase: 0, beatCount: 0,
      pitch: { freq: 440, clarity: 0.9, norm: 0.5 }, partials: [], peaks: [],
    };
  }

  step(t: number): AudioFeatures {
    const f = this.f;
    f.time = t;
    const beatLen = 0.5;
    const beatIdx = Math.floor(t / beatLen);
    const sinceBeat = t - beatIdx * beatLen;
    f.beat = beatIdx !== this.lastBeat;
    this.lastBeat = beatIdx;
    f.beatCount = beatIdx;
    f.beatPhase = sinceBeat / beatLen;
    f.beatPulse = Math.max(0, 1 - sinceBeat / 0.35);
    const kick = Math.exp(-sinceBeat * 14);
    const hat = Math.exp(-Math.abs(sinceBeat - 0.25) * 40) * (sinceBeat > 0.25 ? 1 : 0.2);

    // dynamics: 16s sections, quiet bridge every 4th
    const section = Math.floor(t / 16) % 4;
    const dyn = section === 3 ? 0.55 : 0.85 + 0.15 * Math.sin(t * 0.4);

    const chord = CHORDS[Math.floor(t / 2) % CHORDS.length];
    const mIdx = beatIdx % MELODY.length;
    const target = mtof(MELODY[mIdx]);
    // glide
    this.melodyHz += (target - this.melodyHz) * Math.min(1, 0.35);
    const vib = 1 + 0.004 * Math.sin(t * 2 * Math.PI * 5.5);
    const mel = this.melodyHz * vib;
    const melEnv = 0.55 + 0.45 * Math.exp(-sinceBeat * 3);

    const notes = this.notes;
    notes.length = 0;
    notes.push({ hz: mtof(chord[0] - 24), amp: 0.9 * dyn * (0.6 + 0.4 * kick), harm: 8, bright: 0.7 });
    for (const m of chord) notes.push({ hz: mtof(m), amp: 0.42 * dyn, harm: 7, bright: 1.0 });
    // evolving timbre on the melody: odd/even emphasis sweeps
    const melBright = 0.5 + 0.45 * Math.sin(t * 0.21);
    notes.push({ hz: mel, amp: 0.8 * dyn * melEnv, harm: 14, bright: melBright });

    // spectrum
    const spec = f.spectrum;
    for (let i = 0; i < BINS; i++) {
      const hz = (i + 0.5) * (SR / FFT);
      const floor = 0.16 * Math.pow(Math.max(hz, 40) / 40, -0.35);
      spec[i] = floor * (0.75 + 0.5 * rand(i + beatIdx * 7.3 + Math.floor(t * 30)));
    }
    // kick 40..120
    for (let i = 1; i < 12; i++) spec[i] = Math.max(spec[i], 0.95 * kick * (1 - i / 14));
    // hats 6k..14k
    const hLo = Math.floor(6000 / (SR / FFT));
    const hHi = Math.floor(14000 / (SR / FFT));
    for (let i = hLo; i < hHi; i++) spec[i] = Math.max(spec[i], 0.45 * hat * (0.6 + 0.4 * rand(i * 3.1 + t)) * dyn);

    const peaks: Partial_[] = [];
    const chroma = f.chroma;
    chroma.fill(0);
    const binHz = SR / FFT;
    for (let n = 0; n < notes.length; n++) {
      const nt = notes[n];
      const pcIdx = Math.round(((12 * Math.log2(nt.hz / 440) + 9) % 12 + 12) % 12) % 12;
      chroma[pcIdx] += nt.amp;
      for (let k = 1; k <= nt.harm; k++) {
        const hz = nt.hz * k;
        if (hz > FMAX) break;
        const odd = k % 2 === 1 ? 1 : nt.bright;
        const a = nt.amp * odd * Math.pow(k, -0.9 + 0.5 * (nt.bright - 0.5));
        const b = hz / binHz;
        const b0 = Math.floor(b);
        for (let j = -3; j <= 3; j++) {
          const bi = b0 + j;
          if (bi < 0 || bi >= BINS) continue;
          const d = bi - b;
          const v = Math.sqrt(a) * Math.exp(-(d * d) / 1.6);
          if (v > spec[bi]) spec[bi] = v;
        }
        peaks.push({ freq: hz, amp: Math.min(1, Math.sqrt(a)) });
      }
    }
    let cmax = 0;
    for (let i = 0; i < 12; i++) cmax = Math.max(cmax, chroma[i]);
    if (cmax > 0) for (let i = 0; i < 12; i++) chroma[i] = Math.min(1, chroma[i] / cmax + 0.04 * rand(i + beatIdx));
    peaks.sort((a, b) => b.amp - a.amp);
    f.peaks = peaks.slice(0, 24);

    for (let i = 0; i < BINS; i++) {
      spec[i] = Math.min(1, spec[i]);
      f.spectrumDb[i] = -95 + spec[i] * 75;
    }

    // bands
    let bass = 0, mid = 0, treb = 0, nb = 0, nm = 0, nt2 = 0;
    for (let i = 0; i < BANDS; i++) {
      let m = 0;
      for (let b = this.bandLo[i]; b < this.bandHi[i] && b < BINS; b++) if (spec[b] > m) m = spec[b];
      // smooth between neighbours a bit
      f.bands[i] = f.bands[i] * 0.4 + m * 0.6;
      const fc = f.bandFreqs[i];
      if (fc < 250) { bass += f.bands[i]; nb++; } else if (fc < 4000) { mid += f.bands[i]; nm++; } else { treb += f.bands[i]; nt2++; }
    }
    f.bass = bass / nb;
    f.mid = mid / nm;
    f.treble = treb / nt2;

    // centroid, flux
    let num = 0, den = 0, flux = 0;
    for (let i = 0; i < BINS; i++) {
      num += spec[i] * (i + 0.5) * binHz;
      den += spec[i];
      const d = spec[i] - this.prevSpec[i];
      if (d > 0) flux += d;
      this.prevSpec[i] = spec[i];
    }
    f.centroid = den > 0 ? num / den : 0;
    f.centroidNorm = Math.min(1, Math.max(0, Math.log(Math.max(f.centroid, FMIN) / FMIN) / Math.log(FMAX / FMIN)));
    f.flux = Math.min(1, flux / 60);

    // waveform
    const wf = f.waveform;
    let sum = 0, pk = 0;
    for (let i = 0; i < FFT; i++) {
      const ts = t + i / SR;
      let s = 0;
      for (let n = 0; n < notes.length; n++) {
        const nt = notes[n];
        const w = 2 * Math.PI * nt.hz * ts;
        s += nt.amp * (Math.sin(w) + 0.5 * nt.bright * Math.sin(2 * w) + 0.33 * Math.sin(3 * w));
      }
      s += kick * 0.8 * Math.sin(2 * Math.PI * 55 * ts);
      s *= 0.28;
      wf[i] = s;
      sum += s * s;
      pk = Math.max(pk, Math.abs(s));
    }
    f.rms = Math.min(1, Math.sqrt(sum / FFT) * 1.6);
    f.peak = Math.min(1, pk);
    f.loudness = Math.min(1, (0.45 + 0.25 * kick) * dyn + 0.08 * Math.sin(t * 0.7));

    f.pitch = { freq: mel, clarity: 0.9, norm: Math.min(1, Math.max(0, Math.log2(mel / 55) / 5)) };
    const partials: Partial_[] = [];
    for (let k = 1; k <= 14; k++) {
      const odd = k % 2 === 1 ? 1 : melBright;
      partials.push({ freq: mel * k, amp: Math.min(1, melEnv * dyn * odd * Math.pow(k, -0.6 + 0.4 * (melBright - 0.5)) * (0.85 + 0.15 * Math.sin(t * 1.3 + k))) });
    }
    f.partials = partials;
    return f;
  }
}
