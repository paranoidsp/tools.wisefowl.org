/**
 * Frequency Field — spectral peaks placed in a 2D "pitch space" with history.
 */
import type { RGB, VizDefinition } from '../../core/types';
import { GlowSprites, expandAmp, maxAmp, NOTE_NAMES, TAU, clamp, hexToRgb, lift, logNorm, num, pitchClassOf, rgba, str } from '../_lib2d/util';

const MAXK = 32;
const MAXH = 360;

const viz: VizDefinition = {
  id: 'frequency-field',
  name: 'Frequency Field',
  description:
    'Only the strongest spectral peaks, placed in a 2D pitch space: x is log-frequency (or pitch class), y is time, amplitude, or octave. It reads like a self-writing piano roll, where melodies leave trails and harmonics stack up as parallel lines.',
  renderer: 'canvas2d',
  space: '2d',
  tags: ['peaks', 'pitch', 'space', 'history'],
  params: [
    {
      key: 'layout', label: 'Space', type: 'select', default: 'scroll', group: 'Space',
      hint: 'Which two properties of each spectral peak (a frequency standing out above its neighbours) become the x and y position.',
      options: [
        { value: 'scroll', label: 'x = frequency, y = time (scrolling)', hint: 'A self-writing piano roll: each frame is a new row, so melodies leave staircases and held notes leave lines.' },
        { value: 'amplitude', label: 'x = frequency, y = amplitude', hint: 'Louder peaks sit higher, giving a spiky skyline of the strongest frequencies with fading afterimages.' },
        { value: 'grid', label: 'x = pitch class, y = octave (note grid)', hint: 'Twelve columns of note names by octave rows, so every C lands in one column and chords light up cells.' },
      ],
    },
    { key: 'minFreq', label: 'Lowest frequency', type: 'number', min: 20, max: 500, step: 1, default: 40, unit: 'Hz', curve: 'log', group: 'Space', hint: 'Left edge of the frequency axis; peaks below it are ignored. In the note grid it is the bottom of the lowest octave row (32.7 Hz is C1).' },
    { key: 'maxFreq', label: 'Highest frequency', type: 'number', min: 1000, max: 16000, step: 10, default: 8000, unit: 'Hz', curve: 'log', group: 'Space', hint: 'Right edge of the frequency axis; peaks above it are ignored. The axis is logarithmic, so each octave (doubling) gets equal width, as the ear hears it.' },
    { key: 'direction', label: 'Scroll direction', type: 'select', default: 'up', group: 'Space', hint: 'Which way the history moves. Only used when Space = frequency/time.',
      options: [
        { value: 'up', label: 'Upward (new at bottom)', hint: 'New peaks appear along the bottom edge and rise as they age.' },
        { value: 'down', label: 'Downward (new at top)', hint: 'New peaks appear at the top and fall like rain.' },
      ] },

    { key: 'peaks', label: 'Peaks', type: 'number', min: 1, max: MAXK, step: 1, default: 18, group: 'Peaks', hint: 'How many of the loudest spectral peaks are plotted each frame. A few shows just the melody and bass; many shows harmonics and noise too.' },
    { key: 'threshold', label: 'Threshold', type: 'number', min: 0, max: 0.9, step: 0.01, default: 0.12, group: 'Peaks', hint: 'Peaks weaker than this (after the Dynamic range scaling) are skipped. Raise it to clean up clutter from quiet partials and noise.' },
    { key: 'range', label: 'Dynamic range', type: 'number', min: 0.1, max: 1, step: 0.01, default: 0.4, group: 'Peaks', hint: 'How far below the loudest peak a peak can be and still show up. Small values show only the top few as large marks; large values give quieter peaks a size and brightness too.' },
    { key: 'history', label: 'History', type: 'number', min: 10, max: MAXH, step: 1, default: 200, unit: 'frames', group: 'Peaks', hint: 'How many past frames stay on screen (60 frames is about one second). In scrolling mode it sets how much time fits on the canvas; in the others, how long afterimages linger.' },
    {
      key: 'shape', label: 'Mark', type: 'select', default: 'dash', group: 'Peaks',
      hint: 'How each peak is drawn.',
      options: [
        { value: 'dash', label: 'Dashes (piano roll)', hint: 'Short horizontal strokes that join up over time into piano-roll note bars.' },
        { value: 'dot', label: 'Dots', hint: 'Solid round dots; good for seeing individual frames.' },
        { value: 'glow', label: 'Glow', hint: 'Soft glowing blobs that add up where peaks overlap.' },
      ],
    },
    { key: 'size', label: 'Size', type: 'number', min: 1, max: 40, step: 0.5, default: 6, unit: 'px', group: 'Peaks', hint: 'Base size of each mark; louder peaks are drawn larger. Try binding it to Loudness.' },
    { key: 'fade', label: 'Fade with age', type: 'number', min: 0, max: 1, step: 0.01, default: 0.7, group: 'Peaks', hint: 'How much older marks fade before they drop out of the history. 0 keeps the whole history at full strength; 1 fades the oldest to nothing.' },

    { key: 'guides', label: 'Guides', type: 'number', min: 0, max: 1, step: 0.01, default: 0.4, group: 'Guides', hint: 'Brightness of the reference lines: a line at every C (labelled C2, C3 …) on the frequency axis, or the cells and note names in the note grid. 0 hides them.' },
    {
      key: 'palette', label: 'Palette', type: 'select', default: 'mapping', group: 'Colour',
      hint: 'Where each mark’s colour comes from.',
      options: [
        { value: 'mapping', label: 'Mapping (by frequency)', hint: 'The peak’s exact frequency goes through the global colour mapping.' },
        { value: 'pitch', label: 'Mapping (by pitch class)', hint: 'Colour by note name only, so every C has the same colour in any octave.' },
        { value: 'level', label: 'Palette by amplitude', hint: 'Colour shows how loud the peak is, along the palette, not its pitch.' },
        { value: 'mono', label: 'Mono', hint: 'Every mark uses the single Mono colour below.' },
      ],
    },
    { key: 'monoColor', label: 'Mono colour', type: 'color', default: '#a8e6ff', group: 'Colour', hint: 'The colour of every mark. Only used when Palette = Mono.' },
  ],
  presets: [
    { name: 'Piano roll', description: 'Peaks rise from the bottom as dashes; melodies trace staircases.', params: {} },
    {
      name: 'Peak skyline',
      description: 'Amplitude against frequency, with glowing afterimages.',
      params: { layout: 'amplitude', shape: 'glow', size: 18, history: 40, fade: 0.9, peaks: 24 },
    },
    {
      name: 'Note grid',
      description: 'Twelve columns of pitch class by octave rows: chords light up cells.',
      params: { layout: 'grid', shape: 'glow', size: 26, history: 30, fade: 0.95, guides: 0.5, minFreq: 32.7, maxFreq: 4186 },
    },
    {
      name: 'Rain',
      description: 'Falling glow-dots, tinted by pitch class.',
      params: { direction: 'down', shape: 'dot', size: 4, history: 300, palette: 'pitch', guides: 0.15 },
      modulations: { size: { source: 'loudness', amount: 0.15, smooth: 0.5 } },
    },
  ],
  create(canvas) {
    const ctx = canvas.getContext('2d')!;
    const hf = new Float32Array(MAXH * MAXK);
    const ha = new Float32Array(MAXH * MAXK);
    const hn = new Uint8Array(MAXH);
    let head = 0;
    const sprites = new GlowSprites(48, 20);

    return {
      render(rc) {
        const { width: W, height: H, audio, params: p, color } = rc;
        const layout = str(p, 'layout', 'scroll');
        const lo = num(p, 'minFreq', 40);
        const hi = Math.max(lo * 2, num(p, 'maxFreq', 8000));
        const K = clamp(Math.round(num(p, 'peaks', 18)), 1, MAXK);
        const thr = num(p, 'threshold', 0.12);
        const hist = clamp(Math.round(num(p, 'history', 200)), 2, MAXH);
        const palette = str(p, 'palette', 'mapping');
        const mono = hexToRgb(str(p, 'monoColor', '#a8e6ff'));
        const a4 = color.settings.a4;
        const shape = str(p, 'shape', 'dash');
        const size = num(p, 'size', 6);
        const fade = num(p, 'fade', 0.7);
        const guides = num(p, 'guides', 0.4);
        const down = str(p, 'direction', 'up') === 'down';
        const mx = W * 0.04;
        const usableW = W - mx * 2;
        const octs = Math.log2(hi / lo);

        // record
        head = (head + 1) % MAXH;
        let n = 0;
        const amax = maxAmp(audio.peaks);
        const span = num(p, 'range', 0.4);
        for (let i = 0; i < audio.peaks.length && n < K; i++) {
          const pk = audio.peaks[i];
          const ea = expandAmp(pk.amp, amax, span) * Math.min(1, amax * 1.5);
          if (ea < thr || pk.freq < lo || pk.freq > hi) continue;
          hf[head * MAXK + n] = pk.freq;
          ha[head * MAXK + n] = ea;
          n++;
        }
        hn[head] = n;

        const colOf = (f: number, a: number): RGB => {
          switch (palette) {
            case 'pitch': return lift(color.pitchClass(pitchClassOf(f, a4), a), 0.2);
            case 'level': return lift(color.norm(a, a), 0.2);
            case 'mono': return mono;
            default: return lift(color.freq(f, a), 0.2);
          }
        };

        // guides
        if (guides > 0) {
          ctx.lineWidth = 1;
          ctx.font = '10px system-ui, sans-serif';
          ctx.textBaseline = 'top';
          if (layout === 'grid') {
            const cw = usableW / 12;
            const rows = Math.ceil(octs);
            const rh = (H * 0.9) / rows;
            ctx.strokeStyle = `rgba(255,255,255,${0.08 * guides})`;
            ctx.beginPath();
            for (let c = 0; c <= 12; c++) {
              ctx.moveTo(mx + c * cw, H * 0.05);
              ctx.lineTo(mx + c * cw, H * 0.95);
            }
            for (let r = 0; r <= rows; r++) {
              ctx.moveTo(mx, H * 0.05 + r * rh);
              ctx.lineTo(W - mx, H * 0.05 + r * rh);
            }
            ctx.stroke();
            ctx.textAlign = 'center';
            for (let c = 0; c < 12; c++) {
              ctx.fillStyle = rgba(lift(color.pitchClass(c, 0.8), 0.3), 0.7 * guides + 0.2);
              ctx.fillText(NOTE_NAMES[c], mx + (c + 0.5) * cw, H * 0.955);
            }
          } else {
            // octave lines at each C
            const cHz = 440 * Math.pow(2, -9 / 12) * (a4 / 440);
            ctx.textAlign = 'left';
            for (let o = -4; o < 10; o++) {
              const f = cHz * Math.pow(2, o);
              if (f < lo || f > hi) continue;
              const x = mx + logNorm(f, lo, hi) * usableW;
              ctx.strokeStyle = `rgba(255,255,255,${0.1 * guides})`;
              ctx.beginPath();
              ctx.moveTo(x, 0);
              ctx.lineTo(x, H);
              ctx.stroke();
              ctx.fillStyle = `rgba(255,255,255,${0.45 * guides})`;
              ctx.fillText(`C${o + 4}`, x + 3, 4);
            }
          }
        }

        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        const rowH = H / hist;
        const cw = usableW / 12;
        const rows = Math.ceil(octs);
        const rh = (H * 0.9) / rows;
        for (let age = hist - 1; age >= 0; age--) {
          const h = (head - age + MAXH) % MAXH;
          const cnt = hn[h];
          if (!cnt) continue;
          const life = 1 - age / hist;
          const alpha = 1 - fade * (1 - life);
          if (alpha <= 0.01) continue;
          for (let i = 0; i < cnt; i++) {
            const f = hf[h * MAXK + i];
            const a = ha[h * MAXK + i];
            let x: number, y: number;
            if (layout === 'grid') {
              const pc = pitchClassOf(f, a4);
              const o = Math.log2(f / lo);
              x = mx + ((pc + 0.5) % 12) * cw;
              y = H * 0.05 + (rows - Math.floor(o) - 0.5) * rh;
              // keep the octave row stable: nudge within the cell by cents
              y += (o - Math.floor(o) - 0.5) * rh * 0.3;
            } else {
              x = mx + logNorm(f, lo, hi) * usableW;
              if (layout === 'amplitude') y = H * (0.92 - 0.84 * a);
              else y = down ? age * rowH : H - age * rowH;
            }
            const c = colOf(f, 0.5 + 0.5 * a);
            const s = size * (0.35 + 0.9 * Math.sqrt(a));
            const al = clamp(alpha * (0.35 + 0.65 * a) * (age === 0 ? 1 : 0.85), 0, 1);
            ctx.globalCompositeOperation = shape === 'glow' ? 'lighter' : 'source-over';
            if (shape === 'glow') {
              ctx.globalAlpha = layout === 'scroll' ? al : al * (age === 0 ? 1 : 0.35);
              const d = s * 2.2;
              ctx.drawImage(sprites.get(c), x - d / 2, y - d / 2, d, d);
            } else if (shape === 'dot') {
              ctx.globalAlpha = al;
              ctx.fillStyle = rgba(c, 1);
              ctx.beginPath();
              ctx.arc(x, y, s * 0.5, 0, TAU);
              ctx.fill();
            } else {
              ctx.globalAlpha = al * 0.75;
              ctx.strokeStyle = rgba(c, 1);
              ctx.lineWidth = layout === 'scroll' ? Math.max(1, rowH * 1.2) : Math.max(1, s * 0.35);
              ctx.beginPath();
              ctx.moveTo(x - s, y);
              ctx.lineTo(x + s, y);
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
