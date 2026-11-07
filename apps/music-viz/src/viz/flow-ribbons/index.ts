/**
 * Flow Ribbons — ambient silk / aurora curtains whose colour sweeps the
 * mapped spectrum and whose shape follows the bands.
 */
import type { VizDefinition } from '../../core/types';
import { clamp, follow, smoothOpenPath, hexToRgb, lift, logFreq, num, rgba, sampleLinear, smoothK, str } from '../_lib2d/util';

const P = 72; // samples across the width
const MAXR = 14;

const viz: VizDefinition = {
  id: 'flow-ribbons',
  name: 'Flow Ribbons',
  description:
    'Slow silk ribbons laid across the frequency axis: at each point along a ribbon the colour is that frequency through the mapping, and the ribbon swells and lifts where that part of the spectrum is loud. The result is ambient and aurora-like.',
  renderer: 'canvas2d',
  space: '2d',
  tags: ['ambient', 'spectrum', 'flow', 'aurora'],
  params: [
    {
      key: 'style', label: 'Style', type: 'select', default: 'silk', group: 'Ribbons',
      options: [
        { value: 'silk', label: 'Silk (bundles of strands)' },
        { value: 'curtain', label: 'Aurora curtain' },
        { value: 'lines', label: 'Lines' },
      ],
    },
    { key: 'count', label: 'Ribbons', type: 'number', min: 1, max: MAXR, step: 1, default: 5, group: 'Ribbons' },
    { key: 'strands', label: 'Strands per ribbon', type: 'number', min: 2, max: 40, step: 1, default: 16, group: 'Ribbons' },
    { key: 'thickness', label: 'Thickness', type: 'number', min: 2, max: 300, step: 1, default: 40, unit: 'px', group: 'Ribbons' },
    { key: 'spread', label: 'Vertical spread', type: 'number', min: 0, max: 1, step: 0.01, default: 0.45, group: 'Ribbons' },
    { key: 'curtain', label: 'Curtain height', type: 'number', min: 0.05, max: 1, step: 0.01, default: 0.35, group: 'Ribbons', hint: 'Aurora style' },

    { key: 'flow', label: 'Flow speed', type: 'number', min: 0, max: 2, step: 0.01, default: 0.25, group: 'Motion' },
    { key: 'wave', label: 'Wave height', type: 'number', min: 0, max: 0.5, step: 0.005, default: 0.12, group: 'Motion' },
    { key: 'waviness', label: 'Waviness', type: 'number', min: 0.2, max: 6, step: 0.05, default: 1.6, group: 'Motion', hint: 'Spatial frequency of the flow' },
    { key: 'energy', label: 'Spectrum lift', type: 'number', min: 0, max: 1, step: 0.01, default: 0.35, group: 'Motion', hint: 'How far loud bands push the ribbon' },
    { key: 'twist', label: 'Twist', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5, group: 'Motion', hint: 'Strands cross over each other' },

    {
      key: 'palette', label: 'Palette', type: 'select', default: 'mapping', group: 'Colour',
      options: [
        { value: 'mapping', label: 'Mapping (frequency along x)' },
        { value: 'position', label: 'Palette sweep (by ribbon)' },
        { value: 'mono', label: 'Mono' },
      ],
    },
    { key: 'monoColor', label: 'Mono colour', type: 'color', default: '#7fffd4', group: 'Colour' },
    { key: 'shift', label: 'Octave shift per ribbon', type: 'number', min: -2, max: 2, step: 0.05, default: 0.35, group: 'Colour', hint: 'Each ribbon samples a slid frequency window' },
    { key: 'alpha', label: 'Opacity', type: 'number', min: 0.05, max: 1, step: 0.01, default: 0.5, group: 'Colour' },
  ],
  presets: [
    { name: 'Silk', description: 'Bundles of fine strands drifting across the spectrum.', params: {} },
    {
      name: 'Aurora',
      description: 'Glowing curtains hanging from flowing edges.',
      params: { style: 'curtain', count: 4, thickness: 18, spread: 0.3, curtain: 0.45, wave: 0.1, waviness: 1.2, flow: 0.15, energy: 0.3, alpha: 0.45, shift: 0.5 },
      modulations: { curtain: { source: 'loudness', amount: 0.15, smooth: 0.7 } },
    },
    {
      name: 'Contours',
      description: 'Many thin lines, like a topographic map of the spectrum.',
      params: { style: 'lines', count: 14, spread: 0.8, wave: 0.05, waviness: 2.4, energy: 0.25, alpha: 0.75, shift: 0.1, flow: 0.35 },
    },
    {
      name: 'Tide',
      description: 'One thick, slow, twisting band.',
      params: { count: 1, strands: 34, thickness: 160, wave: 0.18, waviness: 0.8, twist: 1, flow: 0.12, energy: 0.55, alpha: 0.55, palette: 'mapping' },
      modulations: { thickness: { source: 'bass', amount: 0.25, smooth: 0.6 } },
    },
  ],
  create(canvas) {
    const ctx = canvas.getContext('2d')!;
    const xs = new Float32Array(P);
    const yc = new Float32Array(P * MAXR);
    const th = new Float32Array(P * MAXR);
    let bands = new Float32Array(64);
    let blur = new Float32Array(64);
    let phase = 0;
    let low: HTMLCanvasElement | null = null;
    let lowCtx: CanvasRenderingContext2D | null = null;
    const ensureLow = (W: number, H: number) => {
      const w = Math.max(1, Math.ceil(W / 4));
      const h = Math.max(1, Math.ceil(H / 4));
      if (!low) {
        low = document.createElement('canvas');
        lowCtx = low.getContext('2d')!;
      }
      if (low.width !== w || low.height !== h) {
        low.width = w;
        low.height = h;
      }
      return low;
    };

    return {
      render(rc) {
        const { width: W, height: H, audio, params: p, color, dt, time } = rc;
        const nb = audio.bands.length;
        if (nb) {
          if (bands.length !== nb) bands = new Float32Array(nb);
          follow(bands, audio.bands, smoothK(0.6, dt), smoothK(0.9, dt));
          // spatial blur so ribbons swell smoothly instead of zig-zagging per band
          if (blur.length !== nb) blur = new Float32Array(nb);
          const rad = Math.max(2, Math.round(nb / 10));
          for (let i = 0; i < nb; i++) {
            let s = 0, w = 0;
            for (let j = -rad; j <= rad; j++) {
              const k = i + j;
              if (k < 0 || k >= nb) continue;
              const ww = rad + 1 - Math.abs(j);
              s += bands[k] * ww;
              w += ww;
            }
            blur[i] = s / w;
          }
        }
        const count = clamp(Math.round(num(p, 'count', 5)), 1, MAXR);
        const style = str(p, 'style', 'silk');
        const thick = num(p, 'thickness', 40);
        const spread = num(p, 'spread', 0.45);
        const wave = num(p, 'wave', 0.12) * H;
        const wav = num(p, 'waviness', 1.6);
        const energy = num(p, 'energy', 0.35) * H * 0.5;
        const twist = num(p, 'twist', 0.5);
        phase += num(p, 'flow', 0.25) * dt * (1 + audio.loudness * 0.5);
        const alpha = num(p, 'alpha', 0.5);
        const palette = str(p, 'palette', 'mapping');
        const shift = num(p, 'shift', 0.35);
        const fLo = 40;
        const fHi = 12000;

        for (let i = 0; i < P; i++) xs[i] = -0.05 * W + (i / (P - 1)) * 1.1 * W;

        // centre lines + local thickness
        for (let r = 0; r < count; r++) {
          const base = H * (0.5 + (count > 1 ? (r / (count - 1) - 0.5) * spread : 0));
          const off = r * 1.37;
          for (let i = 0; i < P; i++) {
            const u = i / (P - 1);
            const n =
              Math.sin(u * wav * 6.283 + phase * 2.1 + off) * 0.55 +
              Math.sin(u * wav * 2.7 * 6.283 - phase * 1.3 + off * 2.3) * 0.3 +
              Math.sin(u * wav * 0.6 * 6.283 + phase * 0.7 + off * 0.7) * 0.4;
            const bi = clamp(u + (r / count) * 0.15, 0, 1) * (nb - 1);
            const e = nb ? sampleLinear(blur, bi) : 0;
            yc[r * P + i] = base + n * wave - e * energy;
            th[r * P + i] = thick * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(u * 5 + phase + off))) * (0.6 + 1.2 * e);
          }
        }

        ctx.globalCompositeOperation = 'lighter';
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        const mono = hexToRgb(str(p, 'monoColor', '#7fffd4'));

        for (let r = 0; r < count; r++) {
          // horizontal colour sweep through the mapped spectrum
          let grad: CanvasGradient | string;
          if (palette === 'mono') grad = rgba(mono, 1);
          else if (palette === 'position') grad = rgba(lift(color.norm(count > 1 ? r / (count - 1) : 0.5, 0.9), 0.25), 1);
          else {
            const g = ctx.createLinearGradient(0, 0, W, 0);
            const stops = 8;
            for (let s = 0; s <= stops; s++) {
              const t = s / stops;
              const f = logFreq(t, fLo, fHi) * Math.pow(2, (r - (count - 1) / 2) * shift);
              const e = nb ? sampleLinear(bands, t * (nb - 1)) : 0.5;
              g.addColorStop(t, rgba(lift(color.freq(f, 0.5 + 0.5 * e), 0.25), 1));
            }
            grad = g;
          }
          ctx.strokeStyle = grad;
          ctx.fillStyle = grad;
          const o = r * P;

          if (style === 'lines') {
            ctx.globalAlpha = alpha;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            for (let i = 0; i < P; i++) {
              if (i === 0) ctx.moveTo(xs[i], yc[o + i]);
              else ctx.lineTo(xs[i], yc[o + i]);
            }
            ctx.stroke();
            ctx.globalAlpha = alpha * 0.15;
            ctx.lineWidth = 8;
            ctx.stroke();
          } else if (style === 'curtain') {
            const ch = num(p, 'curtain', 0.35) * H;
            // Curtains are soft, so they are filled at quarter resolution into
            // an offscreen buffer (fill-rate is the bottleneck) and upscaled.
            const cv = ensureLow(W, H);
            const g = lowCtx!;
            if (r === 0) {
              g.setTransform(1, 0, 0, 1, 0, 0);
              g.clearRect(0, 0, cv.width, cv.height);
            }
            g.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
            g.globalCompositeOperation = 'lighter';
            g.fillStyle = grad;
            const layers = 5;
            for (let l = 0; l < layers; l++) {
              const k = (l + 1) / layers;
              g.globalAlpha = ((alpha * 0.32) / layers) * 1.4 * (1.6 - k);
              g.beginPath();
              for (let i = 0; i < P; i++) {
                const y = yc[o + i] - th[o + i] * 0.5;
                if (i === 0) g.moveTo(xs[i], y);
                else g.lineTo(xs[i], y);
              }
              for (let i = P - 1; i >= 0; i--) {
                // rays: the curtain's lower edge ripples with fine structure
                const ray = 0.75 + 0.25 * Math.sin(i * 1.9 + time * 0.7 + r);
                g.lineTo(xs[i], yc[o + i] + ch * k * ray * (0.6 + th[o + i] / (thick * 1.5)));
              }
              g.closePath();
              g.fill();
            }
            if (r === count - 1) {
              ctx.globalAlpha = 1;
              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = 'high';
              ctx.drawImage(cv, 0, 0, W, H);
            }
            // bright edge
            ctx.globalAlpha = alpha * 0.9;
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (let i = 0; i < P; i++) {
              const y = yc[o + i] - th[o + i] * 0.5;
              if (i === 0) ctx.moveTo(xs[i], y);
              else ctx.lineTo(xs[i], y);
            }
            ctx.stroke();
            ctx.globalAlpha = alpha * 0.2;
            ctx.lineWidth = 10;
            ctx.stroke();
          } else {
            const S = clamp(Math.round(num(p, 'strands', 16)), 2, 40);
            ctx.lineWidth = 1;
            for (let s = 0; s < S; s++) {
              const v = s / (S - 1) - 0.5; // −0.5..0.5 across the ribbon
              ctx.globalAlpha = alpha * (0.35 + 0.65 * (1 - Math.abs(v) * 1.6));
              ctx.beginPath();
              for (let i = 0; i < P; i++) {
                const u = i / (P - 1);
                const tw = 1 - twist * 0.8 * (0.5 - 0.5 * Math.cos(u * 6.2 * (0.6 + twist) + phase * 1.7 + r * 2));
                const y = yc[o + i] + v * th[o + i] * tw;
                if (i === 0) ctx.moveTo(xs[i], y);
                else ctx.lineTo(xs[i], y);
              }
              ctx.stroke();
            }
          }
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      },
    };
  },
};

export default viz;
