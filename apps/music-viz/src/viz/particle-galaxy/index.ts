/**
 * Particle Galaxy — tens of thousands of GPU particles, each bound to one
 * frequency band. The band's energy (sampled from a per-frame DataTexture in
 * the vertex shader) displaces and brightens it; colour is that band's
 * frequency through the global mapping (a palette texture). Beats burst
 * outward.
 */
import * as THREE from 'three';
import type { ColorMapper, VizDefinition } from '../../core/types';
import {
  ADD_PREMUL, AutoOrbit, GLSL_PREMUL_ADD, PaletteTexture, cameraParams, createRenderer, disposeAll, follow, num, pxScaleFor,
  resizeRenderer, sampleArray, str,
} from '../_lib3d/three-kit';

const VERT = /* glsl */ `
  attribute float aBand;
  attribute vec4 aSeed;
  attribute vec3 aDir;
  uniform sampler2D uBands;
  uniform sampler2D uPalette;
  uniform float uTime;
  uniform float uRot;
  uniform float uDisp;
  uniform int uDirMode;
  uniform float uBurst;
  uniform float uSize;
  uniform float uPxScale;
  uniform float uBase;
  uniform float uGain;
  uniform float uTwinkle;
  uniform float uWobble;
  uniform float uJitter;
  uniform float uNorm;
  uniform int uLayout;
  uniform vec3 uPitchColor;
  uniform float uPitchMix;
  uniform float uRadius;
  varying vec3 vC;
  void main() {
    float e = texture2D(uBands, vec2(aBand, 0.5)).r;
    vec3 p = position;
    vec3 dir = aDir;
    if (uDirMode == 1) dir = normalize(position + vec3(1e-4));
    else if (uDirMode == 2) dir = vec3(0.0, aSeed.w > 0.5 ? 1.0 : -1.0, 0.0);
    else if (uDirMode == 3) dir = normalize(vec3(aSeed.x - 0.5, aSeed.y - 0.5, aSeed.z - 0.5) + vec3(1e-4));
    if (uLayout == 2 && uDirMode == 0) {
      // cube: particles fill each band's column up to its energy (volumetric bars)
      p.y = -uRadius * 0.4 + aDir.y * uRadius * (0.03 + e * uDisp * 0.45);
    } else {
      p += dir * e * uDisp * mix(1.0, 0.4 + aSeed.x * 0.9, uJitter);
    }
    p *= 1.0 + uBurst * (0.25 + 0.75 * aSeed.y) * 0.55;
    // rotation about Y with a gentle radius-dependent wobble
    float r = length(p.xz);
    float a = uRot + uWobble * sin(uTime * 0.3 + r * 0.7) * 0.25;
    float cs = cos(a), sn = sin(a);
    p.xz = mat2(cs, -sn, sn, cs) * p.xz;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float tw = 1.0 + uTwinkle * 0.5 * sin(uTime * (1.5 + aSeed.z * 4.0) + aSeed.w * 40.0);
    gl_PointSize = clamp(uSize * (0.45 + aSeed.z * 0.75) * (0.6 + e * 1.4) * uPxScale / max(0.05, -mv.z), 0.0, 96.0);
    vec3 c = mix(texture2D(uPalette, vec2(aBand, 0.5)).rgb, uPitchColor, uPitchMix);
    vC = (c * (uBase + e * uGain) + vec3(pow(e, 3.0) * 0.25)) * tw * uNorm;
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAG = GLSL_PREMUL_ADD + /* glsl */ `
  varying vec3 vC;
  void main() {
    vec2 q = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(q, q);
    if (r2 > 1.0) discard;
    gl_FragColor = lightOut(vC * exp(-r2 * 4.0));
  }
`;

const viz: VizDefinition = {
  id: 'particle-galaxy',
  name: 'Particle Galaxy',
  description:
    'A spectrum you can fly around: every particle belongs to one frequency band (bass at the core, treble at the rim) and is pushed and lit by that band’s energy, coloured by its frequency. Beats blow the whole galaxy outward.',
  renderer: 'webgl',
  space: '3d',
  tags: ['3d', 'particles', 'spectrum', 'beat'],
  params: [
    {
      key: 'layout', label: 'Layout', type: 'select', default: 'galaxy', group: 'Layout',
      options: [
        { value: 'galaxy', label: 'Spiral galaxy (band ∝ radius)', hint: 'A spiral disc with bass in the central bulge and treble out at the tips of the arms.' },
        { value: 'sphere', label: 'Sphere (band ∝ latitude)', hint: 'A shell with bass at the south pole and treble at the north; the shell bulges where bands are loud.' },
        { value: 'cube', label: 'Particle bars (band ∝ x, energy fills the column)', hint: 'A 3D bar graph: bass on the left, treble on the right, each column of particles rising with its band.' },
        { value: 'ring', label: 'Ring (band ∝ radius)', hint: 'A flat Saturn-like ring, bass on the inner edge and treble on the outer, with a couple of gaps.' },
      ],
      hint: 'The shape the particles form and where each frequency band lives in it. Every layout keeps the same idea: position = frequency, movement and glow = loudness.',
    },
    { key: 'count', label: 'Particles', type: 'number', min: 2000, max: 150000, step: 1000, default: 40000, group: 'Layout', curve: 'log', hint: 'Number of particles. More gives a denser, smoother cloud but costs GPU time; brightness is auto-balanced. Changing it rebuilds the shape, so avoid binding it to audio.' },
    { key: 'radius', label: 'Radius', type: 'number', min: 1, max: 14, step: 0.1, default: 7, group: 'Layout', hint: 'Overall size of the shape in scene units (half-width for Particle bars). Changing it rebuilds the particles.' },
    { key: 'arms', label: 'Spiral arms', type: 'number', min: 1, max: 8, step: 1, default: 3, group: 'Layout', hint: 'How many arms the spiral galaxy has. Only used by the Spiral galaxy layout.' },
    { key: 'twist', label: 'Arm twist', type: 'number', min: 0, max: 8, step: 0.05, default: 2.6, group: 'Layout', hint: 'How tightly the arms wind around the core. 0 gives straight spokes; high values wrap them into a tight whirlpool. Spiral galaxy only.' },
    { key: 'spread', label: 'Scatter', type: 'number', min: 0, max: 1, step: 0.01, default: 0.35, group: 'Layout', hint: 'Random spread of particles away from their ideal place. Low makes crisp, thin arms, shells and columns; high makes a soft, hazy cloud.' },
    { key: 'thickness', label: 'Thickness', type: 'number', min: 0, max: 2, step: 0.01, default: 0.35, group: 'Layout', hint: 'Depth of the shape: vertical thickness of the galaxy disc or ring, or front-to-back depth of Particle bars. No effect on Sphere.' },
    { key: 'rotation', label: 'Rotation', type: 'number', min: -90, max: 90, step: 0.5, default: 6, unit: '°/s', group: 'Motion', hint: 'Spins the particles around the vertical axis, separately from the camera orbit. Negative spins the other way.' },
    { key: 'wobble', label: 'Wobble', type: 'number', min: 0, max: 1, step: 0.01, default: 0.3, group: 'Motion', hint: 'Makes inner and outer rings rotate slightly out of step, so the shape slowly swirls instead of turning like a rigid disc.' },
    { key: 'twinkle', label: 'Twinkle', type: 'number', min: 0, max: 1, step: 0.01, default: 0.3, group: 'Motion', hint: 'Each particle flickers in brightness at its own random rate, like stars. Independent of the sound.' },
    { key: 'disp', label: 'Displacement', type: 'number', min: 0, max: 5, step: 0.01, default: 1.4, group: 'Audio', hint: 'How far each particle is pushed by the loudness of its frequency band (particle displacement). In Particle bars it sets how tall a full-energy column grows.' },
    {
      key: 'dirMode', label: 'Push direction', type: 'select', default: 'layout', group: 'Audio',
      options: [ { value: 'layout', label: 'Natural for layout', hint: 'Each layout\'s own motion: galaxy and ring puff up and down, sphere bulges outward, bars fill their columns.' }, { value: 'radial', label: 'Radial', hint: 'Particles are pushed straight out from the centre, so loud bands bloom outward.' }, { value: 'vertical', label: 'Vertical', hint: 'Particles jump straight up or down, turning a flat layout into a spiky landscape.' }, { value: 'scatter', label: 'Random scatter', hint: 'Each particle flies off in its own random direction, so loud bands explode into fuzz.' } ],
      hint: 'Which way particles move when their band gets loud. Only Natural for layout gives Particle bars their filling columns.',
    },
    { key: 'jitter', label: 'Push jitter', type: 'number', min: 0, max: 1, step: 0.01, default: 0.8, group: 'Audio', hint: 'How much push distance varies between particles of the same band. 0 moves them together as a crisp sheet; 1 gives each its own distance, for a cloudy, volumetric look.' },
    { key: 'attack', label: 'Attack', type: 'number', min: 0, max: 0.5, step: 0.005, default: 0.02, unit: 's', group: 'Audio', hint: 'How quickly particles respond when a band gets louder. Near 0 snaps to every drum hit; longer values smooth the rise.' },
    { key: 'release', label: 'Release', type: 'number', min: 0.02, max: 2, step: 0.01, default: 0.25, unit: 's', group: 'Audio', hint: 'How slowly particles fall back when a band gets quieter. Short is twitchy and rhythmic; long makes a lazy, flowing shape.' },
    { key: 'burst', label: 'Beat burst', type: 'number', min: 0, max: 2, step: 0.01, default: 0.45, group: 'Audio', hint: 'How much the whole shape expands outward on each detected beat; heavier bass makes a bigger burst. 0 turns it off.' },
    { key: 'burstDecay', label: 'Burst decay', type: 'number', min: 0.05, max: 2, step: 0.01, default: 0.35, unit: 's', group: 'Audio', hint: 'How long the shape takes to shrink back after a beat burst. Short gives a sharp kick; long makes it breathe.' },
    { key: 'size', label: 'Particle size', type: 'number', min: 0.01, max: 0.5, step: 0.005, default: 0.09, group: 'Look', hint: 'Size of each particle; they also grow with their band\'s energy. Big particles add light together (additive blending) into a glowing nebula.' },
    { key: 'base', label: 'Quiet glow', type: 'number', min: 0, max: 1, step: 0.01, default: 0.09, group: 'Look', hint: 'Brightness of particles whose band is silent. 0 makes quiet bands vanish so only the sounding frequencies show.' },
    { key: 'gain', label: 'Energy glow', type: 'number', min: 0, max: 3, step: 0.01, default: 0.8, group: 'Look', hint: 'Extra brightness added as a band gets louder. High values make loud bands flare white-hot.' },
    {
      key: 'colorBy', label: 'Colour by', type: 'select', default: 'frequency', group: 'Colour',
      options: [ { value: 'frequency', label: 'Band frequency', hint: 'Each particle takes the colour of its band\'s frequency, so the colour map is laid out in space.' }, { value: 'palette', label: 'Palette position (smooth core → rim)', hint: 'The palette runs evenly from bass to treble, ignoring actual frequency, for a smooth gradient.' }, { value: 'pitch', label: 'Current pitch (whole galaxy follows the melody)', hint: 'Everything is tinted by the detected melody note, so the whole scene changes colour as the tune moves.' } ],
      hint: 'How particles get their colour from the global colour mapping.',
    },
    ...cameraParams({ speed: 3, distance: 16, elevation: 32, fov: 50 }),
  ],
  presets: [
    { name: 'Spiral galaxy', description: 'Bass in the core, treble in the outer arms', params: { colorBy: 'palette' } },
    {
      name: 'Pulsing sphere', description: 'A shell that breathes radially with every band',
      params: { layout: 'sphere', radius: 4.5, disp: 2, dirMode: 'radial', burst: 0.8, rotation: 10, camElevation: 12, camDistance: 15, spread: 0.15, size: 0.08, count: 50000 },
      modulations: { camDistance: { source: 'bass', amount: -0.05, smooth: 0.6 } },
    },
    {
      name: 'Particle bars', description: 'A volumetric spectrum: each band a column of particles filled to its energy',
      params: { layout: 'cube', radius: 6, thickness: 0.25, spread: 0.3, disp: 2.8, dirMode: 'layout', rotation: 0, wobble: 0, twinkle: 0.15, camSpeed: 0, camSway: 0.4, camElevation: 14, camDistance: 15, burst: 0.15, base: 0.05, gain: 1.1, count: 60000, size: 0.07 },
    },
    {
      name: 'Saturn ring', description: 'Thin rings, low camera, slow majestic spin',
      params: { layout: 'ring', radius: 8, thickness: 0.08, spread: 0.12, disp: 0.8, dirMode: 'vertical', rotation: 9, camElevation: 9, camDistance: 17, camFov: 42, burst: 0.3, count: 70000, size: 0.06, twinkle: 0.6, colorBy: 'pitch' },
    },
  ],

  create(canvas) {
    const renderer = createRenderer(canvas);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 400);
    const orbit = new AutoOrbit();
    let pxH = 400;

    const palette = new PaletteTexture(256);
    let bandData = new Uint8Array(64 * 4);
    let bandTex = new THREE.DataTexture(bandData, 64, 1, THREE.RGBAFormat);
    bandTex.magFilter = bandTex.minFilter = THREE.LinearFilter;
    bandTex.needsUpdate = true;
    let smooth = new Float32Array(64);

    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, ...ADD_PREMUL,
      uniforms: {
        uBands: { value: bandTex }, uPalette: { value: palette.texture }, uTime: { value: 0 }, uRot: { value: 0 }, uDisp: { value: 1 }, uDirMode: { value: 0 },
        uBurst: { value: 0 }, uSize: { value: 0.1 }, uPxScale: { value: 1 }, uBase: { value: 0.15 }, uGain: { value: 1 }, uTwinkle: { value: 0.3 }, uWobble: { value: 0.3 }, uJitter: { value: 1 }, uNorm: { value: 1 }, uLayout: { value: 0 }, uRadius: { value: 7 }, uPitchColor: { value: new THREE.Color(1, 1, 1) }, uPitchMix: { value: 0 },
      },
    });
    const geo = new THREE.BufferGeometry();
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    scene.add(points);
    let layoutKey = '';
    let rot = 0;
    let burst = 0;
    let lastBeatCount = -1;
    let time = 0;
    const tmpC = new THREE.Color();

    const gauss = () => {
      let u = 0, v = 0;
      while (u === 0) u = Math.random();
      while (v === 0) v = Math.random();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };

    const build = (layout: string, n: number, R: number, arms: number, twist: number, spread: number, thick: number) => {
      const pos = new Float32Array(n * 3);
      const band = new Float32Array(n);
      const seed = new Float32Array(n * 4);
      const dir = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        for (let k = 0; k < 4; k++) seed[i * 4 + k] = Math.random();
        let x = 0, y = 0, z = 0, b = 0, dx = 0, dy = 1, dz = 0;
        const up = seed[i * 4 + 3] > 0.5 ? 1 : -1;
        if (layout === 'sphere') {
          const u = Math.random() * 2 - 1;
          const th = Math.random() * Math.PI * 2;
          const s = Math.sqrt(1 - u * u);
          const r = R * (1 + gauss() * spread * 0.15);
          x = r * s * Math.cos(th); y = r * u; z = r * s * Math.sin(th);
          b = (u + 1) / 2;
          dx = x / r; dy = y / r; dz = z / r;
        } else if (layout === 'cube') {
          // x = band (bass left → treble right), z = depth; y = height fraction in the column
          const cols = 96;
          const ix = Math.floor(Math.random() * cols);
          x = (ix / (cols - 1) - 0.5) * 2 * R + gauss() * spread * 0.02 * R;
          z = (Math.random() - 0.5) * 2 * R * (0.15 + thick);
          const hy = Math.pow(Math.random(), 0.8);
          y = hy;
          b = ix / (cols - 1);
          dx = 0; dy = hy; dz = 0;
        } else if (layout === 'ring') {
          const t0 = Math.random();
          const r = R * (0.55 + 0.45 * t0) + gauss() * spread * 0.2;
          const t = Math.min(1, Math.max(0, (r / R - 0.55) / 0.45));
          const th = Math.random() * Math.PI * 2;
          // gaps like Saturn's divisions
          if (Math.abs(t - 0.62) < 0.025 || Math.abs(t - 0.3) < 0.012) { i--; continue; }
          x = r * Math.cos(th); z = r * Math.sin(th); y = gauss() * thick * 0.3;
          b = t;
          dx = 0; dy = up; dz = 0;
        } else {
          // galaxy: 12% bulge + arms
          if (Math.random() < 0.12) {
            const r = Math.abs(gauss()) * R * 0.12;
            const u = Math.random() * 2 - 1;
            const th = Math.random() * Math.PI * 2;
            const s = Math.sqrt(1 - u * u);
            x = r * s * Math.cos(th); y = r * u * 0.7; z = r * s * Math.sin(th);
            b = Math.min(1, (r / R) * 0.8);
            dx = x / (r || 1); dy = y / (r || 1); dz = z / (r || 1);
          } else {
            const t = Math.pow(Math.random(), 0.75);
            const r = R * (0.06 + 0.94 * t);
            const arm = Math.floor(Math.random() * arms);
            const th = (arm / arms) * Math.PI * 2 + twist * Math.log(1 + 4 * t) + gauss() * spread * (0.25 + 0.35 * (1 - t));
            const rr = r * (1 + gauss() * spread * 0.12);
            const tb = Math.min(1, Math.max(0, (rr / R - 0.06) / 0.94));
            x = rr * Math.cos(th); z = rr * Math.sin(th);
            y = gauss() * thick * (0.15 + 0.85 * Math.exp(-t * 3)) * 0.7;
            b = tb;
            const ux = x / (rr || 1), uz = z / (rr || 1);
            dx = ux * 0.45; dy = up * 0.9; dz = uz * 0.45;
          }
        }
        pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
        band[i] = b;
        dir[i * 3] = dx; dir[i * 3 + 1] = dy; dir[i * 3 + 2] = dz;
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('aBand', new THREE.BufferAttribute(band, 1));
      geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
      geo.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), R * 4);
    };

    const DIR: Record<string, number> = { layout: 0, radial: 1, vertical: 2, scatter: 3 };

    return {
      resize(w, h, dpr) {
        resizeRenderer(renderer, camera, w, h, dpr);
        pxH = h * dpr;
      },
      render({ params: p, audio, dt, color }) {
        time += dt;
        const layout = str(p, 'layout', 'galaxy');
        const n = Math.round(num(p, 'count', 40000));
        const R = num(p, 'radius', 7);
        const arms = Math.round(num(p, 'arms', 3));
        const twist = num(p, 'twist', 2.6);
        const spread = num(p, 'spread', 0.35);
        const thick = num(p, 'thickness', 0.35);
        const nn = n;
        const key = `${layout}|${nn}|${R}|${arms}|${twist}|${spread}|${thick}`;
        if (key !== layoutKey) {
          // geometry rebuild: dispose old GPU buffers by swapping attributes
          geo.dispose();
          build(layout, nn, R, arms, twist, spread, thick);
          layoutKey = key;
        }

        // band texture (resample to texture width = band count)
        const nb = Math.max(1, audio.bands.length);
        if (nb !== bandTex.image.width) {
          bandTex.dispose();
          bandData = new Uint8Array(nb * 4);
          bandTex = new THREE.DataTexture(bandData, nb, 1, THREE.RGBAFormat);
          bandTex.magFilter = bandTex.minFilter = THREE.LinearFilter;
          mat.uniforms.uBands.value = bandTex;
          smooth = new Float32Array(nb);
        }
        const att = num(p, 'attack', 0.02);
        const rel = num(p, 'release', 0.25);
        for (let i = 0; i < nb; i++) {
          smooth[i] = follow(smooth[i], audio.bands[i] ?? 0, dt, att, rel);
          bandData[i * 4] = Math.max(0, Math.min(255, smooth[i] * 255));
        }
        bandTex.needsUpdate = true;

        const colorBy = str(p, 'colorBy', 'frequency');
        const byPal = colorBy === 'palette';
        const f0 = audio.pitch.freq > 20 ? audio.pitch.freq : 220;
        const pc = color.freq(f0, 1);
        tmpC.setRGB(pc[0], pc[1], pc[2], THREE.LinearSRGBColorSpace);
        mat.uniforms.uPitchColor.value.lerp(tmpC, 1 - Math.exp(-dt * 6));
        mat.uniforms.uPitchMix.value = colorBy === 'pitch' ? 0.85 : 0;
        palette.update(
          color as ColorMapper,
          (i, size) => {
            const t = i / (size - 1);
            if (byPal || !audio.bandFreqs.length) return color.norm(t, 1);
            return color.freq(sampleArray(audio.bandFreqs, t * (audio.bandFreqs.length - 1)) || 30 * Math.pow(500, t), 1);
          },
          `${byPal}|${audio.bandFreqs.length}|${audio.bandFreqs[audio.bandFreqs.length - 1]}`,
        );

        // beat burst envelope
        const bStr = num(p, 'burst', 0.45);
        if (audio.beat || (audio.beatCount !== lastBeatCount && lastBeatCount >= 0)) burst = Math.max(burst, bStr * (0.6 + 0.4 * Math.max(audio.bass, 0.5)));
        lastBeatCount = audio.beatCount;
        burst *= Math.exp(-dt / Math.max(0.02, num(p, 'burstDecay', 0.35)));

        rot += ((num(p, 'rotation', 6) * Math.PI) / 180) * dt;
        const u = mat.uniforms;
        u.uTime.value = time;
        u.uRot.value = rot;
        u.uDisp.value = num(p, 'disp', 1.4);
        u.uDirMode.value = DIR[str(p, 'dirMode', 'layout')] ?? 0;
        u.uBurst.value = burst;
        u.uSize.value = num(p, 'size', 0.09);
        u.uBase.value = num(p, 'base', 0.09);
        u.uGain.value = num(p, 'gain', 0.8);
        u.uTwinkle.value = num(p, 'twinkle', 0.3);
        u.uWobble.value = num(p, 'wobble', 0.3);
        u.uJitter.value = num(p, 'jitter', 0.8);
        u.uLayout.value = layout === 'cube' ? 2 : 0;
        u.uRadius.value = R;
        // keep overall brightness roughly constant as count / size change
        u.uNorm.value = Math.min(2.5, Math.sqrt(40000 / nn) * Math.pow(0.09 / Math.max(0.01, u.uSize.value), 0.7));
        u.uPxScale.value = pxScaleFor(camera, pxH);
        orbit.update(camera, p, dt);
        renderer.render(scene, camera);
      },
      dispose() {
        palette.dispose();
        bandTex.dispose();
        disposeAll(renderer, scene);
      },
    };
  },
};

export default viz;
