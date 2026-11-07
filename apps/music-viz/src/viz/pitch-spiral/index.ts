/**
 * Pitch Spiral — every spectral peak placed on a spiral where angle = pitch
 * class and radius = octave.
 */
import type { RGB, VizDefinition } from '../../core/types';
import { FIFTHS_POS, GlowSprites, expandAmp, maxAmp, NOTE_NAMES, TAU, bool, clamp, hexToRgb, lift, num, pitchClassOf, rgba, str } from '../_lib2d/util';

const MAXK = 32;
const MAXH = 180;

const viz: VizDefinition = {
  id: 'pitch-spiral',
  name: 'Pitch Spiral',
  description:
    'Pitch has two dimensions, the note name and the octave. Here angle = pitch class and radius = octave, so every spectral peak lands on a spiral: octaves line up on the same spoke, a harmonic series fans out into a recognisable shape, and chords appear as clusters of spokes.',
  renderer: 'canvas2d',
  space: '2d',
  tags: ['pitch', 'harmony', 'space', 'peaks'],
  params: [
    {
      key: 'order', label: 'Angle order', type: 'select', default: 'chromatic', group: 'Space',
      options: [
        { value: 'chromatic', label: 'Chromatic (continuous spiral)' },
        { value: 'fifths', label: 'Circle of fifths (spokes)' },
      ],
    },
    { key: 'lowFreq', label: 'Centre pitch', type: 'number', min: 16, max: 440, step: 0.5, default: 41.2, unit: 'Hz', curve: 'log', group: 'Space', hint: 'Frequency at the spiral’s centre' },
    { key: 'octaves', label: 'Octaves', type: 'number', min: 2, max: 10, step: 0.25, default: 7, group: 'Space' },
    { key: 'inner', label: 'Inner radius', type: 'number', min: 0, max: 0.5, step: 0.01, default: 0.08, group: 'Space' },
    { key: 'outer', label: 'Outer radius', type: 'number', min: 0.3, max: 1.2, step: 0.01, default: 0.92, group: 'Space' },
    { key: 'radial', label: 'Radius curve', type: 'number', min: 0.4, max: 2, step: 0.01, default: 0.85, group: 'Space', hint: '<1 gives low octaves more room' },
    { key: 'spin', label: 'Spin', type: 'number', min: -60, max: 60, step: 0.5, default: 0, unit: '°/s', group: 'Space' },

    { key: 'peaks', label: 'Peaks', type: 'number', min: 1, max: MAXK, step: 1, default: 20, group: 'Peaks' },
    { key: 'threshold', label: 'Threshold', type: 'number', min: 0, max: 0.9, step: 0.01, default: 0.12, group: 'Peaks' },
    { key: 'dotSize', label: 'Dot size', type: 'number', min: 2, max: 80, step: 0.5, default: 22, unit: 'px', group: 'Peaks' },
    { key: 'trail', label: 'Trail', type: 'number', min: 0, max: MAXH, step: 1, default: 45, unit: 'frames', group: 'Peaks' },
    { key: 'connect', label: 'Connect in pitch order', type: 'boolean', default: false, group: 'Peaks', hint: 'A line through the current peaks, low to high' },
    { key: 'fundamental', label: 'Mark fundamental', type: 'boolean', default: true, group: 'Peaks' },

    { key: 'guides', label: 'Guides', type: 'number', min: 0, max: 1, step: 0.01, default: 0.45, group: 'Guides' },
    { key: 'labels', label: 'Note names', type: 'boolean', default: true, group: 'Guides' },
    {
      key: 'palette', label: 'Palette', type: 'select', default: 'mapping', group: 'Colour',
      options: [
        { value: 'mapping', label: 'Mapping (by frequency)' },
        { value: 'pitch', label: 'Mapping (by pitch class)' },
        { value: 'octave', label: 'Palette by octave' },
        { value: 'mono', label: 'Mono' },
      ],
    },
    { key: 'monoColor', label: 'Mono colour', type: 'color', default: '#bfe3ff', group: 'Colour' },
  ],
  presets: [
    { name: 'Spiral of pitch', description: 'Chromatic spiral with fading trails and a marked fundamental.', params: {} },
    {
      name: 'Fifths spokes',
      description: 'Circle-of-fifths order: a key lights a compact fan of neighbouring spokes.',
      params: { order: 'fifths', trail: 80, dotSize: 16, connect: false, guides: 0.55, radial: 1 },
    },
    {
      name: 'Harmonic thread',
      description: 'Peaks joined low → high: timbre traced as a single line through pitch space.',
      params: { connect: true, trail: 12, dotSize: 14, peaks: 24, guides: 0.25, labels: false, spin: 4 },
    },
    {
      name: 'Nebula',
      description: 'Big soft dots and long trails; let it smear into clouds.',
      params: { dotSize: 30, trail: 150, threshold: 0.1, guides: 0.08, labels: false, fundamental: false, palette: 'pitch', peaks: 28 },
      modulations: { dotSize: { source: 'beatPulse', amount: 0.15, smooth: 0.3 } },
    },
  ],
  create(canvas) {
    const ctx = canvas.getContext('2d')!;
    const hf = new Float32Array(MAXH * MAXK);
    const ha = new Float32Array(MAXH * MAXK);
    const hn = new Uint8Array(MAXH);
    let head = 0;
    let rot = 0;
    const sprites = new GlowSprites(64, 20);
    const cur: { f: number; a: number }[] = [];
    let guideCache: { key: string; canvas: HTMLCanvasElement } | null = null;

    return {
      render(rc) {
        const { width: W, height: H, audio, params: p, color, dt } = rc;
        const cx = W / 2;
        const cy = H / 2;
        const R = Math.min(W, H) / 2;
        const a4 = color.settings.a4;
        const fifths = str(p, 'order', 'chromatic') === 'fifths';
        const low = num(p, 'lowFreq', 41.2);
        const oct = num(p, 'octaves', 7);
        const r0 = R * num(p, 'inner', 0.08);
        const r1 = R * num(p, 'outer', 0.92);
        const curve = num(p, 'radial', 0.85);
        rot += (num(p, 'spin', 0) * Math.PI / 180) * dt;
        const palette = str(p, 'palette', 'mapping');
        const mono = hexToRgb(str(p, 'monoColor', '#bfe3ff'));

        // position of a frequency in pitch space
        const lowPc = pitchClassOf(low, a4);
        const angleOf = (pc: number) => {
          let pos = pc;
          if (fifths) {
            const n = Math.round(pc) % 12;
            pos = FIFTHS_POS[n] + (pc - Math.round(pc));
          }
          return rot - Math.PI / 2 + (pos / 12) * TAU;
        };
        const place = (f: number, out: { x: number; y: number; r: number }) => {
          const o = Math.log2(f / low);
          let t = clamp(o / oct, 0, 1);
          t = Math.pow(t, curve);
          const r = r0 + (r1 - r0) * t;
          const th = angleOf(pitchClassOf(f, a4));
          out.x = cx + Math.cos(th) * r;
          out.y = cy + Math.sin(th) * r;
          out.r = r;
        };
        const colOf = (f: number, a: number): RGB => {
          switch (palette) {
            case 'pitch': return lift(color.pitchClass(pitchClassOf(f, a4), a), 0.2);
            case 'octave': return lift(color.norm(clamp(Math.log2(f / low) / oct, 0, 1), a), 0.2);
            case 'mono': return mono;
            default: return lift(color.freq(f, a), 0.2);
          }
        };

        // guides (cached to an offscreen canvas; they only change with layout)
        const guides = num(p, 'guides', 0.45);
        const labels = bool(p, 'labels', true);
        if (guides > 0 || labels) {
          const key = `${W}|${H}|${rc.dpr}|${fifths}|${low}|${oct}|${r0}|${r1}|${curve}|${guides}|${labels}|${a4}|${color.settings.mode}|${color.settings.hueOffset}`;
          if (!guideCache || guideCache.key !== key) {
            const rotSaved = rot;
            rot = 0;
            const gc = guideCache?.canvas ?? document.createElement('canvas');
            gc.width = Math.round(W * rc.dpr);
            gc.height = Math.round(H * rc.dpr);
            const g = gc.getContext('2d')!;
            g.setTransform(rc.dpr, 0, 0, rc.dpr, 0, 0);
            g.clearRect(0, 0, W, H);
            g.lineWidth = 1;
            const pt = { x: 0, y: 0, r: 0 };
            if (guides > 0) {
              // spokes
              for (let i = 0; i < 12; i++) {
                const th = angleOf(i);
                const c = lift(color.pitchClass(i, 0.6), 0.2);
                g.strokeStyle = rgba(c, 0.18 * guides);
                g.beginPath();
                g.moveTo(cx + Math.cos(th) * r0, cy + Math.sin(th) * r0);
                g.lineTo(cx + Math.cos(th) * r1, cy + Math.sin(th) * r1);
                g.stroke();
              }
              // spiral (or octave rings in fifths order)
              g.strokeStyle = `rgba(255,255,255,${0.22 * guides})`;
              g.beginPath();
              if (!fifths) {
                const steps = Math.ceil(oct * 96);
                for (let s = 0; s <= steps; s++) {
                  const f = low * Math.pow(2, (s / steps) * oct);
                  place(f, pt);
                  if (s === 0) g.moveTo(pt.x, pt.y);
                  else g.lineTo(pt.x, pt.y);
                }
              } else {
                for (let o = 0; o <= oct; o++) {
                  const t = Math.pow(o / oct, curve);
                  const r = r0 + (r1 - r0) * t;
                  g.moveTo(cx + r, cy);
                  g.arc(cx, cy, r, 0, TAU);
                }
              }
              g.stroke();
              // C markers on each octave
              g.fillStyle = `rgba(255,255,255,${0.35 * guides})`;
              const cHz = 440 * Math.pow(2, (-9) / 12) * (a4 / 440);
              for (let o = -4; o < 8; o++) {
                const f = cHz * Math.pow(2, o);
                if (f < low || f > low * Math.pow(2, oct)) continue;
                place(f, pt);
                g.beginPath();
                g.arc(pt.x, pt.y, 2, 0, TAU);
                g.fill();
              }
            }
            if (labels) {
              const fs = clamp(R * 0.045, 9, 16);
              g.font = `600 ${fs}px system-ui, sans-serif`;
              g.textAlign = 'center';
              g.textBaseline = 'middle';
              for (let i = 0; i < 12; i++) {
                const th = angleOf(i);
                const rr = r1 + fs * 1.4;
                g.fillStyle = rgba(lift(color.pitchClass(i, 0.8), 0.3), 0.75, 0.3);
                g.fillText(NOTE_NAMES[i], cx + Math.cos(th) * rr, cy + Math.sin(th) * rr);
              }
            }
            void lowPc;
            rot = rotSaved;
            guideCache = { key, canvas: gc };
          }
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(rot);
          ctx.translate(-cx, -cy);
          ctx.drawImage(guideCache.canvas, 0, 0, W, H);
          ctx.restore();
        }

        // record current peaks
        const K = clamp(Math.round(num(p, 'peaks', 20)), 1, MAXK);
        const thr = num(p, 'threshold', 0.12);
        cur.length = 0;
        const pk = audio.peaks;
        const amax = maxAmp(pk);
        for (let i = 0; i < pk.length && cur.length < K; i++) {
          const ea = expandAmp(pk[i].amp, amax, 0.4) * Math.min(1, amax * 1.5);
          if (ea < thr) continue;
          if (pk[i].freq < low || pk[i].freq > low * Math.pow(2, oct)) continue;
          cur.push({ f: pk[i].freq, a: ea });
        }
        head = (head + 1) % MAXH;
        hn[head] = cur.length;
        for (let i = 0; i < cur.length; i++) {
          hf[head * MAXK + i] = cur[i].f;
          ha[head * MAXK + i] = cur[i].a;
        }

        ctx.globalCompositeOperation = 'lighter';
        const trail = clamp(Math.round(num(p, 'trail', 45)), 0, MAXH - 1);
        const ds = num(p, 'dotSize', 22);
        const pt = { x: 0, y: 0, r: 0 };
        for (let age = trail; age >= 0; age--) {
          const h = (head - age + MAXH) % MAXH;
          const n = hn[h];
          if (!n) continue;
          const fade = 1 - age / (trail + 1);
          const ageSize = 0.35 + 0.65 * fade;
          for (let i = 0; i < n; i++) {
            const f = hf[h * MAXK + i];
            const a = ha[h * MAXK + i];
            place(f, pt);
            const d = ds * (0.35 + 0.9 * Math.sqrt(a)) * ageSize * (age === 0 ? 1.15 : 1);
            ctx.globalAlpha = clamp((age === 0 ? 0.95 : (0.4 * fade * fade * 45) / Math.max(45, trail)) * (0.4 + 0.6 * a), 0, 1);
            ctx.drawImage(sprites.get(colOf(f, 0.5 + 0.5 * a)), pt.x - d / 2, pt.y - d / 2, d, d);
          }
        }
        ctx.globalAlpha = 1;

        if (bool(p, 'connect', false) && cur.length > 1) {
          const sorted = cur.slice().sort((x, y) => x.f - y.f);
          ctx.lineWidth = 1.5;
          ctx.lineJoin = 'round';
          for (let i = 1; i < sorted.length; i++) {
            place(sorted[i - 1].f, pt);
            const x1 = pt.x, y1 = pt.y;
            place(sorted[i].f, pt);
            const g = ctx.createLinearGradient(x1, y1, pt.x, pt.y);
            g.addColorStop(0, rgba(colOf(sorted[i - 1].f, 0.8), 0.6));
            g.addColorStop(1, rgba(colOf(sorted[i].f, 0.8), 0.6));
            ctx.strokeStyle = g;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(pt.x, pt.y);
            ctx.stroke();
          }
        }
        ctx.globalCompositeOperation = 'source-over';

        if (bool(p, 'fundamental', true) && audio.pitch && audio.pitch.freq > 0 && audio.pitch.clarity > 0.3) {
          place(audio.pitch.freq, pt);
          const c = colOf(audio.pitch.freq, 1);
          ctx.strokeStyle = rgba(c, 0.9, 0.4);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, ds * 0.45 + 4 + 6 * audio.beatPulse, 0, TAU);
          ctx.stroke();
        }
      },
    };
  },
};

export default viz;
