/**
 * Beat Particles — bursts of particles on beats and onsets.
 */
import type { RGB, VizDefinition } from '../../core/types';
import { GlowSprites, expandAmp, maxAmp, TAU, bool, clamp, dominantFreq, hexToRgb, lift, logNorm, num, rgba, str } from '../_lib2d/util';

const MAX = 6000;

const viz: VizDefinition = {
  id: 'beat-particles',
  name: 'Beat Particles',
  description:
    'Rhythm becomes motion: each beat fires a burst of particles and the spectral flux keeps a steady stream going. Each particle carries the colour of a spectral peak sounding when it was born, and can be launched from a spot set by its pitch (x) and loudness (y).',
  renderer: 'canvas2d',
  space: '2d',
  tags: ['rhythm', 'beat', 'particles'],
  params: [
    {
      key: 'emitter', label: 'Emit from', type: 'select', default: 'center', group: 'Emitter',
      options: [
        { value: 'center', label: 'Centre' },
        { value: 'ring', label: 'Ring' },
        { value: 'random', label: 'Random spots' },
        { value: 'pitch', label: 'Pitch map (x = pitch, y = loudness)' },
        { value: 'fountain', label: 'Fountain (x = pitch, from below)' },
      ],
    },
    { key: 'burst', label: 'Burst per beat', type: 'number', min: 0, max: 400, step: 1, default: 90, group: 'Emitter' },
    { key: 'rate', label: 'Flux stream', type: 'number', min: 0, max: 600, step: 1, default: 60, unit: '/s', group: 'Emitter', hint: 'Continuous emission, scaled by spectral flux' },
    { key: 'ringRadius', label: 'Ring radius', type: 'number', min: 0.05, max: 1, step: 0.01, default: 0.35, group: 'Emitter' },
    { key: 'max', label: 'Max particles', type: 'number', min: 200, max: MAX, step: 100, default: 3000, group: 'Emitter' },

    { key: 'speed', label: 'Speed', type: 'number', min: 10, max: 1500, step: 5, default: 340, unit: 'px/s', group: 'Physics', curve: 'log' },
    { key: 'fluxSpeed', label: 'Flux → speed', type: 'number', min: 0, max: 2, step: 0.01, default: 0.8, group: 'Physics' },
    { key: 'spread', label: 'Spread', type: 'number', min: 0, max: 360, step: 1, default: 360, unit: '°', group: 'Physics', hint: 'Fountain cone / burst arc' },
    { key: 'gravity', label: 'Gravity', type: 'number', min: -800, max: 800, step: 5, default: 60, unit: 'px/s²', group: 'Physics' },
    { key: 'drag', label: 'Drag', type: 'number', min: 0, max: 0.2, step: 0.002, default: 0.025, group: 'Physics' },
    { key: 'life', label: 'Lifetime', type: 'number', min: 0.2, max: 8, step: 0.05, default: 2, unit: 's', group: 'Physics' },

    {
      key: 'shape', label: 'Shape', type: 'select', default: 'glow', group: 'Look',
      options: [
        { value: 'glow', label: 'Glow dot' },
        { value: 'circle', label: 'Circle' },
        { value: 'square', label: 'Square' },
        { value: 'triangle', label: 'Triangle (points along motion)' },
        { value: 'line', label: 'Streak' },
      ],
    },
    { key: 'size', label: 'Size', type: 'number', min: 0.5, max: 40, step: 0.25, default: 5, unit: 'px', group: 'Look' },
    { key: 'shrink', label: 'Shrink with age', type: 'number', min: 0, max: 1, step: 0.01, default: 0.6, group: 'Look' },
    {
      key: 'colorBy', label: 'Colour by', type: 'select', default: 'peak', group: 'Look',
      options: [
        { value: 'peak', label: 'Spectral peak at birth (mapping)' },
        { value: 'pitch', label: 'Dominant pitch (mapping)' },
        { value: 'centroid', label: 'Brightness (centroid → mapping)' },
        { value: 'position', label: 'Palette by birth position' },
        { value: 'mono', label: 'Mono' },
      ],
    },
    { key: 'monoColor', label: 'Mono colour', type: 'color', default: '#ffd27a', group: 'Look' },
    { key: 'additive', label: 'Additive light', type: 'boolean', default: true, group: 'Look' },
  ],
  presets: [
    { name: 'Supernova', description: 'Radial bursts from the centre on every beat.', params: { size: 5, speed: 460, burst: 70, rate: 30, drag: 0.035, gravity: 0, life: 1.6 } },
    {
      name: 'Pitch fountain',
      description: 'Notes spray up from where they sit on the keyboard, then fall.',
      params: { emitter: 'fountain', burst: 40, rate: 140, speed: 620, spread: 28, gravity: 520, drag: 0.006, life: 2.6, shape: 'glow', size: 4.5 },
    },
    {
      name: 'Pitch constellation',
      description: 'Particles bloom where pitch (x) and loudness (y) place them and drift slowly.',
      params: { emitter: 'pitch', burst: 30, rate: 160, speed: 60, gravity: -15, drag: 0.04, life: 3.5, shape: 'circle', size: 3, shrink: 0.8, fluxSpeed: 0.2 },
    },
    {
      name: 'Shockwave streaks',
      description: 'A ring of streaks flung outward by each beat.',
      params: { emitter: 'ring', ringRadius: 0.18, burst: 220, rate: 0, speed: 700, drag: 0.06, gravity: 0, life: 1.2, shape: 'line', size: 2, colorBy: 'position' },
      modulations: { speed: { source: 'bass', amount: 0.3, smooth: 0.3 } },
    },
  ],
  create(canvas) {
    const ctx = canvas.getContext('2d')!;
    const px = new Float32Array(MAX);
    const py = new Float32Array(MAX);
    const vx = new Float32Array(MAX);
    const vy = new Float32Array(MAX);
    const age = new Float32Array(MAX);
    const life = new Float32Array(MAX);
    const sz = new Float32Array(MAX);
    const fill: string[] = new Array(MAX).fill('#fff');
    const rgbs: RGB[] = new Array(MAX).fill([1, 1, 1]);
    let count = 0;
    let acc = 0;
    let spot = { x: 0, y: 0 };
    let spotAge = 99;
    const sprites = new GlowSprites(48, 20);

    return {
      render(rc) {
        const { width: W, height: H, audio, params: p, color, dt } = rc;
        const cap = clamp(Math.round(num(p, 'max', 3000)), 100, MAX);
        const emitter = str(p, 'emitter', 'center');
        const colorBy = str(p, 'colorBy', 'peak');
        const mono = hexToRgb(str(p, 'monoColor', '#ffd27a'));
        const loud = clamp(audio.loudness, 0, 1);
        const flux = clamp(audio.flux, 0, 1);
        const speed = num(p, 'speed', 340) * (1 + num(p, 'fluxSpeed', 0.8) * flux * 2);
        const spread = (num(p, 'spread', 360) * Math.PI) / 180;
        const lifeS = num(p, 'life', 2);
        const size = num(p, 'size', 5);
        const cx = W / 2;
        const cy = H / 2;
        const R = Math.min(W, H) / 2;
        const peaks = audio.peaks;
        const amax = maxAmp(peaks);
        const dom = dominantFreq(rc);
        spotAge += dt;
        if (audio.beat || spotAge > 0.6) {
          spot = { x: W * (0.15 + 0.7 * Math.random()), y: H * (0.15 + 0.7 * Math.random()) };
          spotAge = 0;
        }

        const emit = (n: number) => {
          for (let e = 0; e < n; e++) {
            if (count >= cap) {
              // recycle the oldest-ish particle
              const j = (Math.random() * count) | 0;
              count--;
              px[j] = px[count]; py[j] = py[count]; vx[j] = vx[count]; vy[j] = vy[count];
              age[j] = age[count]; life[j] = life[count]; sz[j] = sz[count]; fill[j] = fill[count]; rgbs[j] = rgbs[count];
            }
            const i = count++;
            // choose a spectral peak, weighted toward the loud ones
            let f = dom;
            let amp = loud;
            if (peaks.length) {
              const k = Math.min(peaks.length - 1, Math.floor(Math.pow(Math.random(), 2) * Math.min(12, peaks.length)));
              f = peaks[k].freq;
              amp = expandAmp(peaks[k].amp, amax, 0.4);
            }
            const pn = logNorm(f, 40, 8000);
            let x = cx, y = cy, a = Math.random() * TAU;
            if (spread < TAU) a = -Math.PI / 2 + (Math.random() - 0.5) * spread;
            switch (emitter) {
              case 'ring': {
                const th = Math.random() * TAU;
                x = cx + Math.cos(th) * R * num(p, 'ringRadius', 0.35);
                y = cy + Math.sin(th) * R * num(p, 'ringRadius', 0.35);
                a = th + (spread < TAU ? (Math.random() - 0.5) * spread * 0.25 : 0);
                break;
              }
              case 'random':
                x = spot.x + (Math.random() - 0.5) * 12;
                y = spot.y + (Math.random() - 0.5) * 12;
                break;
              case 'pitch':
                x = W * (0.05 + 0.9 * pn) + (Math.random() - 0.5) * 10;
                y = H * (0.85 - 0.6 * loud + (Math.random() - 0.5) * 0.25 * (1.2 - amp));
                break;
              case 'fountain':
                x = W * (0.05 + 0.9 * pn) + (Math.random() - 0.5) * 8;
                y = H + 4;
                break;
              default:
                x = cx + (Math.random() - 0.5) * 6;
                y = cy + (Math.random() - 0.5) * 6;
            }
            const s = speed * (0.35 + 0.65 * Math.random());
            px[i] = x;
            py[i] = y;
            vx[i] = Math.cos(a) * s;
            vy[i] = Math.sin(a) * s;
            age[i] = 0;
            life[i] = lifeS * (0.6 + 0.8 * Math.random());
            sz[i] = size * (0.5 + 0.9 * Math.random()) * (0.6 + 0.6 * loud);
            let c: RGB;
            switch (colorBy) {
              case 'pitch': c = color.freq(dom, 0.8); break;
              case 'centroid': c = color.freq(audio.centroid || 1000, 0.8); break;
              case 'position': c = color.norm(emitter === 'center' || emitter === 'ring' ? ((a / TAU) % 1 + 1) % 1 : x / W, 0.8); break;
              case 'mono': c = mono; break;
              default: c = color.freq(f, 0.5 + 0.5 * amp);
            }
            c = lift(c, 0.22);
            rgbs[i] = c;
            fill[i] = rgba(c, 1, 0.1);
          }
        };

        if (audio.beat) emit(Math.round(num(p, 'burst', 90) * (0.5 + loud)));
        acc += num(p, 'rate', 60) * (0.15 + flux * 3) * dt;
        if (acc >= 1) {
          const n = Math.floor(acc);
          acc -= n;
          emit(Math.min(n, 400));
        }

        // integrate
        const g = num(p, 'gravity', 60);
        const drag = Math.pow(1 - num(p, 'drag', 0.025), dt * 60);
        for (let i = 0; i < count; ) {
          age[i] += dt;
          if (age[i] >= life[i] || px[i] < -100 || px[i] > W + 100 || py[i] > H + 200 || py[i] < -400) {
            count--;
            px[i] = px[count]; py[i] = py[count]; vx[i] = vx[count]; vy[i] = vy[count];
            age[i] = age[count]; life[i] = life[count]; sz[i] = sz[count]; fill[i] = fill[count]; rgbs[i] = rgbs[count];
            continue;
          }
          vy[i] += g * dt;
          vx[i] *= drag;
          vy[i] *= drag;
          px[i] += vx[i] * dt;
          py[i] += vy[i] * dt;
          i++;
        }

        // draw
        ctx.globalCompositeOperation = bool(p, 'additive', true) ? 'lighter' : 'source-over';
        const shape = str(p, 'shape', 'glow');
        const shrink = num(p, 'shrink', 0.6);
        ctx.lineCap = 'round';
        for (let i = 0; i < count; i++) {
          const t = age[i] / life[i];
          const a = t < 0.08 ? t / 0.08 : 1 - (t - 0.08) / 0.92;
          const s = sz[i] * (1 - shrink * t);
          if (s < 0.2 || a <= 0.01) continue;
          ctx.globalAlpha = a * a * 0.95;
          const x = px[i];
          const y = py[i];
          switch (shape) {
            case 'glow': {
              const d = s * 5;
              ctx.drawImage(sprites.get(rgbs[i]), x - d / 2, y - d / 2, d, d);
              break;
            }
            case 'square':
              ctx.fillStyle = fill[i];
              ctx.fillRect(x - s, y - s, s * 2, s * 2);
              break;
            case 'triangle': {
              const sp = Math.hypot(vx[i], vy[i]) || 1;
              const ux = vx[i] / sp;
              const uy = vy[i] / sp;
              ctx.fillStyle = fill[i];
              ctx.beginPath();
              ctx.moveTo(x + ux * s * 2, y + uy * s * 2);
              ctx.lineTo(x - ux * s - uy * s, y - uy * s + ux * s);
              ctx.lineTo(x - ux * s + uy * s, y - uy * s - ux * s);
              ctx.fill();
              break;
            }
            case 'line': {
              ctx.strokeStyle = fill[i];
              ctx.lineWidth = s;
              ctx.beginPath();
              ctx.moveTo(x, y);
              ctx.lineTo(x - vx[i] * 0.05, y - vy[i] * 0.05);
              ctx.stroke();
              break;
            }
            default:
              ctx.fillStyle = fill[i];
              ctx.beginPath();
              ctx.arc(x, y, s, 0, TAU);
              ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      },
      dispose() {
        count = 0;
      },
    };
  },
};

export default viz;
