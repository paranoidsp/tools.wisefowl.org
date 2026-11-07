/**
 * Shape Morph — one superformula shape whose geometry is driven by harmony,
 * timbre, loudness and beat.
 */
import type { RGB, VizDefinition } from '../../core/types';
import { TAU, bool, clamp, dominantFreq, hexToRgb, lift, num, rgba, smoothK, str } from '../_lib2d/util';

const SEG = 240;
const MAXE = 16;
const HIST = 256;

/** superformula radius with m symmetry, a = b = 1, n2 = n3 */
function sf(theta: number, m: number, n1: number, n2: number): number {
  const q = (m * theta) / 4;
  const v = Math.pow(Math.abs(Math.cos(q)), n2) + Math.pow(Math.abs(Math.sin(q)), n2);
  return v > 1e-9 ? Math.pow(v, -1 / n1) : 1;
}

const viz: VizDefinition = {
  id: 'shape-morph',
  name: 'Shape Morph',
  description:
    'A single shape that is the music’s current state: the number of corners counts the notes in the chord (triad = triangle), spikiness follows timbral brightness, size follows loudness, and each beat snaps it round. Echoes leave a trail of earlier shapes.',
  renderer: 'canvas2d',
  space: '2d',
  tags: ['shape', 'beat', 'harmony', 'geometry'],
  params: [
    {
      key: 'corners', label: 'Corners from', type: 'select', default: 'chord', group: 'Geometry',
      options: [
        { value: 'chord', label: 'Chord size (notes sounding)' },
        { value: 'pitch', label: 'Pitch class (C=3 … B=14)' },
        { value: 'fixed', label: 'Fixed' },
      ],
    },
    { key: 'vertices', label: 'Corners', type: 'number', min: 2, max: 16, step: 1, default: 5, group: 'Geometry', hint: 'Used when Corners = Fixed; minimum otherwise' },
    { key: 'threshold', label: 'Note threshold', type: 'number', min: 0.1, max: 0.95, step: 0.01, default: 0.5, group: 'Geometry' },
    { key: 'sharp', label: 'Roundness', type: 'number', min: 0.15, max: 12, step: 0.05, default: 1.1, curve: 'log', group: 'Geometry', hint: 'Superformula n₁: <1 spiky star, ≈1 polygon, >3 soft' },
    { key: 'bright', label: 'Brightness → spikes', type: 'number', min: 0, max: 1, step: 0.01, default: 0.6, group: 'Geometry' },
    { key: 'pinch', label: 'Pinch', type: 'number', min: 0.3, max: 10, step: 0.05, default: 1, curve: 'log', group: 'Geometry', hint: 'Superformula n₂ = n₃ (2 = always a circle)' },
    { key: 'morph', label: 'Morph speed', type: 'number', min: 0, max: 0.98, step: 0.01, default: 0.85, group: 'Geometry', hint: 'Smoothing between shapes' },

    { key: 'size', label: 'Size', type: 'number', min: 0.05, max: 1, step: 0.01, default: 0.45, group: 'Motion' },
    { key: 'loudSize', label: 'Loudness → size', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5, group: 'Motion' },
    { key: 'snap', label: 'Beat snap', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5, group: 'Motion', hint: 'Fraction of a corner-step turned on each beat' },
    { key: 'swell', label: 'Beat swell', type: 'number', min: 0, max: 1, step: 0.01, default: 0.3, group: 'Motion' },

    { key: 'echoes', label: 'Echoes', type: 'number', min: 0, max: MAXE, step: 1, default: 6, group: 'Echoes' },
    { key: 'echoDelay', label: 'Echo delay', type: 'number', min: 1, max: 30, step: 1, default: 6, unit: 'frames', group: 'Echoes' },
    { key: 'echoScale', label: 'Echo scale', type: 'number', min: 0.5, max: 1.5, step: 0.01, default: 1.12, group: 'Echoes', hint: '>1 echoes grow outward, <1 fall inward' },

    {
      key: 'colorBy', label: 'Colour by', type: 'select', default: 'pitch', group: 'Colour',
      options: [
        { value: 'pitch', label: 'Dominant pitch (mapping)' },
        { value: 'centroid', label: 'Brightness (centroid → mapping)' },
        { value: 'mono', label: 'Mono' },
      ],
    },
    { key: 'monoColor', label: 'Mono colour', type: 'color', default: '#ff9de2', group: 'Colour' },
    { key: 'fill', label: 'Fill', type: 'number', min: 0, max: 1, step: 0.01, default: 0.35, group: 'Colour' },
    { key: 'stroke', label: 'Outline width', type: 'number', min: 0, max: 12, step: 0.25, default: 2.5, unit: 'px', group: 'Colour' },
    { key: 'glow', label: 'Glow', type: 'boolean', default: true, group: 'Colour' },
  ],
  presets: [
    { name: 'Chord shape', description: 'Corners count the notes sounding; echoes ripple outward.', params: {} },
    {
      name: 'Star pulse',
      description: 'Spiky stars that sharpen with bright timbres and spin on beats.',
      params: { sharp: 0.45, pinch: 1.4, bright: 0.9, snap: 1, swell: 0.6, echoes: 4, echoScale: 0.82, fill: 0.5, corners: 'pitch' },
    },
    {
      name: 'Soft blob',
      description: 'Rounded pebble shapes with dense, inward-falling echoes.',
      params: { sharp: 3.5, pinch: 1.6, bright: 0.2, echoes: 14, echoDelay: 3, echoScale: 0.9, fill: 0.12, stroke: 1.5, snap: 0.2, size: 0.55 },
    },
    {
      name: 'Hex tunnel',
      description: 'A fixed hexagon whose echoes zoom outward like a tunnel.',
      params: { corners: 'fixed', vertices: 6, sharp: 1.6, pinch: 1.2, bright: 0, echoes: 16, echoDelay: 4, echoScale: 1.18, fill: 0, stroke: 2, size: 0.22, snap: 0.5 },
      modulations: { size: { source: 'bass', amount: 0.1, smooth: 0.4 } },
    },
  ],
  create(canvas) {
    const ctx = canvas.getContext('2d')!;
    // history of shape state
    const hM = new Float32Array(HIST);
    const hN = new Float32Array(HIST);
    const hR = new Float32Array(HIST);
    const hRot = new Float32Array(HIST);
    const hC: RGB[] = new Array(HIST).fill([1, 1, 1]);
    let head = 0;
    let m = 5;
    let n1 = 1.1;
    let rot = 0;
    let rotTarget = 0;
    let pulse = 0;
    let filled = 0;
    let col: RGB = [1, 1, 1];

    const shapePath = (cx: number, cy: number, R: number, mm: number, nn: number, n2: number, r0: number) => {
      const path = new Path2D();
      const mf = Math.floor(mm);
      const fr = mm - mf;
      // crossfade between integer symmetries so non-integer morphs stay closed
      let maxv = 0;
      const tmp = scratch;
      for (let i = 0; i < SEG; i++) {
        const t = (i / SEG) * TAU;
        const a = sf(t, Math.max(1, mf), nn, n2);
        const b = fr > 0.001 ? sf(t, mf + 1, nn, n2) : a;
        const v = a * (1 - fr) + b * fr;
        tmp[i] = v;
        if (v > maxv) maxv = v;
      }
      const k = maxv > 0 ? R / maxv : R;
      for (let i = 0; i < SEG; i++) {
        const t = (i / SEG) * TAU + r0;
        const rr = tmp[i] * k;
        const x = cx + Math.cos(t) * rr;
        const y = cy + Math.sin(t) * rr;
        if (i === 0) path.moveTo(x, y);
        else path.lineTo(x, y);
      }
      path.closePath();
      return path;
    };
    const scratch = new Float32Array(SEG);

    return {
      render(rc) {
        const { width: W, height: H, audio, params: p, color, dt } = rc;
        const cx = W / 2;
        const cy = H / 2;
        const Rs = Math.min(W, H) / 2;
        const thr = num(p, 'threshold', 0.5);
        const mode = str(p, 'corners', 'chord');
        const vmin = Math.round(num(p, 'vertices', 5));
        let target = vmin;
        let dom = 0;
        for (let i = 1; i < 12; i++) if (audio.chroma[i] > audio.chroma[dom]) dom = i;
        if (mode === 'chord') {
          let c = 0;
          for (let i = 0; i < 12; i++) if (audio.chroma[i] >= thr) c++;
          target = Math.max(Math.min(vmin, 3), c >= 2 ? c : vmin);
        } else if (mode === 'pitch') {
          target = 3 + dom;
        }
        const k = smoothK(num(p, 'morph', 0.85), dt);
        m += (target - m) * k;
        const brightK = num(p, 'bright', 0.6);
        const nT = num(p, 'sharp', 1.1) * (1 - brightK * 0.85 * clamp(audio.centroidNorm * 1.4 - 0.2, 0, 1));
        n1 += (Math.max(0.12, nT) - n1) * k;
        if (audio.beat) rotTarget += (TAU / Math.max(2, Math.round(m))) * num(p, 'snap', 0.5);
        rot += (rotTarget - rot) * smoothK(0.75, dt);
        pulse += (audio.beatPulse - pulse) * smoothK(0.3, dt);
        const ls = num(p, 'loudSize', 0.5);
        const R = Rs * num(p, 'size', 0.45) * (1 - ls + ls * (0.4 + 0.9 * clamp(audio.loudness, 0, 1))) * (1 + 0.25 * num(p, 'swell', 0.3) * pulse);

        const colorBy = str(p, 'colorBy', 'pitch');
        const c0: RGB =
          colorBy === 'mono' ? hexToRgb(str(p, 'monoColor', '#ff9de2'))
            : colorBy === 'centroid' ? color.freq(audio.centroid || 1000, 0.8)
              : audio.chroma[dom] > 0.05 ? color.pitchClass(dom, 0.85) : color.freq(dominantFreq(rc), 0.8);
        // ease colour so chord changes blend
        col = [col[0] + (c0[0] - col[0]) * k, col[1] + (c0[1] - col[1]) * k, col[2] + (c0[2] - col[2]) * k];
        const cc = lift(col, 0.22);

        head = (head + 1) % HIST;
        hM[head] = m;
        hN[head] = n1;
        hR[head] = R;
        hRot[head] = rot;
        hC[head] = cc;
        filled = Math.min(HIST, filled + 1);

        const n2 = num(p, 'pinch', 1);
        const echoes = clamp(Math.round(num(p, 'echoes', 6)), 0, MAXE);
        const delay = clamp(Math.round(num(p, 'echoDelay', 6)), 1, 30);
        const es = num(p, 'echoScale', 1.12);
        const sw = num(p, 'stroke', 2.5);
        const glow = bool(p, 'glow', true);
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineJoin = 'round';

        for (let e = echoes; e >= 1; e--) {
          const back = e * delay;
          if (back >= filled) continue;
          const h = (head - back + HIST) % HIST;
          const sc = Math.pow(es, e);
          const path = shapePath(cx, cy, hR[h] * sc, hM[h], hN[h], n2, hRot[h] - Math.PI / 2);
          const a = Math.pow(1 - e / (echoes + 1), 1.3);
          ctx.strokeStyle = rgba(hC[h], 0.7 * a);
          ctx.lineWidth = Math.max(0.75, sw * (0.4 + 0.6 * a));
          ctx.stroke(path);
        }

        const path = shapePath(cx, cy, R, m, n1, n2, rot - Math.PI / 2);
        const fill = num(p, 'fill', 0.35);
        if (fill > 0) {
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
          g.addColorStop(0, rgba(cc, fill, 0.35));
          g.addColorStop(0.6, rgba(cc, fill * 0.6));
          g.addColorStop(1, rgba(cc, fill * 0.25));
          ctx.fillStyle = g;
          ctx.fill(path);
        }
        if (sw > 0) {
          if (glow) {
            ctx.strokeStyle = rgba(cc, 0.12);
            ctx.lineWidth = sw * 6;
            ctx.stroke(path);
            ctx.strokeStyle = rgba(cc, 0.25);
            ctx.lineWidth = sw * 2.5;
            ctx.stroke(path);
          }
          ctx.strokeStyle = rgba(cc, 0.95, 0.3);
          ctx.lineWidth = sw;
          ctx.stroke(path);
        }
        ctx.globalCompositeOperation = 'source-over';
      },
    };
  },
};

export default viz;
