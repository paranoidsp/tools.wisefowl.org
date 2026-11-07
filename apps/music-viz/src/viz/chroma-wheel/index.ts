/**
 * Chroma Wheel — the 12 pitch classes on a circle, with chord shapes.
 */
import type { RGB, VizDefinition } from '../../core/types';
import { FIFTHS_POS, NOTE_NAMES, TAU, bool, clamp, follow, lift, num, rgba, smoothK, str } from '../_lib2d/util';

const viz: VizDefinition = {
  id: 'chroma-wheel',
  name: 'Chroma Wheel',
  description:
    'Folds every octave onto one circle of 12 pitch classes: each petal grows with how much of that note is sounding and takes the mapping’s pitch-class colour. Active notes are joined into a polygon, so every chord has a recognisable shape (in circle-of-fifths order, consonant chords are compact).',
  renderer: 'canvas2d',
  space: '2d',
  tags: ['pitch', 'harmony', 'chords', 'chroma'],
  params: [
    {
      key: 'order', label: 'Note order', type: 'select', default: 'chromatic', group: 'Layout',
      hint: 'How the 12 pitch classes (note names with octave ignored, so every C counts as C) are arranged around the circle. The order decides what shape a chord makes.',
      options: [
        { value: 'chromatic', label: 'Chromatic (C, C♯, D …)', hint: 'Neighbours are a semitone apart, like piano keys. Clusters look compact; major chords look like scattered triangles.' },
        { value: 'fifths', label: 'Circle of fifths (C, G, D …)', hint: 'Neighbours are a fifth apart, so notes of one key sit together: consonant chords form tight shapes, dissonance sprawls.' },
      ],
    },
    { key: 'inner', label: 'Inner radius', type: 'number', min: 0, max: 0.8, step: 0.01, default: 0.28, group: 'Layout', hint: 'Where the note shapes start, as a fraction of half the canvas’s shorter side. It also leaves room for the dominant-note label in the middle.' },
    { key: 'outer', label: 'Outer radius', type: 'number', min: 0.3, max: 1.1, step: 0.01, default: 0.82, group: 'Layout', hint: 'How far a note at full strength reaches. The gap between inner and outer is the range each petal grows across. Try binding it to Beat (⦿) for a pulse.' },
    { key: 'rotation', label: 'Rotation', type: 'number', min: -180, max: 180, step: 1, default: 0, unit: '°', group: 'Layout', hint: 'Turns the whole wheel. At 0° C sits at the top; rotate to put your song’s key at the top.' },
    { key: 'spin', label: 'Spin', type: 'number', min: -60, max: 60, step: 0.5, default: 0, unit: '°/s', group: 'Layout', hint: 'Keeps the wheel turning continuously, in degrees per second (negative turns anticlockwise). Adds motion without changing what the notes mean.' },

    {
      key: 'style', label: 'Note shape', type: 'select', default: 'petals', group: 'Notes',
      hint: 'How each pitch class is drawn. In every style the shape’s length grows with how much of that note is sounding.',
      options: [
        { value: 'petals', label: 'Petals', hint: 'Leaf-shaped petals that bulge in the middle, giving a flower-like look.' },
        { value: 'wedges', label: 'Wedges', hint: 'Pie-slice segments with a bright rim, like a radial bar chart. Easiest to read exact levels.' },
        { value: 'dots', label: 'Dots', hint: 'A glowing dot on a ring for each note, sized by strength rather than growing outward.' },
        { value: 'rays', label: 'Rays', hint: 'Thin glowing lines radiating out from the inner radius.' },
      ],
    },
    { key: 'width', label: 'Note width', type: 'number', min: 0.1, max: 1.6, step: 0.01, default: 0.8, group: 'Notes', hint: 'How wide each note shape is, as a fraction of its 30° slot (360° / 12 notes). Above 1 neighbouring petals overlap and their colours blend additively.' },
    { key: 'sharpen', label: 'Contrast', type: 'number', min: 0.5, max: 4, step: 0.05, default: 1.2, group: 'Notes', hint: 'Raises each note’s strength to this power. Higher values shrink the weaker notes so only the main notes of a chord stand out; below 1 everything looks fuller.' },
    { key: 'echoes', label: 'Echoes', type: 'number', min: 1, max: 5, step: 1, default: 1, group: 'Notes', hint: 'Draws extra copies of the note shapes, each smaller and turned by half a slot, for a mandala effect. 1 means no echoes.' },
    { key: 'smoothing', label: 'Smoothing', type: 'number', min: 0, max: 0.98, step: 0.01, default: 0.75, group: 'Notes', hint: 'How slowly the note shapes follow the sound. They grow faster than they shrink, so high values give lingering notes, like a sustain pedal; low values flicker with every change.' },

    {
      key: 'chord', label: 'Chord shape', type: 'select', default: 'polygon', group: 'Chord',
      hint: 'Joins the currently active notes (those above the Note threshold) with lines, so each chord shows as a shape you can learn to recognise.',
      options: [
        { value: 'polygon', label: 'Polygon (in wheel order)', hint: 'Connects active notes around the circle into one closed outline, filled with their mixed colour.' },
        { value: 'web', label: 'Web (every pair)', hint: 'Draws a line between every pair of active notes, showing all the intervals sounding at once.' },
        { value: 'none', label: 'None', hint: 'No chord lines; just the note shapes.' },
      ],
    },
    { key: 'threshold', label: 'Note threshold', type: 'number', min: 0.05, max: 0.95, step: 0.01, default: 0.45, group: 'Chord', hint: 'How strong a note must be, relative to the strongest note right now, to count as part of the chord. Lower it to catch quieter notes; raise it for just the core of the chord.' },
    { key: 'chordRadius', label: 'Chord radius', type: 'number', min: 0.1, max: 1, step: 0.01, default: 0.6, group: 'Chord', hint: 'Radius of the circle the chord shape’s corners sit on, as a fraction of half the canvas’s shorter side.' },
    { key: 'chordFill', label: 'Fill', type: 'number', min: 0, max: 1, step: 0.01, default: 0.3, group: 'Chord', hint: 'How strongly the inside of the chord shape is filled with the blended colour of its notes. Needs three or more active notes.' },
    { key: 'lineWidth', label: 'Line width', type: 'number', min: 0.5, max: 12, step: 0.25, default: 2.5, unit: 'px', group: 'Chord', hint: 'Thickness of the chord lines and size of the corner dots. Lines between weaker notes are drawn thinner.' },

    { key: 'center', label: 'Show dominant note', type: 'boolean', default: true, group: 'Labels', hint: 'Shows the name of the strongest pitch class in the middle, in its colour, with a glow that pulses on each beat.' },
    { key: 'labels', label: 'Note names', type: 'boolean', default: true, group: 'Labels', hint: 'Writes C, C♯, D … around the rim. Each name brightens as its note gets stronger, which helps you learn the colour for each note.' },
    { key: 'guides', label: 'Guides', type: 'number', min: 0, max: 1, step: 0.01, default: 0.35, group: 'Labels', hint: 'Brightness of the faint reference circles and the tick marks at each note position. 0 hides them.' },
  ],
  presets: [
    { name: 'Petal wheel', description: 'Chromatic petals with the current chord drawn as a polygon.', params: {} },
    {
      name: 'Circle of fifths',
      description: 'Fifths order: triads become tight triangles, dissonance sprawls.',
      params: { order: 'fifths', style: 'wedges', width: 0.92, inner: 0.42, outer: 0.85, chordRadius: 0.42, chordFill: 0.45, sharpen: 2, lineWidth: 3 },
    },
    {
      name: 'Chord web',
      description: 'Dots on a ring joined by every pairing — the interval network of the moment.',
      params: { style: 'dots', chord: 'web', chordRadius: 0.7, inner: 0.7, outer: 0.88, width: 0.55, threshold: 0.3, chordFill: 0.12, lineWidth: 1.5, center: false, guides: 0.25 },
    },
    {
      name: 'Mandala',
      description: 'Wide overlapping petals from the centre, slowly turning.',
      params: { style: 'petals', inner: 0.04, outer: 0.95, width: 1.5, spin: 8, chord: 'none', labels: false, center: false, guides: 0, sharpen: 0.8, echoes: 3 },
      modulations: { outer: { source: 'beatPulse', amount: 0.08, smooth: 0.4 } },
    },
  ],
  create(canvas) {
    const ctx = canvas.getContext('2d')!;
    const chroma = new Float32Array(12);
    const vals = new Float32Array(12);
    const ang = new Float32Array(12);
    const active: number[] = [];
    let spinAngle = 0;
    let domSmooth = 0;
    let lastDom = 0;
    const colors: RGB[] = new Array(12);

    return {
      render(rc) {
        const { width: W, height: H, audio, params: p, color, dt } = rc;
        const cx = W / 2;
        const cy = H / 2;
        const R = Math.min(W, H) / 2;
        const r0 = R * num(p, 'inner', 0.28);
        const r1 = Math.max(r0 + 4, R * num(p, 'outer', 0.82));
        const fifths = str(p, 'order', 'chromatic') === 'fifths';
        const style = str(p, 'style', 'petals');
        const widthF = num(p, 'width', 0.8);
        const sharpen = num(p, 'sharpen', 1.2);
        const k = smoothK(num(p, 'smoothing', 0.75), dt);
        follow(chroma, audio.chroma, Math.min(1, k * 2.5), k);
        spinAngle += (num(p, 'spin', 0) * Math.PI / 180) * dt;
        const rot = (num(p, 'rotation', 0) * Math.PI) / 180 + spinAngle - Math.PI / 2;
        const slot = TAU / 12;
        let dom = 0;
        for (let i = 0; i < 12; i++) {
          vals[i] = Math.pow(clamp(chroma[i], 0, 1), sharpen);
          ang[i] = rot + (fifths ? FIFTHS_POS[i] : i) * slot;
          colors[i] = lift(color.pitchClass(i, 0.55 + 0.45 * vals[i]), 0.15);
          if (vals[i] > vals[dom]) dom = i;
        }
        const guides = num(p, 'guides', 0.35);

        // guides
        if (guides > 0) {
          ctx.lineWidth = 1;
          ctx.strokeStyle = `rgba(255,255,255,${0.12 * guides})`;
          ctx.beginPath();
          ctx.arc(cx, cy, r1, 0, TAU);
          if (r0 > 6) {
            ctx.moveTo(cx + r0, cy);
            ctx.arc(cx, cy, r0, 0, TAU);
          }
          for (let i = 0; i < 12; i++) {
            const c = Math.cos(ang[i]);
            const s = Math.sin(ang[i]);
            ctx.moveTo(cx + c * r1, cy + s * r1);
            ctx.lineTo(cx + c * (r1 + 6), cy + s * (r1 + 6));
          }
          ctx.stroke();
        }

        ctx.globalCompositeOperation = 'lighter';
        // notes
        const half = (slot * widthF) / 2;
        const echoes = Math.max(1, Math.round(num(p, 'echoes', 1)));
        for (let e = echoes - 1; e >= 0; e--) {
        const es = Math.pow(0.62, e);
        for (let i = 0; i < 12; i++) {
          const v = vals[i] * (e === 0 ? 1 : 0.8);
          if (v < 0.01) continue;
          const a = ang[i] + e * slot * 0.5;
          const c = colors[i];
          const len = (r1 - r0) * v * es;
          const rb0 = r0 * es;
          const tip = rb0 + len;
          const ca = Math.cos(a);
          const sa = Math.sin(a);
          if (style === 'wedges') {
            ctx.beginPath();
            ctx.arc(cx, cy, tip, a - half, a + half);
            ctx.arc(cx, cy, Math.max(0, rb0), a + half, a - half, true);
            ctx.closePath();
            const g = ctx.createRadialGradient(cx, cy, rb0, cx, cy, Math.max(rb0 + 1, tip));
            g.addColorStop(0, rgba(c, 0.15 + 0.2 * v));
            g.addColorStop(1, rgba(c, 0.5 + 0.5 * v, 0.1 * v));
            ctx.fillStyle = g;
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = rgba(c, 0.9 * v, 0.3);
            ctx.beginPath();
            ctx.arc(cx, cy, tip, a - half, a + half);
            ctx.stroke();
          } else if (style === 'dots') {
            const rr = ((r0 + r1) / 2) * es;
            const x = cx + ca * rr;
            const y = cy + sa * rr;
            const dr = Math.max(2, ((TAU * rr) / 12) * 0.5 * widthF * (0.25 + 0.75 * v));
            const g = ctx.createRadialGradient(x, y, 0, x, y, dr * 1.8);
            g.addColorStop(0, rgba(c, 0.95 * (0.3 + 0.7 * v), 0.5));
            g.addColorStop(0.45, rgba(c, 0.8 * (0.3 + 0.7 * v)));
            g.addColorStop(1, rgba(c, 0));
            ctx.fillStyle = g;
            ctx.fillRect(x - dr * 1.8, y - dr * 1.8, dr * 3.6, dr * 3.6);
          } else if (style === 'rays') {
            ctx.lineCap = 'round';
            ctx.lineWidth = Math.max(1, ((TAU * r0 + 40) / 12) * 0.35 * widthF);
            ctx.strokeStyle = rgba(c, 0.25 + 0.6 * v);
            ctx.beginPath();
            ctx.moveTo(cx + ca * rb0, cy + sa * rb0);
            ctx.lineTo(cx + ca * tip, cy + sa * tip);
            ctx.stroke();
            ctx.lineWidth = Math.max(1, ctx.lineWidth * 0.3);
            ctx.strokeStyle = rgba(c, 0.9 * v, 0.5);
            ctx.stroke();
          } else {
            // petal: two quadratic curves from the base to the tip
            const bw = Math.min(half, Math.PI * 0.45);
            const mid = rb0 + len * 0.55;
            const spread = mid * Math.tan(bw) * 0.9 + 4;
            const bx = cx + ca * rb0;
            const by = cy + sa * rb0;
            const tx = cx + ca * tip;
            const ty = cy + sa * tip;
            const mx = cx + ca * mid;
            const my = cy + sa * mid;
            const px = -sa * spread;
            const py = ca * spread;
            ctx.beginPath();
            ctx.moveTo(bx, by);
            ctx.quadraticCurveTo(mx + px, my + py, tx, ty);
            ctx.quadraticCurveTo(mx - px, my - py, bx, by);
            const g = ctx.createLinearGradient(bx, by, tx, ty);
            g.addColorStop(0, rgba(c, 0.08));
            g.addColorStop(0.6, rgba(c, 0.35 + 0.35 * v));
            g.addColorStop(1, rgba(c, 0.6 + 0.4 * v, 0.25 * v));
            ctx.fillStyle = g;
            ctx.fill();
            ctx.lineWidth = 1.25;
            ctx.strokeStyle = rgba(c, 0.5 * v, 0.2);
            ctx.stroke();
          }
        }
        }

        // chord
        const chordMode = str(p, 'chord', 'polygon');
        const thr = num(p, 'threshold', 0.45);
        active.length = 0;
        for (let i = 0; i < 12; i++) if (vals[i] >= Math.pow(thr, sharpen)) active.push(i);
        if (chordMode !== 'none' && active.length >= 2) {
          const rc2 = R * num(p, 'chordRadius', 0.6);
          active.sort((x, y) => ((ang[x] - rot + TAU * 4) % TAU) - ((ang[y] - rot + TAU * 4) % TAU));
          const lw = num(p, 'lineWidth', 2.5);
          const fill = num(p, 'chordFill', 0.3);
          if (fill > 0 && active.length >= 3) {
            let mr = 0, mg = 0, mb = 0, wsum = 0;
            ctx.beginPath();
            for (let j = 0; j < active.length; j++) {
              const i = active[j];
              const x = cx + Math.cos(ang[i]) * rc2;
              const y = cy + Math.sin(ang[i]) * rc2;
              if (j === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
              mr += colors[i][0] * vals[i];
              mg += colors[i][1] * vals[i];
              mb += colors[i][2] * vals[i];
              wsum += vals[i];
            }
            ctx.closePath();
            const mix: RGB = [mr / wsum, mg / wsum, mb / wsum];
            const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rc2);
            g.addColorStop(0, rgba(mix, fill * 0.35));
            g.addColorStop(1, rgba(mix, fill * 0.8));
            ctx.fillStyle = g;
            ctx.fill();
          }
          ctx.lineCap = 'round';
          const edge = (i: number, j: number) => {
            const x1 = cx + Math.cos(ang[i]) * rc2;
            const y1 = cy + Math.sin(ang[i]) * rc2;
            const x2 = cx + Math.cos(ang[j]) * rc2;
            const y2 = cy + Math.sin(ang[j]) * rc2;
            const g = ctx.createLinearGradient(x1, y1, x2, y2);
            const a = 0.35 + 0.6 * Math.min(vals[i], vals[j]);
            g.addColorStop(0, rgba(colors[i], a, 0.15));
            g.addColorStop(1, rgba(colors[j], a, 0.15));
            ctx.strokeStyle = g;
            ctx.lineWidth = lw * (0.5 + 0.5 * Math.min(vals[i], vals[j]));
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
          };
          if (chordMode === 'web') {
            for (let a = 0; a < active.length; a++) for (let b = a + 1; b < active.length; b++) edge(active[a], active[b]);
          } else if (active.length === 2) {
            edge(active[0], active[1]);
          } else {
            for (let a = 0; a < active.length; a++) edge(active[a], active[(a + 1) % active.length]);
          }
          // vertices
          for (const i of active) {
            const x = cx + Math.cos(ang[i]) * rc2;
            const y = cy + Math.sin(ang[i]) * rc2;
            ctx.fillStyle = rgba(colors[i], 0.95, 0.4);
            ctx.beginPath();
            ctx.arc(x, y, lw * 1.3 + 1.5, 0, TAU);
            ctx.fill();
          }
        }
        ctx.globalCompositeOperation = 'source-over';

        // labels
        if (bool(p, 'labels', true)) {
          const fs = clamp(R * 0.055, 9, 20);
          ctx.font = `600 ${fs}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const lr = r1 + fs * 1.3;
          for (let i = 0; i < 12; i++) {
            const v = vals[i];
            ctx.fillStyle = rgba(colors[i], 0.35 + 0.65 * v, 0.35 + 0.4 * v);
            ctx.fillText(NOTE_NAMES[i], cx + Math.cos(ang[i]) * lr, cy + Math.sin(ang[i]) * lr);
          }
        }

        // dominant note
        if (bool(p, 'center', true) && vals[dom] > 0.05) {
          if (dom !== lastDom) {
            lastDom = dom;
            domSmooth = 0;
          }
          domSmooth = Math.min(1, domSmooth + dt * 6);
          const c = colors[dom];
          const cr = Math.max(10, Math.min(r0 * 0.8, R * 0.2)) * (0.85 + 0.15 * audio.beatPulse);
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr * 1.6);
          g.addColorStop(0, rgba(c, 0.9 * domSmooth, 0.2));
          g.addColorStop(0.55, rgba(c, 0.55 * domSmooth));
          g.addColorStop(1, rgba(c, 0));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(cx, cy, cr * 1.6, 0, TAU);
          ctx.fill();
          const fs = clamp(cr * 0.75, 10, 64);
          ctx.font = `700 ${fs}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = `rgba(255,255,255,${0.85 * domSmooth})`;
          ctx.fillText(NOTE_NAMES[dom], cx, cy + fs * 0.04);
        }
      },
    };
  },
};

export default viz;
