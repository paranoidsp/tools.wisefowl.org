/**
 * Onset / beat tracker.
 *
 * - Onsets: an onset-detection value (normalized spectral flux, weighted to
 *   the low band) is compared against an adaptive threshold (mean + k·std of
 *   the last ~1 s), with hysteresis and a refractory period.
 * - Tempo: every onset re-scores a 60–200 BPM histogram from the intervals
 *   between all recent onset pairs (each interval may span 1–4 beats), with a
 *   mild prior around 120 BPM. Reported once the peak is clearly dominant.
 * - Phase: a beat grid anchored on onsets that land near the predicted beat.
 */
const MIN_BPM = 60;
const MAX_BPM = 200;
const HIST_LEN = 64;
const ONSET_CAP = 64;
const WINDOW_S = 10;
/** onsets needed in the window before a tempo is reported */
const MIN_ONSETS = 7;
const SPAN_W = [0, 1, 0.6, 0.4, 0.3];

export class BeatTracker {
  private hist = new Float32Array(HIST_LEN);
  private histPos = 0;
  private histN = 0;
  private onsets = new Float64Array(ONSET_CAP);
  private onsetPos = 0;
  private onsetN = 0;
  private scratch = new Float64Array(ONSET_CAP);
  private tempo = new Float32Array(MAX_BPM - MIN_BPM + 1);
  private prior = new Float32Array(MAX_BPM - MIN_BPM + 1);
  private above = false;
  private lastBeat = -1e9;
  private sinceBeat = 1e9;
  private anchor = 0;
  private misses = 0;
  private pending = 0;
  private pendingN = 0;

  bpm: number | null = null;
  confidence = 0;
  count = 0;
  pulse = 0;
  phase = 0;

  constructor() {
    for (let i = 0; i < this.prior.length; i++) {
      const o = Math.log2((MIN_BPM + i) / 120);
      this.prior[i] = Math.exp(-0.5 * (o / 0.9) ** 2);
    }
  }

  reset(keepCount = false) {
    this.histPos = this.histN = 0;
    this.onsetPos = this.onsetN = 0;
    this.above = false;
    this.lastBeat = -1e9;
    this.sinceBeat = 1e9;
    this.bpm = null;
    this.confidence = 0;
    this.misses = 0;
    this.pendingN = 0;
    this.phase = 0;
    if (!keepCount) this.count = 0;
  }

  /**
   * @param odf onset detection value (≈0..1, adaptive-normalized)
   * @param now monotonic seconds
   * @param active false while paused: no onsets, phase frozen
   * @returns true if an onset fired this frame
   */
  step(odf: number, now: number, dt: number, active: boolean, sensitivity: number, decay: number): boolean {
    // adaptive threshold from history (excluding the current value)
    let mean = 0;
    let sq = 0;
    const n = this.histN;
    for (let i = 0; i < n; i++) {
      const v = this.hist[i];
      mean += v;
      sq += v * v;
    }
    if (n > 0) {
      mean /= n;
      sq = Math.sqrt(Math.max(0, sq / n - mean * mean));
    }
    const sens = Math.min(1, Math.max(0, sensitivity));
    const k = 0.35 + (1 - sens) * 2.2;
    const thr = Math.max(mean + k * sq, 0.1 + (1 - sens) * 0.35);

    let beat = false;
    const period = this.bpm ? 60 / this.bpm : 0.5;
    const refractory = Math.max(0.16, period * 0.4);
    if (active) {
      if (odf > thr) {
        if (!this.above && now - this.lastBeat > refractory) {
          beat = true;
          this.onOnset(now);
        }
        this.above = true;
      } else if (odf < Math.max(mean, thr * 0.6)) {
        this.above = false;
      }
    } else {
      this.above = false;
      this.anchor += dt; // freeze phase while paused
    }
    this.hist[this.histPos] = odf;
    this.histPos = (this.histPos + 1) % HIST_LEN;
    if (this.histN < HIST_LEN) this.histN++;

    // pulse
    if (beat) this.sinceBeat = 0;
    else this.sinceBeat += dt;
    const x = this.sinceBeat / Math.max(0.02, decay);
    this.pulse = x < 1 ? (1 - x) * (1 - x) : 0;

    // phase
    if (this.bpm) {
      const P = 60 / this.bpm;
      let ph = (now - this.anchor) / P;
      ph -= Math.floor(ph);
      this.phase = ph;
    } else {
      this.phase = 0;
    }
    return beat;
  }

  private onOnset(t: number) {
    this.lastBeat = t;
    this.count++;
    this.onsets[this.onsetPos] = t;
    this.onsetPos = (this.onsetPos + 1) % ONSET_CAP;
    if (this.onsetN < ONSET_CAP) this.onsetN++;

    // phase lock
    if (this.bpm) {
      const P = 60 / this.bpm;
      let ph = (t - this.anchor) / P;
      ph -= Math.floor(ph);
      const err = ph > 0.5 ? ph - 1 : ph;
      if (Math.abs(err) < 0.22) {
        this.anchor += err * P * 0.5;
        this.misses = 0;
      } else if (++this.misses >= 4) {
        this.anchor = t;
        this.misses = 0;
      }
    } else {
      this.anchor = t;
    }
    this.estimateTempo(t);
  }

  private estimateTempo(now: number) {
    // chronological copy of onsets within the window
    let m = 0;
    for (let i = 0; i < this.onsetN; i++) {
      const idx = (this.onsetPos - this.onsetN + i + ONSET_CAP) % ONSET_CAP;
      const t = this.onsets[idx];
      if (t >= now - WINDOW_S) this.scratch[m++] = t;
    }
    if (m < MIN_ONSETS) {
      if (m < 3) this.bpm = null;
      return;
    }
    const h = this.tempo;
    h.fill(0);
    const L = h.length;
    for (let i = 0; i < m; i++) {
      for (let j = i + 1; j < m; j++) {
        const d = this.scratch[j] - this.scratch[i];
        if (d < 0.25) continue;
        if (d > 3.2) break;
        for (let span = 1; span <= 4; span++) {
          const T = (60 * span) / d;
          if (T < MIN_BPM - 3 || T > MAX_BPM + 3) continue;
          const sigma = Math.max(0.8, (T * 0.02) / d);
          const w = SPAN_W[span];
          const c = T - MIN_BPM;
          const r = Math.ceil(sigma * 2.5);
          const c0 = Math.max(0, Math.floor(c - r));
          const c1 = Math.min(L - 1, Math.ceil(c + r));
          // compact gaussian-ish kernel (1 − (e/r)²)², no exp in the hot loop
          const invR2 = 1 / (r * r);
          for (let b = c0; b <= c1; b++) {
            const e = b - c;
            const q = 1 - e * e * invR2;
            if (q > 0) h[b] += w * q * q;
          }
        }
      }
    }
    let best = -1;
    let bestV = 0;
    let sum = 0;
    for (let b = 0; b < L; b++) {
      const v = h[b] * this.prior[b];
      h[b] = v;
      sum += v;
      if (v > bestV) {
        bestV = v;
        best = b;
      }
    }
    if (best < 0 || sum <= 0) return;
    const conf = bestV / (sum / L);
    this.confidence = conf;
    let est = MIN_BPM + best;
    if (best > 0 && best < L - 1) est += parabola(h[best - 1], h[best], h[best + 1]);
    if (conf < 4) {
      if (conf < 2.5) this.bpm = null;
      return;
    }
    if (this.bpm == null) {
      this.bpm = est;
    } else if (Math.abs(est - this.bpm) < 4) {
      this.bpm += (est - this.bpm) * 0.35;
      this.pendingN = 0;
    } else {
      // require a few consistent estimates before switching tempo
      if (this.pendingN > 0 && Math.abs(est - this.pending) < 4) this.pendingN++;
      else {
        this.pending = est;
        this.pendingN = 1;
      }
      if (this.pendingN >= 3) {
        this.bpm = est;
        this.pendingN = 0;
      }
    }
  }
}

function parabola(a: number, b: number, c: number): number {
  const d = a - 2 * b + c;
  if (d === 0) return 0;
  const p = (0.5 * (a - c)) / d;
  return p < -0.5 ? -0.5 : p > 0.5 ? 0.5 : p;
}
