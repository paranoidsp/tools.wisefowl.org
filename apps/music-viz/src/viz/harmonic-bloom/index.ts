/**
 * Harmonic Bloom — the flagship mapping from the founding conversation:
 * a colour blob for the fundamental, ringed by its harmonic series.
 */
import type { RGB, VizDefinition } from '../../core/types';
import { TAU, bool, expandAmp, clamp, dominantFreq, follow, hexToRgb, lift, num, rgba, smoothK, str } from '../_lib2d/util';

const MAXK = 16;
const SEG = 144;

const viz: VizDefinition = {
  id: 'harmonic-bloom',
  name: 'Harmonic Bloom',
  description:
    'The fundamental becomes a glowing blob (colour = its frequency, size = loudness); each harmonic k·f₀ becomes a ring around it, coloured by its own frequency with thickness set by how loud that partial is — so timbre reads as a pattern of coloured rings.',
  renderer: 'canvas2d',
  space: '2d',
  tags: ['harmonics', 'timbre', 'pitch', 'flagship'],
  params: [
    { key: 'rings', label: 'Harmonics shown', type: 'number', min: 1, max: MAXK - 1, step: 1, default: 8, group: 'Rings', hint: 'Rings for harmonics k = 2 … N+1' },
    {
      key: 'spacing', label: 'Ring spacing', type: 'select', default: 'octave', group: 'Rings',
      hint: 'How harmonic number maps to radius',
      options: [
        { value: 'even', label: 'Even (k)' },
        { value: 'octave', label: 'Octave (log₂ k) — octaves equally spaced' },
        { value: 'area', label: 'Equal area (√k)' },
        { value: 'wavelength', label: 'Wavelength (1 − 1/k) — converging' },
      ],
    },
    { key: 'outer', label: 'Outer radius', type: 'number', min: 0.2, max: 1.2, step: 0.01, default: 0.85, group: 'Rings', hint: 'Radius of the last ring, as a fraction of half the stage' },
    { key: 'thickness', label: 'Ring thickness', type: 'number', min: 0.5, max: 40, step: 0.5, default: 8, unit: 'px', group: 'Rings', hint: 'Thickness of a full-amplitude partial' },
    {
      key: 'style', label: 'Ring style', type: 'select', default: 'glow', group: 'Rings',
      options: [
        { value: 'glow', label: 'Glow (soft + core)' },
        { value: 'line', label: 'Line' },
        { value: 'band', label: 'Band (filled annulus)' },
        { value: 'dots', label: 'Beads' },
      ],
    },
    { key: 'softness', label: 'Softness', type: 'number', min: 0, max: 1, step: 0.01, default: 0.6, group: 'Rings', hint: 'Width of the soft halo around each ring' },
    { key: 'lobes', label: 'Standing-wave lobes', type: 'number', min: 0, max: 1, step: 0.01, default: 0.06, group: 'Rings', hint: 'Ring k wobbles with k lobes, scaled by its amplitude' },
    { key: 'spin', label: 'Spin', type: 'number', min: -3, max: 3, step: 0.01, default: 0.35, unit: 'rad/s', group: 'Rings', hint: 'Lobe rotation; higher harmonics turn faster' },

    { key: 'blobSize', label: 'Blob size', type: 'number', min: 0.02, max: 0.5, step: 0.005, default: 0.24, group: 'Fundamental', hint: 'At full loudness, fraction of half the stage' },
    { key: 'wobble', label: 'Blob wobble', type: 'number', min: 0, max: 1, step: 0.01, default: 0.25, group: 'Fundamental' },
    { key: 'halo', label: 'Halo', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5, group: 'Fundamental', hint: 'Wide soft glow around the blob' },

    { key: 'beat', label: 'Beat pulse', type: 'number', min: 0, max: 1, step: 0.01, default: 0.45, group: 'Motion', hint: 'How much everything swells on a beat' },
    { key: 'glide', label: 'Pitch glide', type: 'number', min: 0, max: 0.98, step: 0.01, default: 0.8, group: 'Motion', hint: 'Smoothing on the fundamental’s colour' },
    { key: 'range', label: 'Partial range', type: 'number', min: 0.1, max: 1, step: 0.01, default: 0.45, group: 'Motion', hint: 'Amplitude span (below the strongest partial) that maps to ring thickness; lower = more contrast' },
    { key: 'decay', label: 'Ring decay', type: 'number', min: 0, max: 0.98, step: 0.01, default: 0.85, group: 'Motion', hint: 'How slowly a ring fades when its partial stops' },

    {
      key: 'colorBy', label: 'Ring colour', type: 'select', default: 'harmonic', group: 'Colour',
      options: [
        { value: 'harmonic', label: 'Harmonic frequency (k·f₀)' },
        { value: 'fundamental', label: 'Fundamental (all rings f₀)' },
        { value: 'position', label: 'Palette sweep (by k)' },
        { value: 'mono', label: 'Mono' },
      ],
    },
    { key: 'monoColor', label: 'Mono colour', type: 'color', default: '#ffe2b0', group: 'Colour' },
    { key: 'brightness', label: 'Brightness', type: 'number', min: 0.2, max: 2, step: 0.01, default: 1, group: 'Colour' },
    { key: 'additive', label: 'Additive light', type: 'boolean', default: true, group: 'Colour', hint: 'Overlapping rings add up like light' },
  ],
  presets: [
    { name: 'Harmonic halo', description: 'Octave-spaced glowing rings around a soft fundamental.', params: {} },
    {
      name: 'Standing waves',
      description: 'Thin rings, each wobbling with k lobes — harmonics drawn as modes of a drum.',
      params: { spacing: 'even', style: 'line', rings: 12, thickness: 3, lobes: 0.75, spin: 0.8, blobSize: 0.12, wobble: 0.1, halo: 0.35, outer: 0.9, softness: 0.35 },
    },
    {
      name: 'Converging series',
      description: 'Wide translucent bands that crowd together like the harmonic series itself.',
      params: { spacing: 'wavelength', style: 'band', rings: 15, thickness: 18, softness: 0.9, outer: 0.95, lobes: 0, blobSize: 0.3, halo: 0.7, beat: 0.25, decay: 0.92 },
    },
    {
      name: 'Beat bloom',
      description: 'Beaded rings that burst outward on every beat.',
      params: { spacing: 'area', style: 'dots', rings: 8, thickness: 8, beat: 1, blobSize: 0.26, halo: 0.9, wobble: 0.5, spin: -0.6, lobes: 0.3 },
      modulations: { outer: { source: 'beatPulse', amount: 0.18, smooth: 0.3 }, blobSize: { source: 'bass', amount: 0.15, smooth: 0.5 } },
    },
  ],
  create(canvas) {
    const ctx = canvas.getContext('2d')!;
    const cosT = new Float32Array(SEG + 1);
    const sinT = new Float32Array(SEG + 1);
    for (let i = 0; i <= SEG; i++) {
      cosT[i] = Math.cos((i / SEG) * TAU);
      sinT[i] = Math.sin((i / SEG) * TAU);
    }
    const target = new Float32Array(MAXK + 1);
    const amps = new Float32Array(MAXK + 1);
    const phase = new Float32Array(MAXK + 1);
    for (let k = 0; k <= MAXK; k++) phase[k] = k * 1.7;
    let f0Log = Math.log2(220);
    let pulse = 0;
    let wob = 0;

    return {
      render(rc) {
        const { width: W, height: H, audio, params: p, color, dt } = rc;
        const cx = W / 2;
        const cy = H / 2;
        const R = Math.min(W, H) / 2;
        const N = clamp(Math.round(num(p, 'rings', 10)), 1, MAXK - 1) + 1; // highest k
        const spacing = str(p, 'spacing', 'octave');
        const style = str(p, 'style', 'glow');
        const colorBy = str(p, 'colorBy', 'harmonic');
        const bright = num(p, 'brightness', 1);
        const soft = num(p, 'softness', 0.6);
        const lobes = num(p, 'lobes', 0.15);
        const thick = num(p, 'thickness', 7);

        // fundamental (glide in log space so colour sweeps musically)
        const fT = dominantFreq(rc);
        f0Log += (Math.log2(fT) - f0Log) * smoothK(num(p, 'glide', 0.8), dt);
        const f0 = Math.pow(2, f0Log);

        // partial amplitudes: from the engine, else measured from the spectrum
        target.fill(0);
        const parts = audio.partials;
        if (parts && parts.length) {
          let pm = 0;
          for (let i = 0; i < parts.length && i < MAXK; i++) if (parts[i].amp > pm) pm = parts[i].amp;
          const span = num(p, 'range', 0.45);
          const lvl = Math.min(1, pm * 1.5);
          for (let i = 0; i < parts.length && i < MAXK; i++) target[i + 1] = parts[i].amp > 0 ? expandAmp(parts[i].amp, pm, span) * lvl : 0;
        } else if (audio.spectrum.length) {
          const binHz = audio.sampleRate / audio.fftSize;
          for (let k = 1; k <= MAXK; k++) {
            const b = Math.round((k * f0) / binHz);
            let m = 0;
            for (let j = b - 1; j <= b + 1; j++) if (j >= 0 && j < audio.spectrum.length && audio.spectrum[j] > m) m = audio.spectrum[j];
            target[k] = m;
          }
        }
        follow(amps, target, smoothK(0.3, dt), smoothK(num(p, 'decay', 0.85), dt));

        const beatAmt = num(p, 'beat', 0.45);
        pulse += (audio.beatPulse - pulse) * smoothK(0.4, dt);
        const swell = 1 + 0.22 * pulse * beatAmt;
        const loud = clamp(audio.loudness, 0, 1);
        const rb = R * num(p, 'blobSize', 0.15) * (0.45 + 0.75 * loud) * swell;
        const rOut = Math.max(rb * 1.3, R * num(p, 'outer', 0.85) * (1 + 0.08 * pulse * beatAmt));

        const g = (k: number) =>
          spacing === 'even' ? k - 1 : spacing === 'area' ? Math.sqrt(k) - 1 : spacing === 'wavelength' ? 1 - 1 / k : Math.log2(k);
        const gN = g(N) || 1;
        const firstGap = (rOut - rb) * (g(2) / gN);

        const spin = num(p, 'spin', 0.35);
        for (let k = 2; k <= N; k++) phase[k] += dt * spin * Math.sqrt(k) * (k % 2 ? 1 : -1);
        wob += dt;

        ctx.globalCompositeOperation = bool(p, 'additive', true) ? 'lighter' : 'source-over';
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        const mono = hexToRgb(str(p, 'monoColor', '#ffe2b0'));
        const ringColor = (k: number, a: number): RGB => {
          switch (colorBy) {
            case 'fundamental': return lift(color.freq(f0, a));
            case 'position': return lift(color.norm((k - 2) / Math.max(1, N - 2), a));
            case 'mono': return mono;
            default: return lift(color.freq(k * f0, 0.5 + 0.5 * a), 0.2);
          }
        };

        // rings, outermost first so the core sits on top
        // normalise to the strongest partial so the timbre pattern reads at any level
        let amax = 0;
        for (let k = 1; k <= N; k++) if (amps[k] > amax) amax = amps[k];
        const norm = 1 / Math.max(0.2, amax);
        for (let k = N; k >= 2; k--) {
          const a = Math.sqrt(amps[k] * norm);
          if (a < 0.03) continue;
          const r = rb + (rOut - rb) * (g(k) / gN);
          const local = Math.min(firstGap, (rOut - rb) * ((g(k) - g(k - 1)) / gN) + 1e-3);
          const amp = Math.min(1, a);
          const c = ringColor(k, amp);
          const w = thick * (0.25 + 1.1 * amp);
          // crowded rings (high k in octave/wavelength spacing) would saturate to white
          const crowdAll = style === 'band' ? 1 : clamp(local / (w * 1.6 + 2), 0.3, 1);
          const alpha = clamp((0.3 + 0.8 * amp) * bright * (0.9 + 0.3 * pulse * beatAmt) * crowdAll, 0, 1);
          const def = lobes * amp * Math.min(local * 0.9 + 6, R * 0.12);
          const ph = phase[k];

          if (style === 'dots') {
            const count = Math.max(6, Math.round((TAU * r) / Math.max(8, thick * 2.6)));
            const dr = Math.max(1, w * 0.4);
            ctx.fillStyle = rgba(c, alpha * 0.35);
            const path = new Path2D();
            const path2 = new Path2D();
            for (let i = 0; i < count; i++) {
              const th = (i / count) * TAU + ph * 0.25;
              const rr = r + def * Math.sin(k * th + ph);
              const x = cx + Math.cos(th) * rr;
              const y = cy + Math.sin(th) * rr;
              path.moveTo(x + dr * 2, y);
              path.arc(x, y, dr * 2, 0, TAU);
              path2.moveTo(x + dr, y);
              path2.arc(x, y, dr, 0, TAU);
            }
            if (soft > 0.05) {
              ctx.globalAlpha = soft * 0.6;
              ctx.fill(path);
              ctx.globalAlpha = 1;
            }
            ctx.fillStyle = rgba(c, alpha, 0.15);
            ctx.fill(path2);
            continue;
          }

          const path = new Path2D();
          if (def < 1.5) {
            path.arc(cx, cy, r, 0, TAU);
          } else {
            for (let i = 0; i <= SEG; i++) {
              const th = (i / SEG) * TAU;
              const rr = r + def * Math.sin(k * th + ph);
              const x = cx + cosT[i] * rr;
              const y = cy + sinT[i] * rr;
              if (i === 0) path.moveTo(x, y);
              else path.lineTo(x, y);
            }
            path.closePath();
          }

          if (style === 'band') {
            // crowded rings would saturate to white: thin their alpha by spacing
            const crowd = clamp(local / Math.max(4, thick * 0.6), 0.15, 1);
            const bw = Math.max(w, local * (0.35 + 0.6 * amp));
            ctx.lineWidth = bw;
            ctx.strokeStyle = rgba(c, crowd * alpha * (0.3 + 0.35 * (1 - soft)));
            ctx.stroke(path);
            ctx.lineWidth = Math.max(1.25, bw * 0.1);
            ctx.strokeStyle = rgba(c, alpha * (0.4 + 0.6 * crowd), 0.2 * crowd);
            ctx.stroke(path);
          } else if (style === 'line') {
            if (soft > 0.05) {
              ctx.lineWidth = w * (1 + 4 * soft);
              ctx.strokeStyle = rgba(c, alpha * 0.16);
              ctx.stroke(path);
            }
            ctx.lineWidth = Math.max(1.25, w * 0.6);
            ctx.strokeStyle = rgba(c, alpha);
            ctx.stroke(path);
          } else {
            // glow: wide faint halo, mid body, hot thin core
            // (two passes, not more: wide translucent strokes are fill-rate heavy)
            if (soft > 0.05) {
              ctx.lineWidth = w * (1.6 + 3.5 * soft);
              ctx.strokeStyle = rgba(c, alpha * 0.2);
              ctx.stroke(path);
            }
            ctx.lineWidth = w;
            ctx.strokeStyle = rgba(c, alpha * 0.75);
            ctx.stroke(path);
            if (w > 3) {
              ctx.lineWidth = Math.max(1, w * 0.3);
              ctx.strokeStyle = rgba(c, Math.min(1, alpha * 1.1), 0.35);
              ctx.stroke(path);
            }
          }
        }

        // the fundamental
        const a1 = clamp(0.35 + 0.65 * Math.max(amps[1], loud), 0, 1);
        const c0 = colorBy === 'mono' ? mono : lift(color.freq(f0, 0.6 + 0.4 * a1), 0.3);
        const halo = num(p, 'halo', 0.5);
        if (halo > 0.01) {
          const hr = rb * (2.2 + 1.6 * halo);
          const hg = ctx.createRadialGradient(cx, cy, rb * 0.3, cx, cy, hr);
          hg.addColorStop(0, rgba(c0, 0.35 * halo * bright));
          hg.addColorStop(0.4, rgba(c0, 0.12 * halo * bright));
          hg.addColorStop(1, rgba(c0, 0));
          ctx.fillStyle = hg;
          ctx.fillRect(cx - hr, cy - hr, hr * 2, hr * 2);
        }
        const wobble = num(p, 'wobble', 0.25);
        const blob = new Path2D();
        const n = 96;
        for (let i = 0; i <= n; i++) {
          const th = (i / n) * TAU;
          const d =
            1 +
            wobble * (0.07 * Math.sin(3 * th + wob * 1.3) + 0.05 * Math.sin(5 * th - wob * 0.9) + 0.04 * Math.sin(2 * th + wob * 2.1)) * (0.6 + pulse);
          const x = cx + Math.cos(th) * rb * 1.25 * d;
          const y = cy + Math.sin(th) * rb * 1.25 * d;
          if (i === 0) blob.moveTo(x, y);
          else blob.lineTo(x, y);
        }
        const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, rb * 1.3);
        bg.addColorStop(0, rgba(c0, a1 * bright, 0.55 + 0.3 * pulse * beatAmt));
        bg.addColorStop(0.35, rgba(c0, a1 * bright, 0.12));
        bg.addColorStop(0.7, rgba(c0, 0.75 * a1 * bright));
        bg.addColorStop(1, rgba(c0, 0));
        ctx.fillStyle = bg;
        ctx.fill(blob);
        ctx.globalCompositeOperation = 'source-over';
      },
    };
  },
};

export default viz;
