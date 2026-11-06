/**
 * Live feature extraction: dB spectrum + waveform (from the AnalyserNode) →
 * AudioFeatures. Stateful (adaptive normalizers, smoothing, beat tracking),
 * allocation-free per frame: every array is reused and only reallocated when
 * fftSize / bandCount change. The returned object is mutated each frame.
 */
import type { AnalysisSettings, AudioFeatures } from '../core/types';
import { BeatTracker } from './beat';
import {
  BandMap,
  DB_FLOOR,
  MAX_PARTIALS,
  MAX_PEAKS,
  PartialPool,
  aWeightPower,
  computeBands,
  createFeatures,
  ensureFeatureSizes,
  logPos,
  parabolicOffset,
  scalePos,
} from './spectral';

const LN10_20 = Math.LN10 / 20;
const CAND_PEAKS = 32;
/** dB (A-weighted power sum of analyser bins) treated as silence */
const LOUD_FLOOR = -75;
const FLUX_FLOOR = 0.004;
const LOW_FLUX_FLOOR = 0.08;
const CHROMA_LO = 50;
const CHROMA_HI = 4200;
const PITCH_LO = 40;
const PITCH_HI = 2000;

/**
 * Adaptive dB → 0..1 normalizer. Tracks the typical level (asymmetric
 * one-pole in dB: rises over ~1.5 s, falls over ~5 s) and maps it to
 * `anchor`; `span` dB above/below that covers the rest of the range. So a
 * quiet track still moves, transients reach 1, and silence reads 0 (the
 * tracked level never drops below `floor`).
 */
class AutoNorm {
  level = NaN;
  constructor(private span: number, private anchor = 0.6) {}
  reset() {
    this.level = NaN;
  }
  step(db: number, dt: number, floor: number): number {
    if (Number.isNaN(this.level)) this.level = floor;
    const tau = db > this.level ? 1.5 : 5;
    this.level += (db - this.level) * (1 - Math.exp(-dt / tau));
    if (this.level < floor) this.level = floor;
    const v = this.anchor + (db - this.level) / this.span;
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }
}

/** Envelope follower for linear values (flux). */
class Envelope {
  v = 0;
  step(x: number, dt: number, tau: number, floor: number): number {
    this.v = Math.max(x, this.v * Math.exp(-dt / tau), floor);
    return this.v;
  }
}

function smoothK(fs: number, dt: number): number {
  // per-frame mixing coefficient for a one-pole filter, frame-rate independent
  const c = Math.min(0.99, Math.max(0, fs));
  return 1 - Math.pow(c, dt * 60);
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export class FeatureExtractor {
  readonly f: AudioFeatures;
  /** typed views the engine fills from the AnalyserNode */
  db: Float32Array<ArrayBuffer>;
  wave: Float32Array<ArrayBuffer>;

  private mag = new Float32Array(0);
  private prevNorm = new Float32Array(0);
  private aw = new Float32Array(0);
  private awKey = '';
  private bandMap = new BandMap();
  private beat = new BeatTracker();
  private peakPool = new PartialPool(MAX_PEAKS);
  private partialPool = new PartialPool(MAX_PARTIALS);

  // peak candidates (sorted desc by linear amplitude)
  private pkF = new Float32Array(CAND_PEAKS);
  private pkA = new Float32Array(CAND_PEAKS); // linear magnitude
  private pkN = new Float32Array(CAND_PEAKS); // normalized 0..1
  private pkCount = 0;
  private chromaRaw = new Float32Array(12);
  private partF = new Float32Array(MAX_PARTIALS);
  private partA = new Float32Array(MAX_PARTIALS);
  private outF = new Float32Array(MAX_PEAKS);
  private outA = new Float32Array(MAX_PEAKS);

  private nLoud = new AutoNorm(22);
  private nBass = new AutoNorm(20);
  private nMid = new AutoNorm(20);
  private nTreble = new AutoNorm(20);
  /** raw values from the last frame, for calibration / debugging */
  readonly debug = { loudDb: 0, bassDb: 0, midDb: 0, trebDb: 0, flux: 0, lowFlux: 0, odf: 0, loudLevel: 0 };
  private envFlux = new Envelope();
  private envLow = new Envelope();
  private pitchLog = 0;
  private lastNow = 0;
  private framesSinceReset = 0;

  constructor(fftSize = 4096, bandCount = 64) {
    this.f = createFeatures(fftSize, bandCount);
    this.db = this.f.spectrumDb as Float32Array<ArrayBuffer>;
    this.wave = this.f.waveform as Float32Array<ArrayBuffer>;
    this.resizeInternal(fftSize);
  }

  /** Make arrays match the settings; returns the views to fill. */
  prepare(s: AnalysisSettings) {
    if (ensureFeatureSizes(this.f, s.fftSize, s.bandCount)) {
      this.db = this.f.spectrumDb as Float32Array<ArrayBuffer>;
      this.wave = this.f.waveform as Float32Array<ArrayBuffer>;
      this.resizeInternal(s.fftSize);
    }
    return this;
  }

  private resizeInternal(fftSize: number) {
    const bins = fftSize / 2;
    if (this.mag.length !== bins) {
      this.mag = new Float32Array(bins);
      this.prevNorm = new Float32Array(bins);
      this.awKey = '';
      this.framesSinceReset = 0; // avoid a bogus flux spike / beat after resizing
    }
  }

  /** Reset tempo / adaptive state (call on new source). */
  reset() {
    this.beat.reset();
    this.nLoud.reset();
    this.nBass.reset();
    this.nMid.reset();
    this.nTreble.reset();
    this.pitchLog = 0;
    this.f.pitch.freq = 0;
    this.f.pitch.clarity = 0;
    this.envFlux.v = 0;
    this.envLow.v = 0;
    this.framesSinceReset = 0;
  }

  /** Decay the buffers toward silence (used when no live analyser data). */
  decay(dt: number) {
    const db = this.db;
    const drop = 90 * dt;
    for (let i = 0; i < db.length; i++) db[i] = Math.max(DB_FLOOR, db[i] - drop);
    const w = this.wave;
    const k = Math.pow(0.02, dt);
    for (let i = 0; i < w.length; i++) w[i] *= k;
  }

  /**
   * Compute all features from this.db / this.wave (already filled).
   * @param now monotonic seconds (performance.now()/1000)
   * @param active whether a source is currently producing sound
   */
  process(s: AnalysisSettings, sampleRate: number, now: number, time: number, duration: number, playing: boolean, active: boolean): AudioFeatures {
    const f = this.f;
    let dt = this.lastNow ? now - this.lastNow : 1 / 60;
    if (!(dt > 0)) dt = 1 / 60;
    if (dt > 0.25) dt = 0.25;
    this.lastNow = now;
    this.framesSinceReset++;

    f.time = time;
    f.duration = duration;
    f.playing = playing;
    f.sampleRate = sampleRate;
    f.fftSize = s.fftSize;

    const db = this.db;
    const bins = db.length;
    const binHz = sampleRate / s.fftSize;
    const nyq = sampleRate / 2;
    const spec = f.spectrum;
    const mag = this.mag;
    const prev = this.prevNorm;
    const range = s.maxDb - s.minDb || 1;
    const gain = s.gain;

    if (this.awKey !== `${bins}|${binHz}`) {
      this.awKey = `${bins}|${binHz}`;
      if (this.aw.length !== bins) this.aw = new Float32Array(bins);
      for (let i = 0; i < bins; i++) this.aw[i] = aWeightPower(i * binHz);
    }
    const aw = this.aw;

    // ── per-bin pass: normalize, linear magnitude, energies, centroid, flux
    const bassHi = Math.min(bins - 1, Math.floor(250 / binHz));
    const midHi = Math.min(bins - 1, Math.floor(4000 / binHz));
    const lowFluxHi = Math.max(2, Math.min(bins - 1, Math.floor(180 / binHz)));
    const cLo = Math.max(1, Math.floor(s.minFreq / binHz));
    const cHi = Math.min(bins - 1, Math.ceil(s.maxFreq / binHz));
    const bassLo = Math.max(1, Math.floor(20 / binHz));
    let pA = 0, pBass = 0, pMid = 0, pTreb = 0;
    let cNum = 0, cDen = 0;
    let flux = 0, lowFlux = 0;
    let maxDb = DB_FLOOR;
    for (let i = 0; i < bins; i++) {
      let d = db[i];
      if (!(d > DB_FLOOR)) d = db[i] = DB_FLOOR; // also catches -Infinity / NaN
      if (d > maxDb && i > 0) maxDb = d;
      let x = ((d - s.minDb) / range) * gain;
      x = x < 0 ? 0 : x > 1 ? 1 : x;
      const dx = x - prev[i];
      if (dx > 0) {
        flux += dx;
        if (i <= lowFluxHi) lowFlux += dx;
      }
      prev[i] = x;
      spec[i] = x;
      const m = Math.exp(d * LN10_20);
      mag[i] = m;
      const p = m * m;
      pA += p * aw[i];
      if (i >= bassLo) {
        if (i <= bassHi) pBass += p;
        else if (i <= midHi) pMid += p;
        else pTreb += p;
      }
      if (i >= cLo && i <= cHi) {
        cNum += i * m;
        cDen += m;
      }
    }
    flux /= bins;
    lowFlux /= lowFluxHi + 1;

    // ── waveform: rms / peak
    const w = this.wave;
    let sumSq = 0;
    let pk = 0;
    for (let i = 0; i < w.length; i++) {
      const v = w[i];
      sumSq += v * v;
      const a = v < 0 ? -v : v;
      if (a > pk) pk = a;
    }
    const rmsLin = Math.sqrt(sumSq / (w.length || 1));

    // ── adaptive normalization
    const toDb = (p: number) => 10 * Math.log10(p + 1e-20);
    const loudDb = toDb(pA);
    const bassDb = toDb(pBass), midDb = toDb(pMid), trebDb = toDb(pTreb);
    const loudN = this.nLoud.step(loudDb, dt, LOUD_FLOOR);
    // band levels are never normalized above (overall level − offset), so a
    // track with almost no treble doesn't get its treble blown up to 1
    const ref = this.nLoud.level;
    const bassN = this.nBass.step(bassDb, dt, Math.max(LOUD_FLOOR, ref - 12));
    const midN = this.nMid.step(midDb, dt, Math.max(LOUD_FLOOR, ref - 12));
    const trebN = this.nTreble.step(trebDb, dt, Math.max(LOUD_FLOOR - 6, ref - 22));
    const rmsN = rmsLin * 2.5;
    const dbg = this.debug;
    dbg.loudDb = loudDb; dbg.bassDb = bassDb; dbg.midDb = midDb; dbg.trebDb = trebDb; dbg.loudLevel = ref;

    const fs = s.featureSmoothing;
    const k = smoothK(fs, dt);
    const kFast = smoothK(fs * 0.6, dt);
    f.loudness += (clamp01(loudN * gain) - f.loudness) * k;
    f.bass += (clamp01(bassN * gain) - f.bass) * kFast;
    f.mid += (clamp01(midN * gain) - f.mid) * kFast;
    f.treble += (clamp01(trebN * gain) - f.treble) * kFast;
    f.rms += (clamp01(rmsN * gain) - f.rms) * kFast;
    const pkTarget = clamp01(pk * gain);
    f.peak = pkTarget > f.peak ? pkTarget : f.peak + (pkTarget - f.peak) * k;

    // centroid (smoothed in log-frequency)
    const audible = maxDb > s.minDb;
    if (cDen > 0 && audible) {
      const c = Math.max(20, (cNum / cDen) * binHz);
      f.centroid = f.centroid > 0 ? Math.exp(Math.log(f.centroid) + (Math.log(c) - Math.log(f.centroid)) * k) : c;
    }
    f.centroidNorm = scalePos(f.centroid, s);

    // flux (normalized by a slowly-decaying envelope)
    dbg.flux = flux; dbg.lowFlux = lowFlux;
    const fluxEnv = this.envFlux.step(flux, dt, 6, FLUX_FLOOR);
    const lowEnv = this.envLow.step(lowFlux, dt, 6, LOW_FLUX_FLOOR);
    const fluxN = flux / fluxEnv;
    const lowN = lowFlux / lowEnv;
    f.flux += (fluxN - f.flux) * smoothK(fs * 0.5, dt);

    // ── beat
    const odf = this.framesSinceReset > 3 ? 0.6 * lowN + 0.4 * fluxN : 0;
    dbg.odf = odf;
    const gate = active && f.loudness > 0.04 && audible;
    f.beat = this.beat.step(gate ? odf : 0, now, dt, active, s.beatSensitivity, s.beatDecay);
    f.beatPulse = this.beat.pulse;
    f.bpm = this.beat.bpm != null ? Math.round(this.beat.bpm * 10) / 10 : null;
    f.beatPhase = this.beat.phase;
    f.beatCount = this.beat.count;

    // ── peaks + chroma (single scan over local maxima)
    this.scanPeaks(s, binHz, maxDb);

    // ── pitch + partials
    this.estimatePitch(s, binHz, nyq, k, audible);

    // ── bands
    this.bandMap.update(bins, binHz, s);
    computeBands(db, this.bandMap, s, f.bands, f.bandFreqs);
    return f;
  }

  private scanPeaks(s: AnalysisSettings, binHz: number, maxDb: number) {
    const f = this.f;
    const db = this.db;
    const mag = this.mag;
    const bins = db.length;
    const lo = Math.max(2, Math.floor(Math.min(s.minFreq, CHROMA_LO) / binHz));
    const hi = Math.min(bins - 2, Math.ceil(Math.max(s.maxFreq, CHROMA_HI) / binHz));
    const floor = Math.max(s.minDb, maxDb - 50);
    const range = s.maxDb - s.minDb || 1;
    const cr = this.chromaRaw;
    cr.fill(0);
    let count = 0;
    const pkF = this.pkF, pkA = this.pkA, pkN = this.pkN;
    const peakLo = s.minFreq, peakHi = s.maxFreq;
    for (let i = lo; i <= hi; i++) {
      const b = db[i];
      if (b <= floor || b < db[i - 1] || b <= db[i + 1]) continue;
      const a = db[i - 1], c = db[i + 1];
      const p = parabolicOffset(a, b, c);
      const freq = (i + p) * binHz;
      const pdb = b - 0.25 * (a - c) * p;
      const lin = Math.exp(pdb * LN10_20);
      // chroma: spread to the two nearest pitch classes
      if (freq >= CHROMA_LO && freq <= CHROMA_HI) {
        let pc = 12 * Math.log2(freq / 440) + 9;
        pc = ((pc % 12) + 12) % 12;
        const p0 = Math.floor(pc);
        const fr = pc - p0;
        // weight by linear magnitude, but compress so bass doesn't swamp
        const wgt = Math.sqrt(mag[i]);
        cr[p0 % 12] += wgt * (1 - fr);
        cr[(p0 + 1) % 12] += wgt * fr;
      }
      if (freq < peakLo || freq > peakHi) continue;
      // insert into top-N by linear amplitude
      if (count < CAND_PEAKS || lin > pkA[count - 1]) {
        let j = count < CAND_PEAKS ? count++ : count - 1;
        while (j > 0 && pkA[j - 1] < lin) {
          pkA[j] = pkA[j - 1];
          pkF[j] = pkF[j - 1];
          pkN[j] = pkN[j - 1];
          j--;
        }
        pkA[j] = lin;
        pkF[j] = freq;
        let n = (pdb - s.minDb) / range * s.gain;
        pkN[j] = n < 0 ? 0 : n > 1 ? 1 : n;
      }
    }
    this.pkCount = count;

    // peaks output (top MAX_PEAKS, normalized amplitude)
    const nOut = Math.min(MAX_PEAKS, count);
    for (let i = 0; i < nOut; i++) {
      this.outF[i] = pkF[i];
      this.outA[i] = pkN[i];
    }
    this.peakPool.fill(f.peaks, nOut, this.outF, this.outA);

    // chroma: max-normalize, then smooth
    let cmax = 0;
    for (let i = 0; i < 12; i++) if (cr[i] > cmax) cmax = cr[i];
    const audible = maxDb > s.minDb + 6;
    const kc = smoothK(Math.max(0.3, s.featureSmoothing), 1 / 60);
    for (let i = 0; i < 12; i++) {
      const target = audible && cmax > 0 ? cr[i] / cmax : f.chroma[i] * 0.9;
      f.chroma[i] += (target - f.chroma[i]) * kc;
    }
  }

  private estimatePitch(s: AnalysisSettings, binHz: number, nyq: number, k: number, audible: boolean) {
    const f = this.f;
    const n = this.pkCount;
    const pkF = this.pkF, pkA = this.pkA;
    let bestF = 0;
    let bestScore = 0;
    if (n > 0 && audible) {
      const amax = pkA[0] || 1;
      const nCand = Math.min(n, 10);
      for (let ci = 0; ci < nCand; ci++) {
        const pf = pkF[ci];
        if (pf > 2500) continue;
        for (let div = 1; div <= 5; div++) {
          const c = pf / div;
          if (c < PITCH_LO || c > PITCH_HI) continue;
          let score = 0;
          for (let j = 0; j < n; j++) {
            const r = pkF[j] / c;
            const h = Math.round(r);
            if (h < 1 || h > 12) continue;
            const dev = r / h - 1;
            if (dev > 0.025 || dev < -0.025) continue;
            score += pkA[j] / amax / h;
          }
          if (score > bestScore) {
            bestScore = score;
            bestF = c;
          }
        }
      }
      if (bestF > 0) {
        // refine from matched harmonics; also measure harmonic energy fraction
        let num = 0, den = 0, eMatch = 0, eTot = 0;
        for (let j = 0; j < n; j++) {
          const a = pkA[j];
          eTot += a * a;
          const r = pkF[j] / bestF;
          const h = Math.round(r);
          if (h < 1 || h > 12) continue;
          const dev = r / h - 1;
          if (dev > 0.025 || dev < -0.025) continue;
          const wgt = a / h;
          num += (pkF[j] / h) * wgt;
          den += wgt;
          eMatch += a * a;
        }
        if (den > 0) bestF = num / den;
        const harmonicity = eTot > 0 ? eMatch / eTot : 0;
        const level = clamp01((f.loudness - 0.05) / 0.25);
        const clarity = clamp01(harmonicity * Math.min(1, bestScore / 0.8)) * level;
        f.pitch.clarity += (clarity - f.pitch.clarity) * Math.max(k, 0.3);
      } else {
        f.pitch.clarity *= 0.9;
      }
    } else {
      f.pitch.clarity *= 0.9;
    }

    // track pitch in log domain; hold when unclear
    if (bestF > 0 && f.pitch.clarity > 0.15) {
      const lf = Math.log(bestF);
      if (this.pitchLog === 0 || Math.abs(lf - this.pitchLog) > 0.06) this.pitchLog = lf; // > 1 semitone: jump
      else this.pitchLog += (lf - this.pitchLog) * Math.max(0.35, k);
      f.pitch.freq = Math.exp(this.pitchLog);
    }
    f.pitch.norm = logPos(f.pitch.freq, s);

    // partials of the (held) fundamental
    const f0 = f.pitch.freq;
    let np = 0;
    if (f0 > 0) {
      const db = this.db;
      const bins = db.length;
      const range = s.maxDb - s.minDb || 1;
      const lim = Math.min(nyq, Math.max(s.maxFreq, f0));
      for (let h = 1; h <= MAX_PARTIALS; h++) {
        const fh = h * f0;
        if (fh > lim) break;
        const c = fh / binHz;
        const r = Math.max(1, Math.round((fh * 0.03) / binHz));
        const i0 = Math.max(1, Math.round(c) - r);
        const i1 = Math.min(bins - 2, Math.round(c) + r);
        let bi = i0;
        for (let i = i0 + 1; i <= i1; i++) if (db[i] > db[bi]) bi = i;
        let freq = fh;
        let pdb = db[bi];
        if (bi > i0 && bi < i1) {
          const p = parabolicOffset(db[bi - 1], db[bi], db[bi + 1]);
          freq = (bi + p) * binHz;
          pdb = db[bi] - 0.25 * (db[bi - 1] - db[bi + 1]) * p;
        }
        const a = ((pdb - s.minDb) / range) * s.gain;
        this.partF[np] = freq;
        this.partA[np] = a < 0 ? 0 : a > 1 ? 1 : a;
        np++;
      }
    }
    this.partialPool.fill(f.partials, np, this.partF, this.partA);
  }
}
