/**
 * Track overview for the transport's seek bar: per column peak, RMS and
 * spectral centroid (Hann-windowed 1024-pt FFT at the column centre).
 * Yields to the event loop between chunks so long tracks don't freeze the UI.
 */
import type { TrackOverview } from '../core/engine-api';
import { FFT, hann } from './fft';

const N = 1024;

const yieldFrame = () => new Promise<void>((r) => setTimeout(r, 0));

export async function computeOverview(buffer: AudioBuffer, columns = 1200, isCancelled: () => boolean = () => false): Promise<TrackOverview | null> {
  const len = buffer.length;
  const chans: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) chans.push(buffer.getChannelData(c));
  const nc = chans.length || 1;
  columns = Math.max(1, Math.min(columns, len));
  const peaks = new Float32Array(columns);
  const rms = new Float32Array(columns);
  const centroid = new Float32Array(columns);
  const fft = new FFT(N);
  const win = hann(N);
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  const binHz = buffer.sampleRate / N;
  const kLo = Math.max(1, Math.floor(20 / binHz));
  const kHi = Math.min(N / 2 - 1, Math.floor(16000 / binHz));
  const per = len / columns;
  let chunkStart = performance.now();

  for (let col = 0; col < columns; col++) {
    const s0 = Math.floor(col * per);
    const s1 = Math.min(len, Math.floor((col + 1) * per));
    let pk = 0;
    let sq = 0;
    for (let c = 0; c < nc; c++) {
      const d = chans[c];
      for (let i = s0; i < s1; i++) {
        const v = d[i];
        const a = v < 0 ? -v : v;
        if (a > pk) pk = a;
        sq += v * v;
      }
    }
    peaks[col] = Math.min(1, pk);
    rms[col] = Math.min(1, Math.sqrt(sq / Math.max(1, (s1 - s0) * nc)));

    // centroid
    const mid = (s0 + s1) >> 1;
    const start = mid - N / 2;
    for (let i = 0; i < N; i++) {
      const j = start + i;
      let v = 0;
      if (j >= 0 && j < len) {
        for (let c = 0; c < nc; c++) v += chans[c][j];
        v /= nc;
      }
      re[i] = v * win[i];
      im[i] = 0;
    }
    fft.transform(re, im);
    let num = 0;
    let den = 0;
    for (let k = kLo; k <= kHi; k++) {
      const m = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      num += k * m;
      den += m;
    }
    centroid[col] = den > 1e-9 ? (num / den) * binHz : col > 0 ? centroid[col - 1] : 0;

    if (performance.now() - chunkStart > 12) {
      await yieldFrame();
      if (isCancelled()) return null;
      chunkStart = performance.now();
    }
  }
  return { columns, peaks, rms, centroid };
}
