/**
 * Oscilloscope — the raw waveform as a glowing ribbon (line, mirrored,
 * circular or Lissajous phase plot).
 */
import type { RGB, VizDefinition } from '../../core/types';
import { ChunkPath, TAU, clamp, dominantFreq, hexToRgb, lift, num, rgba, str } from '../_lib2d/util';

const MAXP = 2048;

const viz: VizDefinition = {
  id: 'oscilloscope',
  name: 'Oscilloscope',
  description:
    'The air-pressure wave itself, drawn as light. The line’s colour follows the timbre’s brightness (spectral centroid) or the pitch through the mapping, its thickness follows loudness, and the Lissajous mode plots the wave against a delayed copy of itself, so a pure tone draws an ellipse and harmonics tie it into knots.',
  renderer: 'canvas2d',
  space: '2d',
  tags: ['waveform', 'classic', 'scope'],
  params: [
    {
      key: 'mode', label: 'Mode', type: 'select', default: 'line', group: 'Shape',
      hint: 'How the waveform is laid out. The waveform is the raw air-pressure signal over time, the thing a speaker cone traces as it moves.',
      options: [
        { value: 'line', label: 'Line', hint: 'Classic scope trace: time runs left to right, pressure up and down.' },
        { value: 'mirror', label: 'Mirrored ribbon', hint: 'The trace plus its upside-down reflection, filled between them into a ribbon that swells with the wave.' },
        { value: 'circular', label: 'Circular', hint: 'The wave wrapped around a circle, pushing the rim in and out.' },
        { value: 'lissajous', label: 'Lissajous (x = s[t], y = s[t+d])', hint: 'Plots the wave against a slightly delayed copy of itself. A pure tone draws an ellipse; harmonics tie it into knots.' },
      ],
    },
    { key: 'gain', label: 'Gain', type: 'number', min: 0.2, max: 8, step: 0.05, default: 1.8, group: 'Shape', curve: 'log', hint: 'Vertical zoom on the wave. Raise it for quiet tracks; too high clips loud peaks flat against the edges.' },
    { key: 'span', label: 'Time window', type: 'number', min: 128, max: 4096, step: 16, default: 1536, unit: 'samples', group: 'Shape', hint: 'How much time fits across the screen, in audio samples (about 48,000 per second, so 1536 is roughly 32 ms). Short windows show a few cycles in detail. Not used in Lissajous mode.' },
    { key: 'points', label: 'Points', type: 'number', min: 64, max: MAXP, step: 16, default: 640, group: 'Shape', hint: 'How many points the line is drawn with. Fewer points smooth away fine detail and high harmonics; more shows every wiggle, at some cost in speed.' },
    { key: 'trigger', label: 'Stable trigger', type: 'boolean', default: true, group: 'Shape', hint: 'Starts each frame where the wave crosses zero going upward, as a real oscilloscope does, so a steady note stands still instead of jittering. Not used in Lissajous mode.' },
    { key: 'smoothing', label: 'Persistence', type: 'number', min: 0, max: 0.95, step: 0.01, default: 0.35, group: 'Shape', hint: 'Blends each frame with the previous ones, like the slow phosphor of an old scope. High values give a calm, averaged shape. Not used in Lissajous mode.' },
    { key: 'radius', label: 'Radius', type: 'number', min: 0.05, max: 0.9, step: 0.01, default: 0.45, group: 'Circular & Lissajous', hint: 'Size of the circle in Circular mode, or the overall scale of the figure in Lissajous mode. Try binding it to Bass.' },
    { key: 'delay', label: 'Lissajous delay', type: 'number', min: 1, max: 600, step: 1, default: 48, unit: 'samples', group: 'Circular & Lissajous', curve: 'log', hint: 'How far behind the second copy of the wave is, in samples. A delay of a quarter of a note’s period turns its ellipse into a circle. Only used in Lissajous mode.' },
    { key: 'spin', label: 'Spin', type: 'number', min: -180, max: 180, step: 1, default: 0, unit: '°/s', group: 'Circular & Lissajous', hint: 'Rotates the figure continuously, in degrees per second. Only used in Circular and Lissajous modes.' },

    { key: 'thickness', label: 'Thickness', type: 'number', min: 0.5, max: 16, step: 0.25, default: 2.5, unit: 'px', group: 'Line', hint: 'Base width of the trace. Loudness → thickness can widen or narrow it from here.' },
    { key: 'loudThick', label: 'Loudness → thickness', type: 'number', min: 0, max: 1, step: 0.01, default: 0.6, group: 'Line', hint: 'How much loudness changes the line width. At 1 a quiet passage draws a hairline and a loud one a thick stroke; 0 keeps the width fixed.' },
    { key: 'glow', label: 'Glow', type: 'number', min: 0, max: 1, step: 0.01, default: 0.6, group: 'Line', hint: 'Strength of the soft halo around the line, plus a white-hot core when high. Combine with layer feedback for a phosphor afterglow.' },
    { key: 'fill', label: 'Fill', type: 'number', min: 0, max: 1, step: 0.01, default: 0.15, group: 'Line', hint: 'Fills the area inside the shape, brighter when loud. Only used in Mirrored ribbon and Circular modes.' },

    {
      key: 'colorBy', label: 'Colour by', type: 'select', default: 'centroid', group: 'Colour',
      hint: 'Which part of the sound sets the line’s colour.',
      options: [
        { value: 'centroid', label: 'Brightness (centroid → mapping)', hint: 'Colour from the spectral centroid, the spectrum’s “centre of mass”: changes with timbre, dull versus bright.' },
        { value: 'pitch', label: 'Pitch (fundamental → mapping)', hint: 'Colour from the detected main pitch, so the line changes colour with the melody.' },
        { value: 'sweep', label: 'Palette sweep along the line', hint: 'A fixed rainbow of the palette laid along the line (or around the circle), not driven by the sound.' },
        { value: 'mono', label: 'Mono', hint: 'The single Mono colour below.' },
      ],
    },
    { key: 'monoColor', label: 'Mono colour', type: 'color', default: '#7dffb2', group: 'Colour', hint: 'The line colour. Only used when Colour by = Mono. Green imitates a classic phosphor scope.' },
  ],
  presets: [
    { name: 'Phosphor', description: 'A steady glowing trace, coloured by timbre.', params: {} },
    {
      name: 'Ribbon',
      description: 'Mirrored filled ribbon that swells with loudness.',
      params: { mode: 'mirror', gain: 1.5, thickness: 1.5, fill: 0.45, glow: 0.5, colorBy: 'sweep', span: 2048, points: 512 },
    },
    {
      name: 'Halo scope',
      description: 'The wave wrapped round a circle, slowly turning.',
      params: { mode: 'circular', radius: 0.48, gain: 1.1, thickness: 2, spin: 12, fill: 0.2, colorBy: 'pitch', span: 768, points: 512, smoothing: 0.6 },
      modulations: { radius: { source: 'bass', amount: 0.12, smooth: 0.5 } },
    },
    {
      name: 'Lissajous knot',
      description: 'Phase plot of the wave against itself; best with layer feedback for afterglow.',
      params: { mode: 'lissajous', delay: 60, gain: 2.2, radius: 0.6, thickness: 1.25, glow: 0.8, smoothing: 0, colorBy: 'pitch', span: 2048, points: 900 },
    },
  ],
  create(canvas) {
    const ctx = canvas.getContext('2d')!;
    const buf = new Float32Array(MAXP);
    const xs = new Float32Array(MAXP);
    const ys = new Float32Array(MAXP);
    let ang = 0;
    let lastN = 0;
    let glowCanvas: HTMLCanvasElement | null = null;
    let glowCtx: CanvasRenderingContext2D | null = null;

    return {
      render(rc) {
        const { width: W, height: H, audio, params: p, color, dt } = rc;
        const wf = audio.waveform;
        const L = wf.length;
        if (!L) return;
        const mode = str(p, 'mode', 'line');
        const gain = num(p, 'gain', 1.8);
        const N = clamp(Math.round(num(p, 'points', 640)), 16, MAXP);
        const span = Math.min(L - 1, Math.round(num(p, 'span', 1536)));
        const delay = Math.round(num(p, 'delay', 48));
        const pers = mode === 'lissajous' ? 0 : num(p, 'smoothing', 0.35);
        ang += (num(p, 'spin', 0) * Math.PI / 180) * dt;

        // trigger: first rising zero crossing in the first part of the buffer
        let start = 0;
        const room = L - span - (mode === 'lissajous' ? delay : 0) - 1;
        if (p.trigger !== false && mode !== 'lissajous' && room > 1) {
          for (let i = 1; i < room; i++) {
            if (wf[i - 1] < 0 && wf[i] >= 0) {
              start = i;
              break;
            }
          }
        }
        const k = N !== lastN ? 0 : pers;
        lastN = N;
        for (let i = 0; i < N; i++) {
          const x = start + (i / (N - 1)) * span;
          const j = x | 0;
          const f = x - j;
          const s = (wf[j] * (1 - f) + wf[Math.min(L - 1, j + 1)] * f) * gain;
          buf[i] = buf[i] * k + s * (1 - k);
        }

        const loud = clamp(audio.loudness, 0, 1);
        const lw = num(p, 'thickness', 2.5) * (1 - num(p, 'loudThick', 0.6) + num(p, 'loudThick', 0.6) * (0.3 + 1.4 * loud));
        const colorBy = str(p, 'colorBy', 'centroid');
        let base: RGB;
        if (colorBy === 'pitch') base = color.freq(dominantFreq(rc), 0.6 + 0.4 * loud);
        else if (colorBy === 'mono') base = hexToRgb(str(p, 'monoColor', '#7dffb2'));
        else base = color.freq(audio.centroid > 0 ? audio.centroid : 1000, 0.6 + 0.4 * loud);
        base = lift(base, 0.2);

        const cx = W / 2;
        const cy = H / 2;
        const R = Math.min(W, H) / 2;
        const path = new ChunkPath(128);
        let fillPath: Path2D | null = null;
        let gradient: CanvasGradient | null = null;
        const fill = num(p, 'fill', 0.15);

        if (mode === 'line' || mode === 'mirror') {
          const amp = H * 0.4;
          for (let i = 0; i < N; i++) {
            xs[i] = (i / (N - 1)) * W;
            ys[i] = cy - clamp(buf[i], -1.2, 1.2) * amp;
          }
          path.moveTo(xs[0], ys[0]);
          for (let i = 1; i < N; i++) path.lineTo(xs[i], ys[i]);
          if (mode === 'mirror') {
            // mirrored copy: reflect around the centre line, traced back so the shape closes
            path.moveTo(xs[N - 1], 2 * cy - ys[N - 1]);
            for (let i = N - 2; i >= 0; i--) path.lineTo(xs[i], 2 * cy - ys[i]);
            if (fill > 0) {
              fillPath = new Path2D();
              fillPath.moveTo(xs[0], cy - Math.abs(cy - ys[0]));
              for (let i = 1; i < N; i++) fillPath.lineTo(xs[i], cy - Math.abs(cy - ys[i]));
              for (let i = N - 1; i >= 0; i--) fillPath.lineTo(xs[i], cy + Math.abs(cy - ys[i]));
              fillPath.closePath();
            }
          }
          if (colorBy === 'sweep') {
            gradient = ctx.createLinearGradient(0, 0, W, 0);
            for (let s = 0; s <= 6; s++) gradient.addColorStop(s / 6, rgba(lift(color.norm(s / 6, 0.8), 0.2), 1));
          }
        } else if (mode === 'circular') {
          const r0 = R * num(p, 'radius', 0.45);
          for (let i = 0; i < N; i++) {
            const th = ang + (i / N) * TAU - Math.PI / 2;
            // blend the seam so the loop closes smoothly
            const e = Math.min(1, Math.min(i, N - 1 - i) / (N * 0.06));
            const v = buf[i] * e * e * (3 - 2 * e);
            const rr = r0 + clamp(v, -1.5, 1.5) * R * 0.25;
            xs[i] = cx + Math.cos(th) * rr;
            ys[i] = cy + Math.sin(th) * rr;
          }
          path.moveTo(xs[0], ys[0]);
          for (let i = 1; i < N; i++) path.lineTo(xs[i], ys[i]);
          path.closePath();
          if (fill > 0) {
            fillPath = new Path2D();
            fillPath.moveTo(xs[0], ys[0]);
            for (let i = 1; i < N; i++) fillPath.lineTo(xs[i], ys[i]);
            fillPath.closePath();
          }
          if (colorBy === 'sweep') {
            gradient = ctx.createConicGradient(ang - Math.PI / 2, cx, cy);
            for (let s = 0; s <= 6; s++) gradient.addColorStop(s / 6, rgba(lift(color.norm(s < 6 ? s / 6 : 0, 0.8), 0.2), 1));
          }
        } else {
          // Lissajous: rotate 45° so a mono signal is a vertical line, a sine an ellipse
          const sc = R * num(p, 'radius', 0.45) * 1.2;
          const ca = Math.cos(ang);
          const sa = Math.sin(ang);
          const stride = Math.max(1, Math.floor((L - delay - 1) / N));
          const n = Math.min(N, Math.floor((L - delay - 1) / stride));
          for (let i = 0; i < n; i++) {
            const a = wf[i * stride] * gain;
            const b = wf[i * stride + delay] * gain;
            const X = (a - b) * 0.7071;
            const Y = (a + b) * 0.7071;
            xs[i] = cx + (X * ca - Y * sa) * sc;
            ys[i] = cy - (X * sa + Y * ca) * sc;
          }
          path.moveTo(xs[0], ys[0]);
          for (let i = 1; i < n; i++) path.lineTo(xs[i], ys[i]);
          if (colorBy === 'sweep') {
            gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, sc * 1.2);
            for (let s = 0; s <= 5; s++) gradient.addColorStop(s / 5, rgba(lift(color.norm(s / 5, 0.8), 0.2), 1));
          }
        }

        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.globalCompositeOperation = 'lighter';
        const glow = num(p, 'glow', 0.6);
        if (fillPath && fill > 0) {
          ctx.globalAlpha = fill * (0.5 + 0.5 * loud);
          ctx.fillStyle = gradient ?? rgba(base, 0.6);
          ctx.fill(fillPath, 'evenodd');
          ctx.globalAlpha = 1;
        }
        const style = gradient ?? rgba(base, 1);
        if (glow > 0) {
          // Glow is drawn at quarter resolution and upscaled: much cheaper
          // than wide translucent full-res strokes, and softer too.
          const gw = Math.max(1, Math.ceil(W / 4));
          const gh = Math.max(1, Math.ceil(H / 4));
          if (!glowCanvas) {
            glowCanvas = document.createElement('canvas');
            glowCtx = glowCanvas.getContext('2d')!;
          }
          if (glowCanvas.width !== gw || glowCanvas.height !== gh) {
            glowCanvas.width = gw;
            glowCanvas.height = gh;
          } else {
            glowCtx!.setTransform(1, 0, 0, 1, 0, 0);
            glowCtx!.clearRect(0, 0, gw, gh);
          }
          const g = glowCtx!;
          g.setTransform(0.25, 0, 0, 0.25, 0, 0);
          g.globalCompositeOperation = 'lighter';
          g.lineJoin = 'round';
          g.lineCap = 'round';
          g.strokeStyle = style;
          g.globalAlpha = 0.5;
          g.lineWidth = lw * 6 + 8;
          path.stroke(g);
          ctx.globalAlpha = Math.min(1, glow * 0.9);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(glowCanvas, 0, 0, W, H);
        }
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = style;
        ctx.lineWidth = lw;
        path.stroke(ctx);
        if (glow > 0.2 && lw >= 1.5) {
          ctx.globalAlpha = 0.5 * glow;
          ctx.strokeStyle = 'rgba(255,255,255,0.8)';
          ctx.lineWidth = Math.max(0.5, lw * 0.3);
          path.stroke(ctx);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      },
    };
  },
};

export default viz;
