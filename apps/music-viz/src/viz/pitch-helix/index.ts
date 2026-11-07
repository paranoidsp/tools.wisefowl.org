/**
 * Pitch Helix — Drobisch/Shepard pitch space in 3D. Angle = pitch class,
 * height = octave, so octave-related notes stack vertically and a chord
 * lights up a recognisable constellation. Spectral energy at each pitch makes
 * its point glow; chroma lights the pitch-class "spokes". Layouts morph
 * between helix, cone, flat spiral and torus.
 */
import * as THREE from 'three';
import type { ColorMapper, VizDefinition } from '../../core/types';
import {
  AutoOrbit, bool, cameraParams, createRenderer, disposeAll, dynAttr, follow, glowPointsMaterial, lightLineMaterial, num,
  pxScaleFor, resizeRenderer, spectrumAt, str,
} from '../_lib3d/three-kit';

const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const MAX_PTS = 12 * 9 * 6 + 1;
const LINE_RES = 8; // helix line vertices per semitone
const MAX_LINE = 12 * 9 * LINE_RES + 1;

const viz: VizDefinition = {
  id: 'pitch-helix',
  name: 'Pitch Helix',
  description:
    'Pitch as a place: angle around the helix is pitch class and height is octave (Drobisch/Shepard), so every C sits above every other C and chords light up as constellations. Points glow with spectral energy; spokes glow with chroma. Morph the space between helix, cone, spiral and torus.',
  renderer: 'webgl',
  space: '3d',
  tags: ['3d', 'pitch', 'chroma', 'space'],
  params: [
    {
      key: 'layout', label: 'Pitch space', type: 'select', default: 'helix', group: 'Space',
      options: [
        { value: 'helix', label: 'Helix (Drobisch)', hint: 'Constant radius, rising one turn per octave: every C sits directly above the last C.' },
        { value: 'cone', label: 'Cone (Shepard spiral)', hint: 'The helix widens as it climbs, so higher octaves sit on bigger rings. Lovely from above.' },
        { value: 'spiral', label: 'Flat spiral', hint: 'Squashes the cone almost flat: octaves become rings spreading outward like a record groove.' },
        { value: 'torus', label: 'Torus (octaves wrap)', hint: 'Bends the helix into a doughnut: pitch class winds round the tube and octaves travel round the ring.' },
      ],
      hint: 'The shape of pitch space. Every layout uses angle for pitch class (the note name, ignoring octave); they differ in where the octaves go.',
    },
    {
      key: 'order', label: 'Angle order', type: 'select', default: 'chromatic', group: 'Space',
      options: [ { value: 'chromatic', label: 'Chromatic (semitones adjacent)', hint: 'Notes go round in piano order, C, C♯, D… so a melody walks smoothly around the circle.' }, { value: 'fifths', label: 'Circle of fifths', hint: 'Notes go round in fifths, C, G, D, A… so consonant notes and related keys sit side by side.' } ],
      hint: 'Which order the 12 pitch classes take around the circle. In fifths order a major chord lights a tight cluster instead of a spread triangle, and the helix line becomes a star.',
    },
    { key: 'lowOct', label: 'Lowest octave', type: 'number', min: 0, max: 6, step: 1, default: 2, group: 'Space', hint: 'Octave number of the bottom turn (C2 ≈ 65 Hz, C4 = middle C ≈ 262 Hz). Raise it to drop rumble and give more room to melody.' },
    { key: 'octaves', label: 'Octaves', type: 'number', min: 1, max: 8, step: 1, default: 6, group: 'Space', hint: 'How many octaves (turns of the helix) are shown, starting from Lowest octave. Each octave up doubles the frequency.' },
    { key: 'radius', label: 'Radius', type: 'number', min: 0.5, max: 8, step: 0.05, default: 3, group: 'Space', hint: 'Size of the circle of pitch classes. In Cone and Spiral it is the top octave\'s radius (lower octaves are smaller); in Torus it sets the size of the ring.' },
    { key: 'rise', label: 'Rise per octave', type: 'number', min: 0, max: 4, step: 0.01, default: 1.15, group: 'Space', hint: 'Height of each octave. Tall spacing separates octaves; zero flattens the helix into a circle where every C lands on one spot, the pure pitch-class view. Barely matters in Spiral; unused in Torus.' },
    { key: 'morph', label: 'Morph speed', type: 'number', min: 0.2, max: 10, step: 0.1, default: 2.5, unit: '/s', group: 'Space', hint: 'How quickly points glide to their new places when you change layout, order, radius or rise. Low values give slow, watchable morphs between pitch spaces.' },
    { key: 'density', label: 'Points per semitone', type: 'number', min: 1, max: 6, step: 1, default: 3, group: 'Points', hint: 'How many glowing points sit between neighbouring notes. 1 gives one point per note; more show notes that are slightly sharp or flat, and slides between them.' },
    { key: 'pointSize', label: 'Point size', type: 'number', min: 0.05, max: 2, step: 0.01, default: 0.55, group: 'Points', hint: 'Base size of each glowing point. Points also swell with the energy at their pitch, so loud notes stand out.' },
    { key: 'threshold', label: 'Threshold', type: 'number', min: 0, max: 0.9, step: 0.01, default: 0.18, group: 'Points', hint: 'Energy a pitch must exceed before its point lights up. Raise it to hide background noise and keep only clear notes; lower it to see quiet overtones.' },
    { key: 'gain', label: 'Gain', type: 'number', min: 0.2, max: 4, step: 0.01, default: 1.4, group: 'Points', hint: 'Amplifies how bright and big points get for the energy above the threshold. Turn up for quiet recordings.' },
    { key: 'decay', label: 'Release', type: 'number', min: 0.02, max: 3, step: 0.01, default: 0.35, unit: 's', group: 'Points', hint: 'How long a point keeps glowing after its note stops. Short is crisp and rhythmic; long leaves afterglow that shows the harmony of the last few seconds.' },
    { key: 'chromaWeight', label: 'Chroma weighting', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5, group: 'Points', hint: 'Mixes in chroma, the total energy of each note name across all octaves. Higher values favour points whose note is strong overall, damping stray partials (overtones).' },
    { key: 'lineOpacity', label: 'Helix line', type: 'number', min: 0, max: 1, step: 0.01, default: 0.35, group: 'Overlays', hint: 'Brightness of the line tracing the path through every pitch. It brightens where notes are sounding; 0 hides it.' },
    { key: 'spokes', label: 'Chroma spokes', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5, group: 'Overlays', hint: 'Brightness of the lines joining each note name across octaves (all Cs, all Ds…). Each spoke lights with chroma: how strongly that note is heard in any octave.' },
    { key: 'labels', label: 'Note labels', type: 'boolean', default: true, group: 'Overlays', hint: 'Shows note names beside the top octave. Each label brightens as that note gets stronger in the music.' },
    { key: 'marker', label: 'Fundamental marker', type: 'boolean', default: true, group: 'Overlays', hint: 'A big glowing dot at the detected fundamental, the main (lowest) pitch of a note. Only appears when the pitch detector is confident, so it works best on a solo melody.' },
    {
      key: 'colorBy', label: 'Colour by', type: 'select', default: 'pitchClass', group: 'Colour',
      options: [ { value: 'pitchClass', label: 'Pitch class', hint: 'Every C shares a colour, every D another, whatever the octave.' }, { value: 'frequency', label: 'Frequency', hint: 'Colour follows actual pitch height, shifting steadily as you climb the helix.' }, { value: 'octave', label: 'Octave (palette)', hint: 'Runs the palette from bottom to top, so each octave gets its own band of colour.' } ],
      hint: 'How points and the helix line are coloured from the global colour mapping. Spokes and labels always use pitch-class colours.',
    },
    ...cameraParams({ speed: 8, distance: 15, elevation: 16, fov: 45 }),
  ],
  presets: [
    { name: 'Drobisch helix', description: 'Classic pitch helix, slow orbit', params: {} },
    {
      name: 'Circle-of-fifths tower', description: 'Fifths order: consonant notes neighbour, the line becomes a star',
      params: { order: 'fifths', density: 1, spokes: 0.85, lineOpacity: 0.22, pointSize: 0.7, rise: 0.9, camElevation: 30, camSpeed: 6 },
    },
    {
      name: 'Shepard cone', description: 'Radius grows with octave, seen from above',
      params: { layout: 'cone', radius: 4.2, rise: 0.8, camElevation: 52, camDistance: 14, spokes: 0.6, density: 4, pointSize: 0.45 },
    },
    {
      name: 'Torus of octaves', description: 'Octaves wrap around a ring; pitch class winds around the tube',
      params: { layout: 'torus', radius: 4, octaves: 7, lowOct: 1, density: 4, pointSize: 0.45, camElevation: 62, camDistance: 16, camSpeed: 5, lineOpacity: 0.5, spokes: 0.25, labels: false, colorBy: 'frequency' },
      modulations: { camDistance: { source: 'bass', amount: -0.05, smooth: 0.7 } },
    },
  ],

  create(canvas) {
    const renderer = createRenderer(canvas);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 300);
    const orbit = new AutoOrbit();
    let pxH = 400;

    // points
    const ptGeo = new THREE.BufferGeometry();
    const ptPos = dynAttr(MAX_PTS + 1, 3);
    const ptCol = dynAttr(MAX_PTS + 1, 3);
    const ptSize = dynAttr(MAX_PTS + 1, 1);
    ptGeo.setAttribute('position', ptPos);
    ptGeo.setAttribute('color', ptCol);
    ptGeo.setAttribute('size', ptSize);
    const ptMat = glowPointsMaterial(3.2);
    const points = new THREE.Points(ptGeo, ptMat);
    points.frustumCulled = false;
    points.renderOrder = 3;
    scene.add(points);

    // helix line
    const lnGeo = new THREE.BufferGeometry();
    const lnPos = dynAttr(MAX_LINE, 3);
    const lnCol = dynAttr(MAX_LINE, 3);
    lnGeo.setAttribute('position', lnPos);
    lnGeo.setAttribute('color', lnCol);
    const line = new THREE.Line(lnGeo, lightLineMaterial());
    line.frustumCulled = false;
    line.renderOrder = 1;
    scene.add(line);

    // spokes: for each pitch class a polyline through its octaves (LineSegments)
    const SPOKE_SEG = 9 * 6; // up to 9 octaves × 6 sub-steps
    const spGeo = new THREE.BufferGeometry();
    const spPos = dynAttr(12 * SPOKE_SEG * 2, 3);
    const spCol = dynAttr(12 * SPOKE_SEG * 2, 3);
    spGeo.setAttribute('position', spPos);
    spGeo.setAttribute('color', spCol);
    const spokes = new THREE.LineSegments(spGeo, lightLineMaterial());
    spokes.frustumCulled = false;
    spokes.renderOrder = 2;
    scene.add(spokes);

    // labels
    const labels = NOTE_NAMES.map((name) => {
      const c = document.createElement('canvas');
      c.width = 128;
      c.height = 64;
      const g = c.getContext('2d')!;
      g.font = '600 44px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#fff';
      g.fillText(name, 64, 34);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.LinearSRGBColorSpace;
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.9 });
      const s = new THREE.Sprite(mat);
      s.scale.set(0.8, 0.4, 1);
      s.renderOrder = 4;
      scene.add(s);
      return s;
    });

    // state
    const energy = new Float32Array(MAX_PTS);
    const cur = new Float32Array((MAX_PTS + 1) * 3); // morphing positions
    let curInit = false;
    const lineCur = new Float32Array(MAX_LINE * 3);
    const spokeCur = new Float32Array(12 * SPOKE_SEG * 2 * 3);
    const baseCol = new Float32Array(MAX_PTS * 3);
    const lineBase = new Float32Array(MAX_LINE * 3);
    const pcCol = new Float32Array(12 * 3);
    let colKey: ColorMapper | null = null;
    let colKeyB = '';
    let markerE = 0;
    const tmp = new Float32Array(3);
    const center = new THREE.Vector3();

    const place = (out: Float32Array, o: number, m: number, m0: number, octs: number, layout: string, fifths: boolean, R: number, rise: number) => {
      const pc = ((m % 12) + 12) % 12;
      const oct = (m - m0) / 12;
      let ang: number;
      if (fifths) {
        const a = Math.floor(pc);
        const f = pc - a;
        const p0 = (a * 7) % 12;
        let p1 = ((a + 1) * 7) % 12;
        if (p1 - p0 > 6) p1 -= 12;
        else if (p0 - p1 > 6) p1 += 12;
        ang = ((p0 + (p1 - p0) * f) / 12) * Math.PI * 2;
      } else ang = (pc / 12) * Math.PI * 2;
      // C at the front (+z), clockwise seen from above
      const sx = Math.sin(ang);
      const cz = Math.cos(ang);
      const H = rise * octs;
      if (layout === 'cone') {
        const r = R * (0.15 + 0.85 * (oct / octs));
        out[o] = r * sx; out[o + 1] = rise * oct - H / 2; out[o + 2] = r * cz;
      } else if (layout === 'spiral') {
        const r = R * (0.12 + 0.88 * (oct / octs));
        out[o] = r * sx; out[o + 1] = rise * 0.05 * oct; out[o + 2] = r * cz;
      } else if (layout === 'torus') {
        const phi = (oct / octs) * Math.PI * 2;
        const rs = R * 0.38;
        const rr = R + rs * cz;
        out[o] = rr * Math.cos(phi); out[o + 1] = rs * sx; out[o + 2] = rr * Math.sin(phi);
      } else {
        out[o] = R * sx; out[o + 1] = rise * oct - H / 2; out[o + 2] = R * cz;
      }
    };

    return {
      resize(w, h, dpr) {
        resizeRenderer(renderer, camera, w, h, dpr);
        pxH = h * dpr;
      },
      render({ params: p, audio, dt, color }) {
        const layout = str(p, 'layout', 'helix');
        const fifths = str(p, 'order', 'chromatic') === 'fifths';
        const lowOct = Math.round(num(p, 'lowOct', 2));
        const octs = Math.round(num(p, 'octaves', 6));
        const R = num(p, 'radius', 3);
        const rise = num(p, 'rise', 1.15);
        const dens = Math.round(num(p, 'density', 3));
        const m0 = 12 * (lowOct + 1); // MIDI: C(n) = 12(n+1)
        const span = 12 * octs;
        const P = span * dens + 1;
        const k = curInit ? 1 - Math.exp(-dt * num(p, 'morph', 2.5)) : 1;
        curInit = true;
        const colorBy = str(p, 'colorBy', 'pitchClass');
        const ck = `${colorBy}|${m0}|${span}|${dens}`;
        const midiHz = (m: number) => color.settings.a4 * Math.pow(2, (m - 69) / 12);
        const colOf = (m: number, out: Float32Array, o: number) => {
          const pc = ((m % 12) + 12) % 12;
          const c = colorBy === 'frequency' ? color.freq(midiHz(m), 1) : colorBy === 'octave' ? color.norm((m - m0) / span, 1) : color.pitchClass(pc, 1);
          out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2];
        };
        if (color !== colKey || ck !== colKeyB) {
          colKey = color;
          colKeyB = ck;
          for (let i = 0; i < P; i++) colOf(m0 + i / dens, baseCol, i * 3);
          for (let i = 0; i <= span * LINE_RES; i++) colOf(m0 + i / LINE_RES, lineBase, i * 3);
          for (let pc = 0; pc < 12; pc++) {
            const c = color.pitchClass(pc, 1);
            pcCol[pc * 3] = c[0]; pcCol[pc * 3 + 1] = c[1]; pcCol[pc * 3 + 2] = c[2];
          }
        }

        // energies
        const thr = num(p, 'threshold', 0.18);
        const gain = num(p, 'gain', 1.4);
        const rel = num(p, 'decay', 0.35);
        const cw = num(p, 'chromaWeight', 0.5);
        const hw = Math.max(0.25, 0.5 / dens);
        const size = num(p, 'pointSize', 0.55);
        const pa = ptPos.array as Float32Array;
        const ca = ptCol.array as Float32Array;
        const sa = ptSize.array as Float32Array;
        for (let i = 0; i < P; i++) {
          const m = m0 + i / dens;
          const hz = midiHz(m);
          let e = hz < audio.sampleRate / 2 ? spectrumAt(audio.spectrum, audio.sampleRate, audio.fftSize, hz, hw) : 0;
          const pc = Math.round(m) % 12;
          e *= 1 - cw + cw * (audio.chroma[pc] ?? 1) * 1.2;
          e = Math.min(1.5, Math.max(0, (e - thr) / (1 - thr)) * gain);
          energy[i] = follow(energy[i], e, dt, 0.02, rel);
          place(tmp, 0, m, m0, octs, layout, fifths, R, rise);
          for (let a = 0; a < 3; a++) cur[i * 3 + a] += (tmp[a] - cur[i * 3 + a]) * k;
          pa[i * 3] = cur[i * 3]; pa[i * 3 + 1] = cur[i * 3 + 1]; pa[i * 3 + 2] = cur[i * 3 + 2];
          const ev = energy[i];
          const b = 0.06 + 1.1 * ev;
          ca[i * 3] = baseCol[i * 3] * b + ev * ev * 0.25; ca[i * 3 + 1] = baseCol[i * 3 + 1] * b + ev * ev * 0.25; ca[i * 3 + 2] = baseCol[i * 3 + 2] * b + ev * ev * 0.25;
          sa[i] = size * (0.35 + 1.6 * ev) * (dens > 2 ? 1 : 1.2);
        }
        // fundamental marker
        const f0 = audio.pitch.freq;
        const mk = bool(p, 'marker', true) && f0 > 20 && audio.pitch.clarity > 0.3;
        const fm = f0 > 20 ? 69 + 12 * Math.log2(f0 / color.settings.a4) : m0;
        markerE = follow(markerE, mk && fm >= m0 && fm <= m0 + span ? 0.5 + 0.5 * audio.loudness : 0, dt, 0.03, 0.2);
        place(tmp, 0, Math.min(m0 + span, Math.max(m0, fm)), m0, octs, layout, fifths, R, rise);
        const o = P * 3;
        for (let a = 0; a < 3; a++) cur[o + a] += (tmp[a] - cur[o + a]) * Math.min(1, k * 4 + 0.35);
        pa[o] = cur[o]; pa[o + 1] = cur[o + 1]; pa[o + 2] = cur[o + 2];
        const fc = color.freq(Math.max(20, f0), 1);
        ca[o] = (fc[0] * 0.7 + 0.3) * markerE; ca[o + 1] = (fc[1] * 0.7 + 0.3) * markerE; ca[o + 2] = (fc[2] * 0.7 + 0.3) * markerE;
        sa[P] = size * 4.5 * (1 + 0.3 * audio.beatPulse);
        ptGeo.setDrawRange(0, P + 1);
        ptPos.needsUpdate = ptCol.needsUpdate = ptSize.needsUpdate = true;

        // helix line (energy-lit)
        const lo = num(p, 'lineOpacity', 0.35);
        line.visible = lo > 0;
        if (line.visible) {
          const L = span * LINE_RES + 1;
          const lp = lnPos.array as Float32Array;
          const lc = lnCol.array as Float32Array;
          const lres = fifths ? 1 : LINE_RES; // fifths: straight chords between semitones → star
          const LL = fifths ? span + 1 : L;
          for (let i = 0; i < LL; i++) {
            const m = m0 + i / lres;
            place(tmp, 0, m, m0, octs, layout, fifths, R, rise);
            for (let a = 0; a < 3; a++) lineCur[i * 3 + a] += (tmp[a] - lineCur[i * 3 + a]) * k;
            lp[i * 3] = lineCur[i * 3]; lp[i * 3 + 1] = lineCur[i * 3 + 1]; lp[i * 3 + 2] = lineCur[i * 3 + 2];
            const ei = Math.min(P - 1, Math.round((i / lres) * dens));
            const b = lo * (0.35 + 1.5 * energy[ei]);
            const bi = fifths ? i * LINE_RES * 3 : i * 3;
            lc[i * 3] = lineBase[bi] * b; lc[i * 3 + 1] = lineBase[bi + 1] * b; lc[i * 3 + 2] = lineBase[bi + 2] * b;
          }
          lnGeo.setDrawRange(0, LL);
          lnPos.needsUpdate = lnCol.needsUpdate = true;
        }

        // spokes
        const spk = num(p, 'spokes', 0.5);
        spokes.visible = spk > 0;
        if (spokes.visible) {
          const sp = spPos.array as Float32Array;
          const sc = spCol.array as Float32Array;
          const sub = layout === 'torus' ? 6 : 1;
          let v = 0;
          for (let pc = 0; pc < 12; pc++) {
            const ch = audio.chroma[pc] ?? 0;
            const b = spk * (0.06 + 0.94 * ch * ch);
            for (let s = 0; s < octs * sub; s++) {
              for (let e = 0; e < 2; e++) {
                const m = m0 + pc + ((s + e) / sub) * 12;
                place(tmp, 0, Math.min(m, m0 + span + pc), m0, octs, layout, fifths, R, rise);
                for (let a = 0; a < 3; a++) spokeCur[v * 3 + a] += (tmp[a] - spokeCur[v * 3 + a]) * k;
                sp[v * 3] = spokeCur[v * 3]; sp[v * 3 + 1] = spokeCur[v * 3 + 1]; sp[v * 3 + 2] = spokeCur[v * 3 + 2];
                const fade = 1 - 0.5 * Math.abs((s + e) / (octs * sub) - 0.5);
                sc[v * 3] = pcCol[pc * 3] * b * fade; sc[v * 3 + 1] = pcCol[pc * 3 + 1] * b * fade; sc[v * 3 + 2] = pcCol[pc * 3 + 2] * b * fade;
                v++;
              }
            }
          }
          spGeo.setDrawRange(0, v);
          spPos.needsUpdate = spCol.needsUpdate = true;
        }

        // labels: just outside the top octave of each pitch class
        const showLabels = bool(p, 'labels', true);
        center.set(0, 0, 0);
        for (let pc = 0; pc < 12; pc++) {
          const s = labels[pc];
          s.visible = showLabels;
          if (!showLabels) continue;
          const top = layout === 'torus' ? m0 + pc : m0 + span - 12 + pc;
          place(tmp, 0, top, m0, octs, layout, fifths, R, rise);
          const rx = tmp[0], rz = tmp[2];
          if (layout === 'torus') {
            s.position.set(tmp[0] * 1.0, tmp[1] * 1.5, tmp[2] * 1.0);
          } else {
            const rl = Math.hypot(rx, rz) || 1;
            s.position.set(rx + (rx / rl) * 0.75, tmp[1] + (layout === 'spiral' ? 0.3 : 0.45), rz + (rz / rl) * 0.75);
          }
          const ch = audio.chroma[pc] ?? 0;
          const mat = s.material as THREE.SpriteMaterial;
          mat.color.setRGB(pcCol[pc * 3] * 0.5 + 0.5, pcCol[pc * 3 + 1] * 0.5 + 0.5, pcCol[pc * 3 + 2] * 0.5 + 0.5, THREE.LinearSRGBColorSpace);
          mat.opacity = 0.25 + 0.65 * ch;
          const sz = R * 0.08 + 0.22;
          s.scale.set(sz * 2, sz, 1);
        }

        ptMat.uniforms.uPxScale.value = pxScaleFor(camera, pxH);
        orbit.update(camera, p, dt, center);
        renderer.render(scene, camera);
      },
      dispose() {
        disposeAll(renderer, scene);
      },
    };
  },
};

export default viz;
