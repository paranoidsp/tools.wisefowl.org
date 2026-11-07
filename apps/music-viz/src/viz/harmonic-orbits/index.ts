/**
 * Harmonic Orbits — the fundamental is a glowing sun (colour = its pitch
 * through the global mapping, size = loudness); its harmonics k·f0 orbit it
 * as planets at radius ∝ k (or log k), turning k times faster, sized by the
 * measured partial amplitude. Beats send shockwave rings outward.
 */
import * as THREE from 'three';
import type { RGB, VizDefinition } from '../../core/types';
import {
  ADD_PREMUL, AutoOrbit, GLSL_PREMUL_ADD, bool, glowPointsMaterial, lightLineMaterial, cameraParams, createRenderer, disposeAll, follow, num, resizeRenderer, setColor, spectrumAt, str,
} from '../_lib3d/three-kit';

const MAXH = 16; // max harmonics (k = 2 … 17)
const RING_SEG = 160;
const TRAIL = 120;
const WAVES = 6;
const DUST = 1400;

const SPHERE_VERT = /* glsl */ `
  uniform vec3 uColor;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vC;
  void main() {
    mat4 m = modelViewMatrix;
    #ifdef USE_INSTANCING
      m = m * instanceMatrix;
    #endif
    vec4 mv = m * vec4(position, 1.0);
    vN = normalize(mat3(m) * normal);
    vV = mv.xyz;
    #ifdef USE_INSTANCING_COLOR
      vC = instanceColor;
    #else
      vC = uColor;
    #endif
    gl_Position = projectionMatrix * mv;
  }
`;
const SPHERE_FRAG = /* glsl */ `
  uniform float uHot;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vC;
  void main() {
    float ndv = clamp(dot(normalize(vN), normalize(-vV)), 0.0, 1.0);
    vec3 c = vC * (0.35 + 0.75 * ndv) + vC * pow(1.0 - ndv, 2.5) * 0.9;
    c += vec3(1.0) * pow(ndv, 6.0) * uHot;
    gl_FragColor = vec4(c, 1.0);
  }
`;
const WAVE_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const WAVE_FRAG = GLSL_PREMUL_ADD + /* glsl */ `
  uniform vec3 uColor;
  uniform float uAlpha;
  uniform float uWidth;
  varying vec2 vUv;
  void main() {
    float d = length(vUv * 2.0 - 1.0);
    if (d > 1.0) discard;
    float x = (d - 0.9) / uWidth;
    float a = (exp(-x * x) + 0.08 * smoothstep(0.0, 0.9, d)) * uAlpha;
    gl_FragColor = lightOut(uColor * a);
  }
`;

const viz: VizDefinition = {
  id: 'harmonic-orbits',
  name: 'Harmonic Orbits',
  description:
    'A 3D “primary blob + harmonic rings”: the fundamental is a sun coloured by its pitch and sized by loudness, and each harmonic k·f₀ is a planet orbiting at radius ∝ k that turns k times faster — timbre becomes a solar system. Beats launch shockwaves.',
  renderer: 'webgl',
  space: '3d',
  tags: ['3d', 'harmonics', 'pitch', 'timbre'],
  params: [
    { key: 'count', label: 'Harmonics', type: 'number', min: 1, max: MAXH, step: 1, default: 8, group: 'Harmonics', hint: 'Partials k = 2 … count+1 orbit the fundamental' },
    {
      key: 'spacing', label: 'Radius law', type: 'select', default: 'log', group: 'Harmonics',
      options: [ { value: 'linear', label: 'Linear (r ∝ k)' }, { value: 'log', label: 'Logarithmic (r ∝ log k, octaves evenly)' }, { value: 'sqrt', label: 'Square root' } ],
    },
    { key: 'radius', label: 'Outer radius', type: 'number', min: 1, max: 14, step: 0.1, default: 6, group: 'Harmonics' },
    {
      key: 'orbitLaw', label: 'Orbit speed law', type: 'select', default: 'ratio', group: 'Harmonics',
      options: [ { value: 'ratio', label: 'Frequency ratio (k× faster)' }, { value: 'kepler', label: 'Kepler (outer = slower)' }, { value: 'locked', label: 'Locked (aligned spokes)' } ],
    },
    { key: 'orbitSpeed', label: 'Orbit speed', type: 'number', min: -120, max: 120, step: 0.5, default: 14, unit: '°/s', group: 'Harmonics', hint: 'Angular speed of the innermost orbit' },
    { key: 'tilt', label: 'Orbit tilt spread', type: 'number', min: 0, max: 90, step: 0.5, default: 18, unit: '°', group: 'Harmonics', hint: '0 = all orbits in one flat disc' },
    { key: 'precession', label: 'Precession', type: 'number', min: -60, max: 60, step: 0.5, default: 3, unit: '°/s', group: 'Harmonics' },
    { key: 'size', label: 'Planet size', type: 'number', min: 0.05, max: 1.5, step: 0.01, default: 0.38, group: 'Harmonics' },
    { key: 'ampCurve', label: 'Amplitude curve', type: 'number', min: 0.2, max: 2, step: 0.01, default: 0.7, group: 'Harmonics', hint: '<1 keeps faint partials visible' },
    { key: 'coreSize', label: 'Sun size', type: 'number', min: 0.1, max: 3, step: 0.01, default: 0.9, group: 'Fundamental' },
    { key: 'loudSize', label: 'Loudness → size', type: 'number', min: 0, max: 2, step: 0.01, default: 0.8, group: 'Fundamental' },
    { key: 'beatPump', label: 'Beat pump', type: 'number', min: 0, max: 1, step: 0.01, default: 0.25, group: 'Fundamental' },
    { key: 'halo', label: 'Halo', type: 'number', min: 0, max: 6, step: 0.05, default: 3.2, group: 'Fundamental' },
    { key: 'colorSmooth', label: 'Colour glide', type: 'number', min: 0, max: 0.98, step: 0.01, default: 0.6, group: 'Fundamental', hint: 'Smooths colour jumps between notes' },
    { key: 'rings', label: 'Orbit rings', type: 'boolean', default: true, group: 'Rings & trails' },
    { key: 'ringOpacity', label: 'Ring brightness', type: 'number', min: 0, max: 1, step: 0.01, default: 0.45, group: 'Rings & trails', hint: 'Rings brighten with their partial’s amplitude' },
    { key: 'trail', label: 'Trail length', type: 'number', min: 0, max: 1, step: 0.01, default: 0.45, group: 'Rings & trails' },
    { key: 'shock', label: 'Beat shockwaves', type: 'number', min: 0, max: 1, step: 0.01, default: 0.45, group: 'Rings & trails' },
    { key: 'shockSpeed', label: 'Shockwave speed', type: 'number', min: 1, max: 40, step: 0.5, default: 10, unit: 'u/s', group: 'Rings & trails' },
    { key: 'dust', label: 'Star dust', type: 'number', min: 0, max: 1, step: 0.01, default: 0.35, group: 'Rings & trails' },
    {
      key: 'harmColor', label: 'Harmonic colour', type: 'select', default: 'partial', group: 'Colour',
      options: [ { value: 'partial', label: 'Each partial’s own frequency' }, { value: 'fundamental', label: 'Fundamental’s colour' }, { value: 'palette', label: 'Palette by k' } ],
    },
    ...cameraParams({ speed: 4, distance: 15, elevation: 24, fov: 50 }),
  ],
  presets: [
    { name: 'Solar system', description: 'Gently tilted orbits, Kepler motion, trails', params: { orbitLaw: 'kepler', orbitSpeed: 40, tilt: 8, trail: 0.55 } },
    {
      name: 'Atom', description: 'Steeply tilted orbits like an atom model, rings bright',
      params: { count: 6, spacing: 'sqrt', radius: 5, tilt: 80, orbitLaw: 'ratio', orbitSpeed: 30, precession: 12, ringOpacity: 0.7, trail: 0.2, size: 0.3, camSpeed: 10, camDistance: 13, dust: 0.15 },
    },
    {
      name: 'Harmonic mandala', description: 'Top-down flat disc: the literal primary blob with rings of harmonic colour',
      params: { count: 12, spacing: 'log', radius: 7, tilt: 0, precession: 0, orbitLaw: 'locked', orbitSpeed: 25, ringOpacity: 0.9, trail: 0.85, size: 0.32, camElevation: 89, camDistance: 15, camSpeed: 0, camSway: 0, shock: 0.8, halo: 4 },
      modulations: { orbitSpeed: { source: 'loudness', amount: 0.15, smooth: 0.5 } },
    },
    {
      name: 'Gyroscope', description: 'Orbits spread through every plane and precessing; long trails',
      params: { count: 10, spacing: 'linear', radius: 6.5, tilt: 90, precession: 22, orbitLaw: 'ratio', orbitSpeed: 18, trail: 1, rings: false, size: 0.25, coreSize: 0.7, camSpeed: -6, camDistance: 16 },
      modulations: { camDistance: { source: 'bass', amount: -0.08, smooth: 0.7 } },
    },
  ],

  create(canvas) {
    const renderer = createRenderer(canvas);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 400);
    const orbit = new AutoOrbit();
    let pxH = 400;

    // sun
    const sphereGeo = new THREE.IcosahedronGeometry(1, 5);
    const sunMat = new THREE.ShaderMaterial({ vertexShader: SPHERE_VERT, fragmentShader: SPHERE_FRAG, uniforms: { uColor: { value: new THREE.Color() }, uHot: { value: 0.55 } } });
    const sun = new THREE.Mesh(sphereGeo, sunMat);
    scene.add(sun);

    // planets (instanced)
    const planetMat = new THREE.ShaderMaterial({ vertexShader: SPHERE_VERT, fragmentShader: SPHERE_FRAG, uniforms: { uColor: { value: new THREE.Color() }, uHot: { value: 0.35 } } });
    const planets = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 3), planetMat, MAXH);
    planets.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXH * 3), 3);
    planets.frustumCulled = false;
    scene.add(planets);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    const tmpV = new THREE.Vector3();

    // glows (sun + planets) as world-sized points
    const glowGeo = new THREE.BufferGeometry();
    const glowPos = new THREE.BufferAttribute(new Float32Array((MAXH + 1) * 3), 3).setUsage(THREE.DynamicDrawUsage);
    const glowCol = new THREE.BufferAttribute(new Float32Array((MAXH + 1) * 3), 3).setUsage(THREE.DynamicDrawUsage);
    const glowSize = new THREE.BufferAttribute(new Float32Array(MAXH + 1), 1).setUsage(THREE.DynamicDrawUsage);
    glowGeo.setAttribute('position', glowPos);
    glowGeo.setAttribute('color', glowCol);
    glowGeo.setAttribute('size', glowSize);
    const glowMat = glowPointsMaterial(3.5);
    const glows = new THREE.Points(glowGeo, glowMat);
    glows.frustumCulled = false;
    glows.renderOrder = 3;
    scene.add(glows);

    // orbit rings
    const ringGeo = new THREE.BufferGeometry();
    const ringPos = new THREE.BufferAttribute(new Float32Array(MAXH * RING_SEG * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage);
    const ringCol = new THREE.BufferAttribute(new Float32Array(MAXH * RING_SEG * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage);
    ringGeo.setAttribute('position', ringPos);
    ringGeo.setAttribute('color', ringCol);
    const lineMat = () => lightLineMaterial();
    const rings = new THREE.LineSegments(ringGeo, lineMat());
    rings.frustumCulled = false;
    rings.renderOrder = 1;
    scene.add(rings);

    // trails
    const trailHist = new Float32Array(MAXH * TRAIL * 3);
    let trailHead = 0;
    let trailFill = 0;
    const trailGeo = new THREE.BufferGeometry();
    const trailPos = new THREE.BufferAttribute(new Float32Array(MAXH * (TRAIL - 1) * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage);
    const trailCol = new THREE.BufferAttribute(new Float32Array(MAXH * (TRAIL - 1) * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage);
    trailGeo.setAttribute('position', trailPos);
    trailGeo.setAttribute('color', trailCol);
    const trails = new THREE.LineSegments(trailGeo, lineMat());
    trails.frustumCulled = false;
    trails.renderOrder = 2;
    scene.add(trails);

    // shockwaves
    const waveGeo = new THREE.PlaneGeometry(2, 2);
    waveGeo.rotateX(-Math.PI / 2);
    const waves = Array.from({ length: WAVES }, () => {
      const mat = new THREE.ShaderMaterial({
        vertexShader: WAVE_VERT, fragmentShader: WAVE_FRAG,
        uniforms: { uColor: { value: new THREE.Color() }, uAlpha: { value: 0 }, uWidth: { value: 0.03 } },
        ...ADD_PREMUL, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(waveGeo, mat);
      mesh.visible = false;
      mesh.renderOrder = 4;
      scene.add(mesh);
      return { mesh, mat, age: 99, life: 1, r0: 1, strength: 1 };
    });
    let waveNext = 0;
    let lastBeatCount = -1;

    // dust
    const dustGeo = new THREE.BufferGeometry();
    const dp = new Float32Array(DUST * 3);
    const dc = new Float32Array(DUST * 3);
    const ds = new Float32Array(DUST);
    const dustSeed = new Float32Array(DUST);
    for (let i = 0; i < DUST; i++) {
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const r = 14 + Math.pow(Math.random(), 0.7) * 40;
      const s = Math.sqrt(1 - u * u);
      dp[i * 3] = r * s * Math.cos(th);
      dp[i * 3 + 1] = r * u * 0.6;
      dp[i * 3 + 2] = r * s * Math.sin(th);
      ds[i] = 0.08 + Math.random() * 0.25;
      dustSeed[i] = Math.random();
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    const dustColAttr = new THREE.BufferAttribute(dc, 3);
    dustGeo.setAttribute('color', dustColAttr);
    dustGeo.setAttribute('size', new THREE.BufferAttribute(ds, 1));
    const dustMat = glowPointsMaterial(6);
    const dust = new THREE.Points(dustGeo, dustMat);
    dust.frustumCulled = false;
    scene.add(dust);
    let dustKey: unknown = null;
    let dustAmt = -1;

    // state
    const phase = new Float32Array(MAXH);
    const amps = new Float32Array(MAXH);
    let precess = 0;
    const sunColor = new THREE.Color();
    const tgtColor = new THREE.Color();
    const hColors = Array.from({ length: MAXH }, () => new THREE.Color());
    const tmpC = new THREE.Color();
    let sunR = 1;
    const basisU = new Float32Array(MAXH * 3);
    const basisV = new Float32Array(MAXH * 3);
    const radii = new Float32Array(MAXH);
    const ppos = new Float32Array(MAXH * 3);

    return {
      resize(w, h, dpr) {
        resizeRenderer(renderer, camera, w, h, dpr);
        pxH = h * dpr;
      },
      render({ params: p, audio, dt, color }) {
        const N = Math.round(num(p, 'count', 8));
        const R = num(p, 'radius', 6);
        const spacing = str(p, 'spacing', 'log');
        const law = str(p, 'orbitLaw', 'ratio');
        const tilt = (num(p, 'tilt', 18) * Math.PI) / 180;
        precess += ((num(p, 'precession', 3) * Math.PI) / 180) * dt;
        const omega0 = (num(p, 'orbitSpeed', 14) * Math.PI) / 180;
        const glide = 1 - Math.pow(num(p, 'colorSmooth', 0.6), dt * 60);

        // fundamental
        const f0 = audio.pitch.freq > 20 ? audio.pitch.freq : audio.peaks[0]?.freq || 220;
        setColor(tgtColor, color.freq(f0, 0.6 + 0.4 * audio.loudness));
        sunColor.lerp(tgtColor, glide);
        const sunTarget = num(p, 'coreSize', 0.9) * (0.55 + num(p, 'loudSize', 0.8) * audio.loudness) * (1 + num(p, 'beatPump', 0.25) * audio.beatPulse);
        sunR = follow(sunR, sunTarget, dt, 0.03, 0.2);
        sun.scale.setScalar(Math.max(0.01, sunR));
        sunMat.uniforms.uColor.value.copy(sunColor);

        const coreR = num(p, 'coreSize', 0.9) * 1.2;
        const hmode = str(p, 'harmColor', 'partial');
        const sizeK = num(p, 'size', 0.38);
        const ampCurve = num(p, 'ampCurve', 0.7);
        for (let i = 0; i < MAXH; i++) {
          const k = i + 2;
          // radius
          const u = spacing === 'linear' ? (k - 1) / N : spacing === 'sqrt' ? Math.sqrt(k - 1) / Math.sqrt(N) : Math.log(k) / Math.log(N + 1);
          radii[i] = coreR + (R - coreR) * u;
          // angular speed
          const w = law === 'ratio' ? omega0 * (k - 1) : law === 'kepler' ? omega0 * Math.pow(radii[0] / radii[i], 1.5) : omega0;
          phase[i] += w * dt;
          // orbit plane basis
          const sgn = i % 2 ? -1 : 1;
          const ti = tilt * sgn * (0.35 + 0.65 * ((i * 0.6180339) % 1));
          const om = i * 2.39996 + precess * (1 + i * 0.07);
          basisU[i * 3] = Math.cos(om); basisU[i * 3 + 1] = 0; basisU[i * 3 + 2] = -Math.sin(om);
          basisV[i * 3] = Math.cos(ti) * Math.sin(om); basisV[i * 3 + 1] = -Math.sin(ti); basisV[i * 3 + 2] = Math.cos(ti) * Math.cos(om);
          // amplitude
          let a = 0;
          if (i < N) {
            const part = audio.partials[k - 1];
            a = part && part.freq > 0 ? part.amp : spectrumAt(audio.spectrum, audio.sampleRate, audio.fftSize, f0 * k, 0.3);
          }
          amps[i] = follow(amps[i], Math.min(1, Math.max(0, a)), dt, 0.03, 0.25);
          const hf = audio.partials[k - 1]?.freq || f0 * k;
          const rgb: RGB = hmode === 'fundamental' ? [sunColor.r, sunColor.g, sunColor.b] : hmode === 'palette' ? color.norm((k - 2) / Math.max(1, N - 1), 1) : color.freq(hf, 1);
          setColor(tmpC, rgb);
          hColors[i].lerp(tmpC, glide);
          const x = radii[i] * Math.cos(phase[i]);
          const y = radii[i] * Math.sin(phase[i]);
          ppos[i * 3] = x * basisU[i * 3] + y * basisV[i * 3];
          ppos[i * 3 + 1] = x * basisU[i * 3 + 1] + y * basisV[i * 3 + 1];
          ppos[i * 3 + 2] = x * basisU[i * 3 + 2] + y * basisV[i * 3 + 2];
        }

        // planets + glows
        const ic = planets.instanceColor!.array as Float32Array;
        const gp = glowPos.array as Float32Array;
        const gc = glowCol.array as Float32Array;
        const gs = glowSize.array as Float32Array;
        const halo = num(p, 'halo', 3.2);
        gp[0] = gp[1] = gp[2] = 0;
        gc[0] = sunColor.r * 0.9; gc[1] = sunColor.g * 0.9; gc[2] = sunColor.b * 0.9;
        gs[0] = sunR * halo * 2.2;
        for (let i = 0; i < MAXH; i++) {
          const a = Math.pow(amps[i], ampCurve);
          const s = i < N ? sizeK * (0.25 + 0.75 * a) * Math.pow(0.97, i) : 0;
          tmpV.set(ppos[i * 3], ppos[i * 3 + 1], ppos[i * 3 + 2]);
          sc.setScalar(Math.max(1e-4, s));
          m4.compose(tmpV, q, sc);
          planets.setMatrixAt(i, m4);
          const b = 0.35 + 0.65 * a;
          ic[i * 3] = hColors[i].r * b; ic[i * 3 + 1] = hColors[i].g * b; ic[i * 3 + 2] = hColors[i].b * b;
          gp[(i + 1) * 3] = tmpV.x; gp[(i + 1) * 3 + 1] = tmpV.y; gp[(i + 1) * 3 + 2] = tmpV.z;
          gc[(i + 1) * 3] = hColors[i].r * a; gc[(i + 1) * 3 + 1] = hColors[i].g * a; gc[(i + 1) * 3 + 2] = hColors[i].b * a;
          gs[i + 1] = i < N ? s * (1 + halo * 0.9) * 2 : 0;
        }
        planets.instanceMatrix.needsUpdate = true;
        planets.instanceColor!.needsUpdate = true;
        glowPos.needsUpdate = glowCol.needsUpdate = glowSize.needsUpdate = true;

        // rings
        const showRings = bool(p, 'rings', true);
        rings.visible = showRings;
        if (showRings) {
          const rp = ringPos.array as Float32Array;
          const rc = ringCol.array as Float32Array;
          const ro = num(p, 'ringOpacity', 0.45);
          let o = 0;
          for (let i = 0; i < MAXH; i++) {
            const a = i < N ? ro * (0.15 + 0.85 * Math.pow(amps[i], ampCurve)) : 0;
            for (let s = 0; s < RING_SEG; s++) {
              for (let e = 0; e < 2; e++) {
                const th = ((s + e) / RING_SEG) * Math.PI * 2;
                const x = radii[i] * Math.cos(th);
                const y = radii[i] * Math.sin(th);
                rp[o] = x * basisU[i * 3] + y * basisV[i * 3];
                rp[o + 1] = x * basisU[i * 3 + 1] + y * basisV[i * 3 + 1];
                rp[o + 2] = x * basisU[i * 3 + 2] + y * basisV[i * 3 + 2];
                // brighter just behind the planet (comet-ish)
                const lag = ((((phase[i] - th) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2);
                const f = a * (0.45 + 0.55 * Math.pow(1 - lag, 3));
                rc[o] = hColors[i].r * f; rc[o + 1] = hColors[i].g * f; rc[o + 2] = hColors[i].b * f;
                o += 3;
              }
            }
          }
          ringPos.needsUpdate = ringCol.needsUpdate = true;
        }

        // trails
        trailHead = (trailHead + 1) % TRAIL;
        trailFill = Math.min(TRAIL, trailFill + 1);
        trailHist.set(ppos.subarray(0, MAXH * 3), trailHead * MAXH * 3);
        const tl = Math.floor(num(p, 'trail', 0.45) * (TRAIL - 1));
        const len = Math.min(tl, trailFill - 1);
        trails.visible = len > 1;
        if (trails.visible) {
          const tp = trailPos.array as Float32Array;
          const tc = trailCol.array as Float32Array;
          let o = 0;
          for (let i = 0; i < N; i++) {
            const a = 0.25 + 0.75 * Math.pow(amps[i], ampCurve);
            for (let s = 0; s < len; s++) {
              for (let e = 0; e < 2; e++) {
                const h = (((trailHead - s - e) % TRAIL) + TRAIL) % TRAIL;
                const src = h * MAXH * 3 + i * 3;
                tp[o] = trailHist[src]; tp[o + 1] = trailHist[src + 1]; tp[o + 2] = trailHist[src + 2];
                const f = a * Math.pow(1 - (s + e) / len, 1.6) * 0.9;
                tc[o] = hColors[i].r * f; tc[o + 1] = hColors[i].g * f; tc[o + 2] = hColors[i].b * f;
                o += 3;
              }
            }
          }
          trailGeo.setDrawRange(0, o / 3);
          trailPos.needsUpdate = trailCol.needsUpdate = true;
        }

        // shockwaves
        const shock = num(p, 'shock', 0.45);
        if (shock > 0 && (audio.beat || (audio.beatCount !== lastBeatCount && lastBeatCount >= 0 && audio.beatCount > 0))) {
          const w = waves[waveNext];
          waveNext = (waveNext + 1) % WAVES;
          w.age = 0;
          w.r0 = sunR;
          w.strength = shock * (0.5 + 0.5 * Math.max(audio.beatPulse, audio.bass, 0.5));
          w.mat.uniforms.uColor.value.copy(sunColor);
          w.life = (R * 1.6) / Math.max(0.5, num(p, 'shockSpeed', 10));
        }
        lastBeatCount = audio.beatCount;
        for (const w of waves) {
          w.age += dt;
          const t = w.age / w.life;
          w.mesh.visible = t < 1 && shock > 0;
          if (!w.mesh.visible) continue;
          const r = w.r0 + (R * 1.6 - w.r0) * (1 - Math.pow(1 - t, 2));
          w.mesh.scale.setScalar(r);
          w.mat.uniforms.uAlpha.value = w.strength * Math.pow(1 - t, 1.5);
          w.mat.uniforms.uWidth.value = 0.012 + 0.025 * t;
        }

        // dust
        const dAmt = num(p, 'dust', 0.35);
        dust.visible = dAmt > 0;
        if (dust.visible && (dustKey !== color || dustAmt !== dAmt)) {
          dustKey = color;
          dustAmt = dAmt;
          for (let i = 0; i < DUST; i++) {
            const c = color.norm(dustSeed[i], 1);
            const b = dAmt * (0.25 + 0.75 * ((dustSeed[i] * 7.3) % 1));
            dc[i * 3] = c[0] * b * 0.8 + b * 0.2; dc[i * 3 + 1] = c[1] * b * 0.8 + b * 0.2; dc[i * 3 + 2] = c[2] * b * 0.8 + b * 0.2;
          }
          dustColAttr.needsUpdate = true;
        }
        dust.rotation.y += dt * 0.01;

        const pxScale = pxH / (2 * Math.tan((camera.fov * Math.PI) / 360));
        glowMat.uniforms.uPxScale.value = pxScale;
        dustMat.uniforms.uPxScale.value = pxScale;
        orbit.update(camera, p, dt);
        renderer.render(scene, camera);
      },
      dispose() {
        disposeAll(renderer, scene);
      },
    };
  },
};

export default viz;
