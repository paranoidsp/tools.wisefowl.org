/**
 * Spectrogram — a scrolling history of the spectrum (linear, waterfall, or
 * polar "vinyl" / "ripple" layouts). History lives in a packed RGBA ring
 * buffer; each frame writes one or more new columns and re-lays out the image.
 */
import type { VizDefinition } from '../../core/types';
import { bool, clamp, hexToRgb, num, str } from '../_lib2d/util';

const MAX_ROWS = 512;

const viz: VizDefinition = {
  id: 'spectrogram',
  name: 'Spectrogram',
  description:
    'Time becomes space: every frame the spectrum is painted as a new line and pushed along, so melodies trace curves and harmonics stack into stripes. Colour comes from each row’s frequency through the mapping (or from intensity), and brightness from loudness.',
  renderer: 'canvas2d',
  space: '2d',
  tags: ['spectrum', 'history', 'classic', 'analysis'],
  params: [
    {
      key: 'layout', label: 'Layout', type: 'select', default: 'horizontal', group: 'Layout',
      options: [
        { value: 'horizontal', label: 'Horizontal (time → left)' },
        { value: 'vertical', label: 'Waterfall (time ↓)' },
        { value: 'vinyl', label: 'Vinyl (time = angle, pitch = radius)' },
        { value: 'ripple', label: 'Ripple (time = radius, pitch = angle)' },
      ],
    },
    { key: 'mirror', label: 'Mirror', type: 'boolean', default: false, group: 'Layout', hint: 'Linear layouts: reflect around the centre line' },
    { key: 'inner', label: 'Inner radius', type: 'number', min: 0, max: 0.8, step: 0.01, default: 0.18, group: 'Layout', hint: 'Polar layouts' },
    { key: 'size', label: 'Size', type: 'number', min: 0.3, max: 1.5, step: 0.01, default: 0.95, group: 'Layout', hint: 'Polar layouts: diameter vs. stage' },

    { key: 'speed', label: 'Scroll speed', type: 'number', min: 1, max: 8, step: 1, default: 2, unit: 'col/frame', group: 'Time' },
    { key: 'history', label: 'History length', type: 'number', min: 120, max: 1600, step: 10, default: 640, unit: 'cols', group: 'Time' },
    { key: 'fade', label: 'Fade with age', type: 'number', min: 0, max: 1, step: 0.01, default: 0.35, group: 'Time' },

    { key: 'scale', label: 'Frequency axis', type: 'select', default: 'log', group: 'Frequency', options: [ { value: 'log', label: 'Logarithmic (musical)' }, { value: 'linear', label: 'Linear' } ] },
    { key: 'minFreq', label: 'Lowest frequency', type: 'number', min: 20, max: 1000, step: 1, default: 40, unit: 'Hz', curve: 'log', group: 'Frequency' },
    { key: 'maxFreq', label: 'Highest frequency', type: 'number', min: 1000, max: 20000, step: 10, default: 12000, unit: 'Hz', curve: 'log', group: 'Frequency' },
    { key: 'rows', label: 'Resolution', type: 'number', min: 64, max: MAX_ROWS, step: 16, default: 320, group: 'Frequency', hint: 'Frequency rows in the history buffer' },

    {
      key: 'colorBy', label: 'Colour by', type: 'select', default: 'mapping', group: 'Colour',
      options: [
        { value: 'mapping', label: 'Frequency (global mapping)' },
        { value: 'intensity', label: 'Intensity (palette by level)' },
        { value: 'mono', label: 'Mono' },
      ],
    },
    { key: 'monoColor', label: 'Mono colour', type: 'color', default: '#8fd3ff', group: 'Colour' },
    { key: 'gain', label: 'Gain', type: 'number', min: 0.3, max: 4, step: 0.01, default: 1, group: 'Colour' },
    { key: 'tilt', label: 'Spectral tilt', type: 'number', min: -0.5, max: 1, step: 0.01, default: 0.3, group: 'Colour', hint: 'Boost highs / tame bass (music energy falls with frequency)' },
    { key: 'floor', label: 'Noise floor', type: 'number', min: 0, max: 0.8, step: 0.01, default: 0.3, group: 'Colour', hint: 'Levels below this are transparent' },
    { key: 'contrast', label: 'Contrast', type: 'number', min: 0.3, max: 3, step: 0.01, default: 1.4, group: 'Colour' },
    { key: 'hot', label: 'White-hot peaks', type: 'number', min: 0, max: 1, step: 0.01, default: 0.35, group: 'Colour' },
  ],
  presets: [
    { name: 'Studio', description: 'Classic right-to-left log spectrogram.', params: {} },
    {
      name: 'Waterfall',
      description: 'Falls downward, coloured by intensity — a heat map of the music.',
      params: { layout: 'vertical', colorBy: 'intensity', speed: 2, history: 520, contrast: 1.3, floor: 0.32, hot: 0.2, fade: 0.6 },
    },
    {
      name: 'Vinyl',
      description: 'The last few seconds wound around a record: low notes inside, highs at the rim.',
      params: { layout: 'vinyl', inner: 0.16, history: 600, speed: 1, minFreq: 50, maxFreq: 8000, contrast: 1.6, fade: 0.5, hot: 0.45 },
    },
    {
      name: 'Ripple',
      description: 'Sound spreads out from the centre like rings on water; pitch is the angle.',
      params: { layout: 'ripple', inner: 0.02, history: 360, speed: 1, rows: 256, minFreq: 50, maxFreq: 6000, fade: 0.8, contrast: 1.2, size: 1.2 },
    },
    {
      name: 'Mirror horizon',
      description: 'Symmetric about the horizon, bass in the middle.',
      params: { mirror: true, speed: 3, history: 480, floor: 0.34, contrast: 1.8, hot: 0.6, minFreq: 30, maxFreq: 9000 },
    },
  ],
  create(canvas) {
    const ctx = canvas.getContext('2d')!;
    let cols = 0;
    let rows = 0;
    let hist = new Uint32Array(0);
    let head = 0;
    // per-row frequency mapping
    const binLo = new Float32Array(MAX_ROWS);
    const binHi = new Float32Array(MAX_ROWS);
    const rowW = new Float32Array(MAX_ROWS);
    const rowR = new Uint8ClampedArray(MAX_ROWS);
    const rowG = new Uint8ClampedArray(MAX_ROWS);
    const rowB = new Uint8ClampedArray(MAX_ROWS);
    const lutR = new Uint8ClampedArray(256);
    const lutG = new Uint8ClampedArray(256);
    const lutB = new Uint8ClampedArray(256);
    const fadeLut = new Uint16Array(MAX_ROWS * 4);
    let mapKey = '';
    let colorKey: unknown = null;
    let off: HTMLCanvasElement | null = null;
    let offCtx: CanvasRenderingContext2D | null = null;
    let img: ImageData | null = null;
    let img32 = new Uint32Array(0);
    // polar look-up: output pixel → (age, row) or -1
    let polar = new Int32Array(0);
    let polarKey = '';
    let S = 0;

    const ensureOff = (w: number, h: number) => {
      if (!off) {
        off = document.createElement('canvas');
        offCtx = off.getContext('2d')!;
      }
      if (off.width !== w || off.height !== h || !img) {
        off.width = w;
        off.height = h;
        img = offCtx!.createImageData(w, h);
        img32 = new Uint32Array(img.data.buffer);
      }
    };

    return {
      render(rc) {
        const { width: W, height: H, audio, params: p, color } = rc;
        const layout = str(p, 'layout', 'horizontal');
        const wantRows = clamp(Math.round(num(p, 'rows', 320)), 16, MAX_ROWS);
        const wantCols = clamp(Math.round(num(p, 'history', 640)), 32, 4096);
        if (wantRows !== rows || wantCols !== cols) {
          rows = wantRows;
          cols = wantCols;
          hist = new Uint32Array(rows * cols);
          head = 0;
          mapKey = '';
          polarKey = '';
        }
        const fmin = num(p, 'minFreq', 40);
        const fmax = Math.max(fmin * 2, num(p, 'maxFreq', 12000));
        const logScale = str(p, 'scale', 'log') === 'log';
        const colorBy = str(p, 'colorBy', 'mapping');
        const mono = str(p, 'monoColor', '#8fd3ff');
        const spec = audio.spectrum;
        const binHz = audio.sampleRate / audio.fftSize;
        const tilt = num(p, 'tilt', 0.3);
        const key = `${rows}|${fmin}|${fmax}|${logScale}|${binHz}|${colorBy}|${mono}|${tilt}`;
        if (key !== mapKey || color !== colorKey) {
          mapKey = key;
          colorKey = color;
          for (let r = 0; r < rows; r++) {
            // row 0 = lowest frequency
            const t0 = r / rows;
            const t1 = (r + 1) / rows;
            const f0 = logScale ? fmin * Math.pow(fmax / fmin, t0) : fmin + (fmax - fmin) * t0;
            const f1 = logScale ? fmin * Math.pow(fmax / fmin, t1) : fmin + (fmax - fmin) * t1;
            binLo[r] = f0 / binHz;
            binHi[r] = f1 / binHz;
            rowW[r] = Math.min(3, Math.max(0.25, Math.pow(Math.sqrt(f0 * f1) / 1000, tilt)));
            const c = colorBy === 'mono' ? hexToRgb(mono) : color.freq(Math.sqrt(f0 * f1), 1);
            // keep colours bright: normalise to max channel so alpha carries intensity
            const mx = Math.max(c[0], c[1], c[2], 0.05);
            const k = colorBy === 'mono' ? 1 : 1 / mx;
            rowR[r] = c[0] * k * 255;
            rowG[r] = c[1] * k * 255;
            rowB[r] = c[2] * k * 255;
          }
          for (let i = 0; i < 256; i++) {
            const c = color.norm(i / 255, 1);
            const mx = Math.max(c[0], c[1], c[2], 0.05);
            lutR[i] = (c[0] / mx) * 255;
            lutG[i] = (c[1] / mx) * 255;
            lutB[i] = (c[2] / mx) * 255;
          }
        }

        // write new columns
        const gain = num(p, 'gain', 1);
        const floor = num(p, 'floor', 0.3);
        const contrast = num(p, 'contrast', 1.4);
        const hot = num(p, 'hot', 0.35);
        const speed = clamp(Math.round(num(p, 'speed', 2)), 1, 8);
        const nb = spec.length;
        if (nb > 0) {
          head = (head + 1) % cols;
          const base = head * rows;
          for (let r = 0; r < rows; r++) {
            const lo = binLo[r];
            const hi = binHi[r];
            let v: number;
            if (hi - lo < 1) {
              const x = (lo + hi) / 2;
              const i = x | 0;
              const f = x - i;
              v = i + 1 < nb ? spec[i] * (1 - f) + spec[i + 1] * f : 0;
            } else {
              v = 0;
              const e = Math.min(nb, Math.ceil(hi));
              for (let i = Math.max(0, lo | 0); i < e; i++) if (spec[i] > v) v = spec[i];
            }
            v = (v * gain * rowW[r] - floor) / (1 - floor);
            if (v <= 0) {
              hist[base + r] = 0;
              continue;
            }
            if (v > 1) v = 1;
            v = Math.pow(v, contrast);
            let R: number, G: number, B: number;
            if (colorBy === 'intensity') {
              const li = (v * 255) | 0;
              R = lutR[li];
              G = lutG[li];
              B = lutB[li];
            } else {
              R = rowR[r];
              G = rowG[r];
              B = rowB[r];
            }
            const w = hot * v * v * v;
            R += (255 - R) * w;
            G += (255 - G) * w;
            B += (255 - B) * w;
            const A = Math.min(255, v * 300);
            hist[base + r] = ((A & 255) << 24) | ((B & 255) << 16) | ((G & 255) << 8) | (R & 255);
          }
          // extra columns for speed > 1 duplicate the latest one
          for (let s = 1; s < speed; s++) {
            const prev = head * rows;
            head = (head + 1) % cols;
            hist.copyWithin(head * rows, prev, prev + rows);
          }
        }

        // age fade LUT (256-step)
        const fade = num(p, 'fade', 0.35);
        for (let i = 0; i < 256; i++) fadeLut[i] = Math.round(256 * (1 - fade * Math.pow(i / 255, 1.5)));
        const ageScale = 255 / Math.max(1, cols - 1);

        const pack = (px: number, age: number) => {
          if (px === 0) return 0;
          const a = ((px >>> 24) * fadeLut[(age * ageScale) | 0]) >> 8;
          return ((a & 255) << 24) | (px & 0x00ffffff);
        };

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        if (layout === 'horizontal' || layout === 'vertical') {
          const horiz = layout === 'horizontal';
          if (horiz) ensureOff(cols, rows);
          else ensureOff(rows, cols);
          const out = img32;
          if (horiz) {
            // x: oldest → newest (left → right); y: top = highest freq
            for (let x = 0; x < cols; x++) {
              const age = cols - 1 - x;
              const col = ((head - age) % cols + cols) % cols;
              const src = col * rows;
              for (let r = 0; r < rows; r++) out[(rows - 1 - r) * cols + x] = pack(hist[src + r], age);
            }
          } else {
            // y: newest at top; x: low → high freq
            for (let y = 0; y < cols; y++) {
              const col = ((head - y) % cols + cols) % cols;
              const src = col * rows;
              const dst = y * rows;
              for (let r = 0; r < rows; r++) out[dst + r] = pack(hist[src + r], y);
            }
          }
          offCtx!.putImageData(img!, 0, 0);
          if (bool(p, 'mirror', false)) {
            if (horiz) {
              // low freqs meet in the middle
              ctx.drawImage(off!, 0, 0, W, H / 2);
              ctx.save();
              ctx.translate(0, H);
              ctx.scale(1, -1);
              ctx.drawImage(off!, 0, 0, W, H / 2);
              ctx.restore();
            } else {
              ctx.save();
              ctx.translate(W / 2, 0);
              ctx.scale(-1, 1);
              ctx.drawImage(off!, 0, 0, W / 2, H);
              ctx.restore();
              ctx.drawImage(off!, W / 2, 0, W / 2, H);
            }
          } else {
            ctx.drawImage(off!, 0, 0, W, H);
          }
          return;
        }

        // polar layouts
        const inner = num(p, 'inner', 0.18);
        const size = Math.round(clamp(Math.min(W, H) * num(p, 'size', 0.95) * Math.min(rc.dpr, 1.5) * 0.75, 128, 560));
        const pk = `${layout}|${size}|${inner}|${rows}|${cols}`;
        if (pk !== polarKey) {
          polarKey = pk;
          S = size;
          polar = new Int32Array(S * S);
          const c = S / 2;
          for (let y = 0; y < S; y++) {
            for (let x = 0; x < S; x++) {
              const dx = (x + 0.5 - c) / c;
              const dy = (y + 0.5 - c) / c;
              const rr = Math.sqrt(dx * dx + dy * dy);
              let idx = -1;
              if (rr <= 1 && rr >= inner) {
                const rn = (rr - inner) / (1 - inner);
                // angle from 12 o'clock, clockwise, 0..1
                let th = Math.atan2(dx, -dy) / (2 * Math.PI);
                if (th < 0) th += 1;
                let age: number, row: number;
                if (layout === 'vinyl') {
                  age = Math.min(cols - 1, Math.floor((1 - th) * cols));
                  row = Math.min(rows - 1, Math.floor(rn * rows));
                } else {
                  age = Math.min(cols - 1, Math.floor(rn * cols));
                  const sym = th <= 0.5 ? th * 2 : (1 - th) * 2; // 0 at top, 1 at bottom
                  row = Math.min(rows - 1, Math.floor(sym * rows));
                }
                idx = (age << 12) | row;
              }
              polar[y * S + x] = idx;
            }
          }
        }
        ensureOff(S, S);
        const out = img32;
        const n = S * S;
        for (let i = 0; i < n; i++) {
          const idx = polar[i];
          if (idx < 0) {
            out[i] = 0;
            continue;
          }
          const age = idx >>> 12;
          const row = idx & 4095;
          const col = ((head - age) % cols + cols) % cols;
          out[i] = pack(hist[col * rows + row], age);
        }
        offCtx!.putImageData(img!, 0, 0);
        const D = Math.min(W, H) * num(p, 'size', 0.95);
        ctx.drawImage(off!, (W - D) / 2, (H - D) / 2, D, D);
      },
    };
  },
};

export default viz;
