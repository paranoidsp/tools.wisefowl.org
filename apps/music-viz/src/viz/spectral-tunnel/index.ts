/**
 * Spectral Tunnel — a full-screen fragment shader. The spectrum history is a
 * DataTexture (bands × time) and colours come from a 1D palette texture
 * rebuilt from the global mapping, so: tunnel walls = frequency around the
 * circumference, time along the depth (the past recedes into the vanishing
 * point). Alternate modes: a domain-warped field and a polar "vortex".
 */
import * as THREE from 'three';
import type { ColorMapper, VizDefinition } from '../../core/types';
import { GLSL_PREMUL_ADD, PaletteTexture, createRenderer, disposeAll, follow, num, sampleArray, str } from '../_lib3d/three-kit';

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FRAG = GLSL_PREMUL_ADD + /* glsl */ `
  uniform sampler2D uHist;
  uniform sampler2D uPalette;
  uniform vec2 uRes;
  uniform float uHead;     // v of the newest row
  uniform float uRows;
  uniform float uTime;
  uniform float uTravel;   // integrated forward motion
  uniform int uMode;
  uniform float uTwist;
  uniform float uSym;
  uniform float uDepth;
  uniform float uRingRate;
  uniform float uRingGlow;
  uniform float uGain;
  uniform float uBase;
  uniform float uGamma;
  uniform float uBeat;
  uniform float uFade;
  uniform float uWarp;
  uniform float uScale;
  uniform float uBass;
  uniform float uSpin;
  varying vec2 vUv;

  #define TAU 6.28318530718

  float energy(float band, float age) {
    // age 0 = newest, 1 = oldest row
    float v = uHead + clamp(age, 0.0, 1.0) * (uRows - 1.0) / uRows;
    return texture2D(uHist, vec2(clamp(band, 0.0, 1.0), fract(v))).r;
  }
  vec3 pal(float t) { return texture2D(uPalette, vec2(clamp(t, 0.0, 1.0), 0.5)).rgb; }

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { s += a * noise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= 0.5; }
    return s;
  }
  float mirrorSym(float s) { return abs(fract(s * uSym) * 2.0 - 1.0); }

  void main() {
    vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0) * 2.0;
    vec3 col = vec3(0.0);

    if (uMode == 0) {
      // ── tunnel ──
      float r = max(length(p), 1e-3);
      float a = atan(p.y, p.x) / TAU + 0.5 + uSpin;
      float z = uDepth / r;                 // perspective depth
      float age = (z - uDepth / 1.6) / (uDepth * 6.0);  // near edge = newest
      float s = mirrorSym(a + uTwist * z * 0.05);
      float e = energy(s, age);
      e = pow(e, uGamma);
      float zz = z + uTravel;
      float ring = pow(abs(sin(zz * uRingRate * 3.14159)), 24.0);
      vec3 c = pal(s);
      col = c * (uBase + e * uGain) + c * ring * uRingGlow * (0.3 + e + uBeat);
      col += vec3(1.0) * pow(e, 4.0) * 0.35;
      col *= smoothstep(0.0, uFade, r) * (1.0 + uBeat * 0.4);
    } else if (uMode == 1) {
      // ── domain-warped field ──
      vec2 q = p * uScale;
      float t = uTime * 0.07;
      vec2 w1 = vec2(fbm(q + vec2(0.0, t)), fbm(q + vec2(5.2, 1.3 - t)));
      vec2 w2 = vec2(fbm(q + 3.0 * w1 + vec2(1.7, 9.2) + t * 1.3), fbm(q + 3.0 * w1 + vec2(8.3, 2.8)));
      float f = fbm(q + (uWarp + uBass * 1.5) * w2);
      float band = clamp((f - 0.25) / 0.55, 0.0, 1.0);
      float e = pow(energy(band, clamp(length(w2 - 0.5), 0.0, 1.0) * 0.5), uGamma);
      vec3 c = pal(band);
      // aurora ribbons: bright along iso-lines of the warped field, dark between
      float iso = fract(f * (3.0 + uRingRate * 3.0) - uTravel * 0.05);
      float ribbon = pow(1.0 - abs(iso * 2.0 - 1.0), 5.0);
      float sheet = smoothstep(0.25, 0.75, length(w1));
      col = c * (uBase + e * uGain) * (0.25 * sheet + ribbon * (0.6 + 0.8 * uRingGlow)) * 1.5;
      col *= (1.0 + uBeat * 0.5) * (1.0 - smoothstep(1.2, 2.6, length(p)));
    } else {
      // ── vortex: polar spectrogram, radius = frequency, angle = time ──
      float r = length(p);
      float a = atan(p.y, p.x) / TAU + 0.5;
      float band = clamp((r - 0.12) / 0.95, 0.0, 1.0);
      float sw = a + uTwist * r * 0.15 - uSpin;
      float age = abs(fract(sw * uSym) * 2.0 - 1.0);   // newest at the seam(s), ageing both ways
      float e = pow(energy(band, age), uGamma);
      vec3 c = pal(band);
      float ring = pow(abs(sin(band * uRingRate * 40.0)), 30.0);
      col = c * (uBase + e * uGain) * (1.0 - age * 0.7) + c * ring * uRingGlow * 0.4 * e;
      col *= smoothstep(0.08, 0.08 + uFade * 0.4, r) * (1.0 - smoothstep(1.05, 1.2, r));
      col *= 1.0 + uBeat * 0.4;
    }
    gl_FragColor = lightOut(col);
  }
`;

const MODES: Record<string, number> = { tunnel: 0, warp: 1, vortex: 2 };

const viz: VizDefinition = {
  id: 'spectral-tunnel',
  name: 'Spectral Tunnel',
  description:
    'Fly down a tunnel woven from the spectrum: frequency runs around the wall, time runs along the depth so the music you just heard recedes into the vanishing point. Also a domain-warped field and a polar vortex, all coloured by a palette texture rebuilt from the global mapping.',
  renderer: 'webgl',
  space: '3d',
  tags: ['3d', 'shader', 'spectrum', 'history', 'tunnel'],
  params: [
    {
      key: 'mode', label: 'Mode', type: 'select', default: 'tunnel', group: 'Shape',
      options: [ { value: 'tunnel', label: 'Tunnel (frequency around, time along)' }, { value: 'warp', label: 'Warp field (domain-warped noise)' }, { value: 'vortex', label: 'Vortex (radius = frequency, angle = time)' } ],
    },
    { key: 'speed', label: 'Ring speed', type: 'number', min: -4, max: 4, step: 0.05, default: 1, group: 'Shape', hint: '1 = rings travel with the spectrum history; other values slide past it' },
    { key: 'spin', label: 'Spin', type: 'number', min: -0.5, max: 0.5, step: 0.005, default: 0.02, unit: 'rev/s', group: 'Shape' },
    { key: 'twist', label: 'Twist', type: 'number', min: -6, max: 6, step: 0.05, default: 0.8, group: 'Shape' },
    { key: 'symmetry', label: 'Symmetry', type: 'number', min: 1, max: 12, step: 1, default: 1, group: 'Shape', hint: 'Mirrored copies of the spectrum around the wall (vortex: copies of the time seam)' },
    { key: 'depth', label: 'Tunnel radius', type: 'number', min: 0.1, max: 1.5, step: 0.01, default: 0.45, group: 'Shape' },
    { key: 'warp', label: 'Warp amount', type: 'number', min: 0, max: 8, step: 0.05, default: 3, group: 'Shape', hint: 'Warp mode: how far the noise folds into itself (bass adds more)' },
    { key: 'scale', label: 'Field scale', type: 'number', min: 0.3, max: 6, step: 0.05, default: 1.6, group: 'Shape' },
    { key: 'gain', label: 'Energy glow', type: 'number', min: 0, max: 4, step: 0.01, default: 1.5, group: 'Light' },
    { key: 'base', label: 'Quiet glow', type: 'number', min: 0, max: 1, step: 0.01, default: 0.06, group: 'Light' },
    { key: 'gamma', label: 'Contrast', type: 'number', min: 0.3, max: 4, step: 0.01, default: 1.6, group: 'Light' },
    { key: 'rings', label: 'Ring rate', type: 'number', min: 0, max: 4, step: 0.01, default: 1, group: 'Light' },
    { key: 'ringGlow', label: 'Ring glow', type: 'number', min: 0, max: 2, step: 0.01, default: 0.5, group: 'Light' },
    { key: 'beatFlash', label: 'Beat flash', type: 'number', min: 0, max: 2, step: 0.01, default: 0.6, group: 'Light' },
    { key: 'fade', label: 'Centre fade', type: 'number', min: 0.01, max: 1.5, step: 0.01, default: 0.5, group: 'Light', hint: 'Fades the vanishing point to transparent so layers below show through' },
    { key: 'rows', label: 'History rows', type: 'number', min: 16, max: 256, step: 1, default: 96, group: 'Time' },
    { key: 'scroll', label: 'History speed', type: 'number', min: 2, max: 120, step: 1, default: 40, unit: 'rows/s', group: 'Time' },
    {
      key: 'colorBy', label: 'Colour by', type: 'select', default: 'frequency', group: 'Colour',
      options: [ { value: 'frequency', label: 'Band frequency' }, { value: 'palette', label: 'Palette position' } ],
    },
    { key: 'resolution', label: 'Render resolution', type: 'number', min: 0.25, max: 1, step: 0.05, default: 0.75, group: 'Performance', hint: 'Shader renders at this fraction of the stage resolution and is upscaled' },
  ],
  presets: [
    { name: 'Hyperspace', description: 'Spectrum tunnel with rings on the beat', params: {} },
    {
      name: 'Kaleido tunnel', description: '6-fold mirrored walls, strong twist, palette colours',
      params: { symmetry: 6, twist: 3.2, speed: 1, spin: -0.04, depth: 0.35, ringGlow: 0.9, rings: 1.6, colorBy: 'palette', gamma: 1.3 },
      modulations: { twist: { source: 'bass', amount: 0.08, smooth: 0.6 } },
    },
    {
      name: 'Liquid aurora', description: 'Domain-warped field: bass folds the noise, bands light the folds',
      params: { mode: 'warp', warp: 2.6, scale: 1.1, gain: 1.8, base: 0.15, gamma: 1.1, rings: 0.6, ringGlow: 0.8, colorBy: 'palette', resolution: 0.6 },
    },
    {
      name: 'Vinyl vortex', description: 'Polar spectrogram: radius = frequency, the past swirls around',
      params: { mode: 'vortex', twist: 1.5, spin: 0.05, symmetry: 1, rows: 200, scroll: 40, gain: 1.8, gamma: 1.3, rings: 1, ringGlow: 0.6, fade: 0.3 },
    },
  ],

  create(canvas) {
    const renderer = createRenderer(canvas);
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const palette = new PaletteTexture(256);
    let W = 0;
    let H = 0;
    let data = new Uint8Array(4);
    let hist = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
    let head = 0;
    let acc = 0;
    let cur = new Float32Array(0);
    let travel = 0;
    let spin = 0;
    let time = 0;
    let beat = 0;
    let lastBeatCount = -1;
    let bass = 0;
    let cssW = 1, cssH = 1, dpr = 1, scale = -1;

    const uniforms = {
      uHist: { value: hist as THREE.Texture }, uPalette: { value: palette.texture }, uRes: { value: new THREE.Vector2(1, 1) }, uHead: { value: 0 }, uRows: { value: 1 },
      uTime: { value: 0 }, uTravel: { value: 0 }, uMode: { value: 0 }, uTwist: { value: 0 }, uSym: { value: 2 }, uDepth: { value: 0.45 }, uRingRate: { value: 1 },
      uRingGlow: { value: 0.5 }, uGain: { value: 1.5 }, uBase: { value: 0.06 }, uGamma: { value: 1.6 }, uBeat: { value: 0 }, uFade: { value: 0.5 }, uWarp: { value: 3 },
      uScale: { value: 1.6 }, uBass: { value: 0 }, uSpin: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, depthTest: false, depthWrite: false });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    quad.frustumCulled = false;
    scene.add(quad);

    const build = (w: number, h: number) => {
      hist.dispose();
      W = w; H = h;
      data = new Uint8Array(W * H * 4);
      hist = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
      hist.magFilter = hist.minFilter = THREE.LinearFilter;
      hist.wrapT = THREE.RepeatWrapping;
      hist.wrapS = THREE.ClampToEdgeWrapping;
      hist.needsUpdate = true;
      uniforms.uHist.value = hist;
      cur = new Float32Array(W);
      head = 0;
    };

    const applySize = (s: number) => {
      scale = s;
      renderer.setPixelRatio(dpr * s);
      renderer.setSize(Math.max(1, cssW), Math.max(1, cssH), false);
      uniforms.uRes.value.set(cssW, cssH);
    };

    return {
      resize(w, h, d) {
        cssW = w; cssH = h; dpr = d;
        applySize(scale > 0 ? scale : 0.75);
      },
      render({ params: p, audio, dt, color }) {
        time += dt;
        const res = num(p, 'resolution', 0.75);
        if (res !== scale) applySize(res);
        const nb = Math.max(2, audio.bands.length);
        const rows = Math.round(num(p, 'rows', 96));
        if (nb !== W || rows !== H) build(nb, rows);

        // history: newest row at `head`, older rows at head+1, head+2 … (mod H)
        for (let i = 0; i < W; i++) cur[i] = follow(cur[i], audio.bands[i] ?? 0, dt, 0.015, 0.12);
        acc += dt * num(p, 'scroll', 40);
        let pushed = false;
        let n = 0;
        while (acc >= 1 && n < H) {
          acc -= 1; n++;
          head = (head + H - 1) % H;
          pushed = true;
        }
        if (acc >= 1) acc = 0;
        // the newest row is always live
        const o = head * W * 4;
        for (let i = 0; i < W; i++) data[o + i * 4] = Math.max(0, Math.min(255, cur[i] * 255));
        if (pushed) {
          // rows skipped by a long frame: copy the live row into them
          for (let k = 1; k < n; k++) data.copyWithin(((head + k) % H) * W * 4, o, o + W * 4);
        }
        hist.needsUpdate = true;

        const byPal = str(p, 'colorBy', 'frequency') === 'palette';
        palette.update(
          color as ColorMapper,
          (i, size) => {
            const t = i / (size - 1);
            if (byPal || !audio.bandFreqs.length) return color.norm(t, 1);
            return color.freq(sampleArray(audio.bandFreqs, t * (audio.bandFreqs.length - 1)) || 30 * Math.pow(500, t), 1);
          },
          `${byPal}|${audio.bandFreqs.length}|${audio.bandFreqs[audio.bandFreqs.length - 1]}`,
        );

        if (audio.beat || (audio.beatCount !== lastBeatCount && lastBeatCount >= 0)) beat = 1;
        lastBeatCount = audio.beatCount;
        beat *= Math.exp(-dt / 0.18);
        bass = follow(bass, audio.bass, dt, 0.05, 0.3);
        // at speed 1 the ring lines move exactly with the history rows: z-rate = scroll·6·depth/rows
        travel += dt * num(p, 'speed', 1) * ((num(p, 'scroll', 40) * 6 * num(p, 'depth', 0.45)) / Math.max(1, H));
        spin += dt * num(p, 'spin', 0.02);

        uniforms.uHead.value = (head + 0.5) / H;
        uniforms.uRows.value = H;
        uniforms.uTime.value = time;
        uniforms.uTravel.value = travel;
        uniforms.uMode.value = MODES[str(p, 'mode', 'tunnel')] ?? 0;
        uniforms.uTwist.value = num(p, 'twist', 0.8);
        uniforms.uSym.value = Math.round(num(p, 'symmetry', 2));
        uniforms.uDepth.value = num(p, 'depth', 0.45);
        uniforms.uRingRate.value = num(p, 'rings', 1);
        uniforms.uRingGlow.value = num(p, 'ringGlow', 0.5);
        uniforms.uGain.value = num(p, 'gain', 1.5);
        uniforms.uBase.value = num(p, 'base', 0.06);
        uniforms.uGamma.value = num(p, 'gamma', 1.6);
        uniforms.uBeat.value = beat * num(p, 'beatFlash', 0.6);
        uniforms.uFade.value = num(p, 'fade', 0.5);
        uniforms.uWarp.value = num(p, 'warp', 3);
        uniforms.uScale.value = num(p, 'scale', 1.6);
        uniforms.uBass.value = bass;
        uniforms.uSpin.value = spin;
        renderer.render(scene, camera);
      },
      dispose() {
        palette.dispose();
        hist.dispose();
        disposeAll(renderer, scene);
      },
    };
  },
};

export default viz;
