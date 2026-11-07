/**
 * Radial Spectrum — perceptual bands wrapped around a circle.
 */
import type { RGB, VizDefinition } from '../../core/types';
import { TAU, clamp, follow, lift, num, pickColor, rgba, smoothClosedPath, smoothK, str } from '../_lib2d/util';

const MAXM = 768;

const viz: VizDefinition = {
  id: 'radial-spectrum',
  name: 'Radial Spectrum',
  description:
    'The spectrum bent into a circle: angle is frequency (low to high around the ring), length is energy, colour is each band’s frequency through the mapping. Symmetry folds it into mandalas, and the core breathes on the beat.',
  renderer: 'canvas2d',
  space: '2d',
  tags: ['spectrum', 'radial', 'classic', 'symmetry'],
  params: [
    {
      key: 'style', label: 'Style', type: 'select', default: 'bars', group: 'Shape',
      hint: 'How each point of the spectrum is drawn around the ring. Angle is frequency, length is energy.',
      options: [
        { value: 'bars', label: 'Bars', hint: 'Solid radial bars with a soft glow: a spectrum analyser bent into a circle.' },
        { value: 'blob', label: 'Smooth blob', hint: 'One smooth membrane pushed out (or in) by the spectrum, like a breathing cell.' },
        { value: 'dots', label: 'Dots', hint: 'A dot at the tip of each element, like a necklace, with no bar behind it.' },
        { value: 'rays', label: 'Light rays', hint: 'Thin rays that fade in from the centre and brighten at the tip.' },
      ],
    },
    {
      key: 'symmetry', label: 'Symmetry', type: 'select', default: 'mirror', group: 'Shape',
      hint: 'How many times the low-to-high spectrum is repeated around the circle. Repeats turn the same sound into a mandala.',
      options: [
        { value: 'none', label: 'None (one lap)', hint: 'Low to high once around the circle, so there is a jump where the highest meets the lowest.' },
        { value: 'mirror', label: 'Mirror (left/right)', hint: 'Low to high down one side and back on the other, so the shape is symmetric and seamless.' },
        { value: '3', label: '3-fold kaleidoscope', hint: 'Three mirrored copies of the spectrum around the ring.' },
        { value: '4', label: '4-fold kaleidoscope', hint: 'Four mirrored copies of the spectrum around the ring.' },
        { value: '6', label: '6-fold kaleidoscope', hint: 'Six mirrored copies, like a snowflake.' },
        { value: '8', label: '8-fold kaleidoscope', hint: 'Eight mirrored copies; each copy has fewer elements, so it looks coarser.' },
      ],
    },
    {
      key: 'direction', label: 'Grow', type: 'select', default: 'out', group: 'Shape',
      hint: 'Which way loud bands extend from the inner circle.',
      options: [
        { value: 'out', label: 'Outward', hint: 'Bands grow away from the centre, like a sunburst.' },
        { value: 'in', label: 'Inward', hint: 'Bands grow toward the centre, like an iris closing.' },
        { value: 'both', label: 'Both ways', hint: 'Bands grow out at full length and in at 60%, so the ring thickens symmetrically.' },
      ],
    },
    { key: 'inner', label: 'Inner radius', type: 'number', min: 0, max: 0.9, step: 0.01, default: 0.32, group: 'Shape', hint: 'Radius of the base circle the spectrum grows from, as a fraction of half the canvas’s shorter side. Try binding it to Bass for a breathing ring.' },
    { key: 'length', label: 'Length', type: 'number', min: 0.05, max: 1, step: 0.01, default: 0.6, group: 'Shape', hint: 'How far a band at full energy reaches from the base circle, as a fraction of half the canvas’s shorter side.' },
    { key: 'barWidth', label: 'Bar width', type: 'number', min: 0.05, max: 1, step: 0.01, default: 0.6, group: 'Shape', hint: 'How wide each bar, ray or dot is, as a fraction of the space around the circle it has. 1 makes neighbours touch. Not used in Smooth blob style.' },
    { key: 'resolution', label: 'Resolution', type: 'number', min: 0.25, max: 4, step: 0.05, default: 1, group: 'Shape', hint: 'Elements drawn per frequency band. Above 1, extra in-between elements are interpolated for a finer, smoother ring; below 1 gives fewer, chunkier bars.' },

    { key: 'pulse', label: 'Beat pulse', type: 'number', min: 0, max: 1, step: 0.01, default: 0.35, group: 'Motion', hint: 'How much the inner circle, and everything on it, jumps outward on each beat (up to 18%). 0 ignores rhythm.' },
    { key: 'spin', label: 'Spin', type: 'number', min: -90, max: 90, step: 0.5, default: 6, unit: '°/s', group: 'Motion', hint: 'Rotates the ring continuously, in degrees per second (negative turns anticlockwise). At rest the lowest frequency points straight up.' },
    { key: 'decay', label: 'Fall-off', type: 'number', min: 0, max: 0.98, step: 0.01, default: 0.7, group: 'Motion', hint: 'How slowly bars sink after a sound stops (they always rise quickly). High values give smooth, lingering shapes; low values flicker with every transient.' },
    { key: 'gain', label: 'Gain', type: 'number', min: 0.3, max: 4, step: 0.05, default: 1.3, group: 'Motion', hint: 'Boosts band energy before drawing. Raise it for quiet tracks; too high and every band hits full length.' },
    { key: 'contrast', label: 'Contrast', type: 'number', min: 0.5, max: 3, step: 0.05, default: 1.2, group: 'Motion', hint: 'Raises each band’s energy to this power. Higher values flatten quiet bands so only the strongest frequencies stick out; below 1 everything looks fuller.' },

    {
      key: 'palette', label: 'Palette', type: 'select', default: 'mapping', group: 'Colour',
      hint: 'Where colours come from. Mapping colours each element by its frequency through the global colour mapping.',
      options: [
        { value: 'mapping', label: 'Mapping (by frequency)', hint: 'Each element takes its band’s frequency through the global mapping, so colour encodes pitch.' },
        { value: 'position', label: 'Palette sweep (by position)', hint: 'Colour steps through the palette from low to high bands, independent of the colour mapping.' },
        { value: 'level', label: 'Palette by level', hint: 'Colour comes from how loud each band is, so the palette shows energy, not pitch.' },
        { value: 'mono', label: 'Mono (single colour)', hint: 'Everything uses the Mono colour, dimmer for quiet bands.' },
      ],
    },
    { key: 'monoColor', label: 'Mono colour', type: 'color', default: '#9fd8ff', group: 'Colour', hint: 'The colour used for everything. Only used when Palette = Mono.' },
    { key: 'glow', label: 'Glow', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5, group: 'Colour', hint: 'Strength of the soft halo around bars, dots and the blob outline. Light rays already fade softly and ignore it.' },
    { key: 'core', label: 'Core disc', type: 'number', min: 0, max: 1, step: 0.01, default: 0.25, group: 'Colour', hint: 'A soft glowing fill inside the inner circle, in the colour of the loudest band, brightening on each beat. Needs a non-zero inner radius.' },
  ],
  presets: [
    { name: 'Sunburst', description: 'Mirrored bars around a breathing core.', params: {} },
    {
      name: 'Liquid blob',
      description: 'A smooth membrane pushed out by the spectrum.',
      params: { style: 'blob', symmetry: 'mirror', inner: 0.38, length: 0.42, direction: 'both', decay: 0.8, glow: 0.6, core: 0.15, spin: 0 },
      modulations: { inner: { source: 'bass', amount: 0.1, smooth: 0.6 } },
    },
    {
      name: 'Kaleidoscope',
      description: '6-fold light rays, slowly turning.',
      params: { style: 'rays', symmetry: '6', inner: 0.08, length: 0.85, barWidth: 0.35, spin: 10, palette: 'position', core: 0, glow: 0.8, resolution: 1.5, gain: 1.1, contrast: 1.6 },
    },
    {
      name: 'Pearl ring',
      description: 'Dots on a ring, inward and outward, like a spectral necklace.',
      params: { style: 'dots', symmetry: 'none', inner: 0.55, length: 0.3, direction: 'both', barWidth: 0.9, pulse: 0.5, resolution: 0.75, spin: -4, core: 0.1, gain: 1.5 },
    },
  ],
  create(canvas) {
    const ctx = canvas.getContext('2d')!;
    let smooth = new Float32Array(64);
    const disp = new Float32Array(MAXM);
    const dispF = new Float32Array(MAXM);
    const dispP = new Float32Array(MAXM);
    const xs = new Float32Array(MAXM);
    const ys = new Float32Array(MAXM);
    const xs2 = new Float32Array(MAXM);
    const ys2 = new Float32Array(MAXM);
    let rot = 0;
    let pulse = 0;

    return {
      render(rc) {
        const { width: W, height: H, audio, params: p, color, dt } = rc;
        const bands = audio.bands;
        const n = bands.length;
        if (!n) return;
        if (smooth.length !== n) smooth = new Float32Array(n);
        follow(smooth, bands, smoothK(0.2, dt), smoothK(num(p, 'decay', 0.7), dt));

        const sym = str(p, 'symmetry', 'mirror');
        const fold = sym === 'none' ? 1 : sym === 'mirror' ? 1 : parseInt(sym, 10) || 1;
        const mirror = sym !== 'none';
        const res = num(p, 'resolution', 1);
        // samples per segment
        const seg = clamp(Math.round((n * res) / Math.max(1, fold > 1 ? fold / 2 : 1)), 8, Math.floor(MAXM / (fold * (mirror ? 2 : 1))));
        const contrast = num(p, 'contrast', 1.2);
        const gain = num(p, 'gain', 1.3);
        let M = 0;
        const bf = audio.bandFreqs;
        for (let f = 0; f < fold; f++) {
          for (let half = 0; half < (mirror ? 2 : 1); half++) {
            for (let i = 0; i < seg; i++) {
              const t = half === 0 ? (i + 0.5) / seg : 1 - (i + 0.5) / seg;
              const x = t * (n - 1);
              const j = x | 0;
              const fr = x - j;
              const v = smooth[j] * (1 - fr) + smooth[Math.min(n - 1, j + 1)] * fr;
              disp[M] = Math.pow(clamp(v * gain, 0, 1), contrast);
              dispF[M] = bf[j] > 0 ? bf[j] * (1 - fr) + bf[Math.min(n - 1, j + 1)] * fr : 30 * Math.pow(16000 / 30, t);
              dispP[M] = t;
              M++;
            }
          }
        }

        rot += (num(p, 'spin', 6) * Math.PI / 180) * dt;
        pulse += (audio.beatPulse - pulse) * smoothK(0.3, dt);
        const R = Math.min(W, H) / 2;
        const cx = W / 2;
        const cy = H / 2;
        const r0 = R * num(p, 'inner', 0.32) * (1 + 0.18 * num(p, 'pulse', 0.35) * pulse);
        const len = R * num(p, 'length', 0.5);
        const dir = str(p, 'direction', 'out');
        const style = str(p, 'style', 'bars');
        const palette = str(p, 'palette', 'mapping');
        const mono = str(p, 'monoColor', '#9fd8ff');
        const glow = num(p, 'glow', 0.5);
        const bw = num(p, 'barWidth', 0.6);
        const startA = rot - Math.PI / 2 + (mirror && fold === 1 ? 0 : 0);

        // dominant colour for the core
        let dom = 0;
        for (let i = 0; i < n; i++) if (smooth[i] > smooth[dom]) dom = i;
        const core = num(p, 'core', 0.25);
        if (core > 0.01 && r0 > 4) {
          const c = lift(pickColor(color, palette, mono, bf[dom] || 200, dom / n, smooth[dom]), 0.15);
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r0 * 1.05);
          g.addColorStop(0, rgba(c, core * (0.5 + 0.5 * pulse)));
          g.addColorStop(0.7, rgba(c, core * 0.35));
          g.addColorStop(1, rgba(c, 0));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(cx, cy, r0 * 1.05, 0, TAU);
          ctx.fill();
        }

        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        const step = TAU / M;
        const cols: RGB[] = [];
        for (let i = 0; i < M; i++) cols.push(lift(pickColor(color, palette, mono, dispF[i], dispP[i], 0.5 + 0.5 * disp[i]), 0.15));

        if (style === 'blob') {
          for (let i = 0; i < M; i++) {
            const a = startA + i * step;
            const v = disp[i] * len;
            const ro = dir === 'in' ? r0 : r0 + v;
            const ri = dir === 'out' ? r0 : Math.max(2, r0 - v * (dir === 'both' ? 0.6 : 1));
            xs[i] = cx + Math.cos(a) * ro;
            ys[i] = cy + Math.sin(a) * ro;
            xs2[i] = cx + Math.cos(a) * ri;
            ys2[i] = cy + Math.sin(a) * ri;
          }
          const g = ctx.createConicGradient(startA, cx, cy);
          const stops = Math.min(M, 48);
          for (let s = 0; s <= stops; s++) {
            const i = Math.min(M - 1, Math.round((s / stops) * M) % M);
            g.addColorStop(s / stops, rgba(cols[i], 1));
          }
          const outer = new Path2D();
          smoothClosedPath(outer, xs, ys, M);
          const innerP = new Path2D();
          smoothClosedPath(innerP, xs2, ys2, M);
          const shape = new Path2D();
          shape.addPath(outer);
          shape.addPath(innerP);
          ctx.fillStyle = g;
          ctx.globalAlpha = 0.28;
          ctx.fill(shape, 'evenodd');
          ctx.strokeStyle = g;
          if (glow > 0) {
            ctx.globalAlpha = 0.12 * glow;
            ctx.lineWidth = 14;
            ctx.stroke(outer);
            if (dir !== 'out') ctx.stroke(innerP);
          }
          ctx.globalAlpha = 0.95;
          ctx.lineWidth = 2;
          ctx.stroke(outer);
          if (dir !== 'out') ctx.stroke(innerP);
          ctx.globalAlpha = 1;
        } else {
          const arc = TAU * Math.max(r0, R * 0.1) / M;
          for (let i = 0; i < M; i++) {
            const v = disp[i];
            if (v < 0.01) continue;
            const a = startA + i * step;
            const ca = Math.cos(a);
            const sa = Math.sin(a);
            const l = v * len;
            const ro = dir === 'in' ? r0 : r0 + l;
            const ri = dir === 'out' ? r0 : Math.max(0, r0 - l * (dir === 'both' ? 0.6 : 1));
            const c = cols[i];
            if (style === 'dots') {
              const dr = Math.max(2, arc * bw * 0.6 * (0.5 + 0.5 * v));
              ctx.fillStyle = rgba(c, 0.55 + 0.45 * v, 0.25 * v);
              ctx.beginPath();
              ctx.arc(cx + ca * ro, cy + sa * ro, dr, 0, TAU);
              if (dir !== 'out') {
                ctx.moveTo(cx + ca * ri + dr, cy + sa * ri);
                ctx.arc(cx + ca * ri, cy + sa * ri, dr * 0.8, 0, TAU);
              }
              ctx.fill();
              if (glow > 0.05) {
                ctx.fillStyle = rgba(c, 0.16 * glow * (0.3 + v));
                ctx.beginPath();
                ctx.arc(cx + ca * ro, cy + sa * ro, dr * 3, 0, TAU);
                ctx.fill();
              }
            } else {
              const w = style === 'rays' ? Math.max(0.75, arc * bw * 0.5) : Math.max(1, arc * bw);
              const x1 = cx + ca * ri;
              const y1 = cy + sa * ri;
              const x2 = cx + ca * ro;
              const y2 = cy + sa * ro;
              if (style === 'rays') {
                const g = ctx.createLinearGradient(x1, y1, x2, y2);
                g.addColorStop(0, rgba(c, 0.1));
                g.addColorStop(0.5, rgba(c, 0.3 + 0.5 * v));
                g.addColorStop(1, rgba(c, 0.5 + 0.5 * v, 0.35));
                ctx.strokeStyle = g;
                ctx.lineWidth = w;
              } else {
                ctx.strokeStyle = rgba(c, 0.55 + 0.45 * v, 0.1 * v);
                ctx.lineWidth = w;
              }
              ctx.beginPath();
              ctx.moveTo(x1, y1);
              ctx.lineTo(x2, y2);
              ctx.stroke();
              if (glow > 0.05 && style === 'bars') {
                ctx.strokeStyle = rgba(c, 0.1 * glow);
                ctx.lineWidth = w * 3;
                ctx.stroke();
              }
            }
          }
        }
        ctx.globalCompositeOperation = 'source-over';
      },
    };
  },
};

export default viz;
