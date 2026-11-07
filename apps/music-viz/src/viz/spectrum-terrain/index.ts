/**
 * Spectrum Terrain — the spectrum's recent history as a 3D landscape.
 * Columns = frequency bands, rows = time (newest at the front, receding into
 * the distance), height = energy, vertex colour = the band's frequency
 * through the global colour mapping.
 */
import * as THREE from 'three';
import type { ColorMapper, RGB, VizDefinition } from '../../core/types';
import { ADD_PREMUL, AutoOrbit, GLSL_PREMUL_ADD, bool, cameraParams, createRenderer, disposeAll, num, resizeRenderer, sampleArray, str } from '../_lib3d/three-kit';

const VERT = /* glsl */ `
  attribute vec3 color;
  uniform float uFront;
  uniform float uDepth;
  uniform float uPointSize;
  uniform float uPxScale;
  varying vec3 vColor;
  varying vec3 vView;
  varying float vAge;
  void main() {
    vColor = color;
    vAge = clamp((uFront - position.z) / uDepth, 0.0, 1.0);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = mv.xyz;
    gl_Position = projectionMatrix * mv;
    #ifdef IS_POINTS
      gl_PointSize = max(1.0, uPointSize * uPxScale / max(0.1, -mv.z) * (0.4 + 0.6 * length(color)));
    #endif
  }
`;

const FRAG = GLSL_PREMUL_ADD + /* glsl */ `
  uniform float uOpacity;
  uniform float uFog;
  uniform float uBright;
  uniform float uLight;
  varying vec3 vColor;
  varying vec3 vView;
  varying float vAge;
  void main() {
    float fade = (1.0 - smoothstep(uFog, 1.0, vAge)) * smoothstep(0.0, 0.04, vAge);
    vec3 c = vColor * uBright;
    #ifdef IS_SOLID
      vec3 n = normalize(cross(dFdx(vView), dFdy(vView)));
      vec3 l = normalize(vec3(0.3, 0.9, 0.4));
      vec3 v = normalize(-vView);
      float diff = 0.35 + 0.65 * max(dot(n, l), 0.0);
      float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
      c = c * diff + vColor * rim * 0.6;
    #endif
    float a = uOpacity * fade;
    #ifdef IS_POINTS
      vec2 p = gl_PointCoord * 2.0 - 1.0;
      float r2 = dot(p, p);
      if (r2 > 1.0) discard;
      a *= exp(-r2 * 3.0);
    #endif
    if (a < 0.003) discard;
    #ifdef IS_SOLID
      gl_FragColor = vec4(c, a);
    #else
      gl_FragColor = uLight > 0.5 ? lightOut(c * a) : vec4(c, a);
    #endif
  }
`;

const viz: VizDefinition = {
  id: 'spectrum-terrain',
  name: 'Spectrum Terrain',
  description:
    'Time becomes a third spatial axis: each spectrum snapshot is a ridge of a landscape that scrolls away from you, so melodies trace valleys and beats raise mountain ranges. Colour is each band’s frequency through the global mapping.',
  renderer: 'webgl',
  space: '3d',
  tags: ['3d', 'spectrum', 'history', 'landscape'],
  params: [
    { key: 'columns', label: 'Columns', type: 'number', min: 24, max: 192, step: 1, default: 96, group: 'Terrain', hint: 'How many points across the landscape, from bass on the left to treble on the right. More gives finer frequency detail and a denser mesh; beyond the analyser\'s band count it only smooths between bands.' },
    { key: 'rows', label: 'History rows', type: 'number', min: 24, max: 256, step: 1, default: 120, group: 'Terrain', hint: 'How many spectrum snapshots stretch back into the distance. With Scroll speed this sets how much past you see: rows ÷ speed seconds (120 ÷ 30 = 4 s).' },
    { key: 'scroll', label: 'Scroll speed', type: 'number', min: 2, max: 120, step: 1, default: 30, unit: 'rows/s', group: 'Terrain', hint: 'How many new ridges are added at the front each second. Fast spreads each beat into its own ridge; slow compresses more music into the view.' },
    { key: 'height', label: 'Height', type: 'number', min: 0, max: 8, step: 0.05, default: 2.6, group: 'Terrain', hint: 'How tall the mountains grow for a fully loud band. 0 flattens the landscape so only colour and brightness show the sound.' },
    { key: 'curve', label: 'Height curve', type: 'number', min: 0.4, max: 3, step: 0.05, default: 1.4, group: 'Terrain', hint: 'Shapes loudness into height. Above 1 flattens quiet bands so only the strong peaks rise as sharp mountains; below 1 lifts quiet detail into rolling hills.' },
    { key: 'width', label: 'Width', type: 'number', min: 2, max: 30, step: 0.1, default: 11, group: 'Terrain', hint: 'Side-to-side size of the landscape (the frequency axis), in scene units.' },
    { key: 'depth', label: 'Depth', type: 'number', min: 2, max: 40, step: 0.1, default: 16, group: 'Terrain', hint: 'Front-to-back length of the landscape (the time axis), in scene units. Longer stretches the same history out, spacing the ridges apart.' },
    { key: 'mirror', label: 'Mirror (lows in centre)', type: 'boolean', default: false, group: 'Terrain', hint: 'Mirrors the spectrum so bass runs down the middle and treble rises at both edges, turning the landscape into a symmetric canyon to fly through.' },
    { key: 'smoothing', label: 'Smoothing', type: 'number', min: 0, max: 0.95, step: 0.01, default: 0.35, group: 'Terrain', hint: 'Evens out the newest ridge over time. Peaks still rise quickly but fall slowly, so high values give smooth, rounded hills; 0 shows every jitter.' },
    {
      key: 'mode', label: 'Render mode', type: 'select', default: 'solid+wire', group: 'Look',
      options: [
        { value: 'solid', label: 'Solid', hint: 'A shaded surface, lit from above, with glowing edges where it turns away from you.' },
        { value: 'wire', label: 'Wireframe', hint: 'Only glowing lines; you can see through the hills to the ridges behind.' },
        { value: 'solid+wire', label: 'Solid + wire', hint: 'A slightly darker solid surface with a bright grid of lines on top.' },
        { value: 'ridges', label: 'Ridge lines (hidden-line)', hint: 'Lines only, but hills in front hide lines behind them: the classic Unknown Pleasures pulsar-plot look.' },
        { value: 'points', label: 'Points', hint: 'A cloud of glowing dots, one per point of the mesh, that grow with brightness.' },
      ],
      hint: 'How the landscape surface is drawn. Opacity and size settings below each apply only to some modes.',
    },
    {
      key: 'wireStyle', label: 'Wire style', type: 'select', default: 'grid', group: 'Look',
      options: [ { value: 'grid', label: 'Grid', hint: 'Lines both ways. In Ridge lines mode this behaves like Rows.' }, { value: 'rows', label: 'Rows (across)', hint: 'One line per moment in time, each a snapshot of the whole spectrum.' }, { value: 'columns', label: 'Columns (along time)', hint: 'One line per frequency, tracing how that band\'s loudness changes over time.' } ],
      hint: 'Which direction the lines run. Used by Wireframe, Solid + wire and Ridge lines.',
    },
    { key: 'lineOpacity', label: 'Line opacity', type: 'number', min: 0, max: 1, step: 0.01, default: 0.7, group: 'Look', hint: 'Strength of the lines in Wireframe, Solid + wire and Ridge lines modes. Lines add light, so overlapping ones glow brighter.' },
    { key: 'solidOpacity', label: 'Solid opacity', type: 'number', min: 0, max: 1, step: 0.01, default: 0.9, group: 'Look', hint: 'How see-through the shaded surface is in Solid and Solid + wire modes. Lower lets layers beneath show through.' },
    { key: 'pointSize', label: 'Point size', type: 'number', min: 0.5, max: 12, step: 0.1, default: 3, unit: 'px', group: 'Look', hint: 'Base size of each dot in Points mode. Dots shrink with distance and grow with their brightness.' },
    { key: 'fog', label: 'Fade start', type: 'number', min: 0, max: 1, step: 0.01, default: 0.45, group: 'Look', hint: 'Where the older part of the landscape starts fading out, as a fraction of its depth (like fog). 0 fades from the front; 1 keeps everything until the far edge.' },
    {
      key: 'colorBy', label: 'Colour by', type: 'select', default: 'frequency', group: 'Colour',
      options: [ { value: 'frequency', label: 'Frequency', hint: 'Each column takes its frequency\'s colour, so colour stripes run along the time axis.' }, { value: 'height', label: 'Height (palette)', hint: 'Colour follows loudness through the palette, like a contour map: valleys one colour, peaks another.' }, { value: 'age', label: 'Age (palette)', hint: 'Colour follows time through the palette, so new sound and old sound are tinted differently.' } ],
      hint: 'What decides each point\'s colour. Loudness always also sets brightness.',
    },
    { key: 'baseBrightness', label: 'Quiet brightness', type: 'number', min: 0, max: 1, step: 0.01, default: 0.22, group: 'Colour', hint: 'How bright the landscape is where the sound is silent; louder parts brighten toward full. 0 leaves silent ground dark so only the sound glows.' },
    { key: 'brightness', label: 'Brightness', type: 'number', min: 0.2, max: 3, step: 0.01, default: 1.1, group: 'Colour', hint: 'Overall brightness multiplier for the whole landscape, on top of the loudness-driven brightness. Turn down if the glow washes out.' },
    ...cameraParams({ speed: 0, distance: 13, elevation: 27, fov: 52 }),
    { key: 'camTargetZ', label: 'Look-at depth', type: 'number', min: -1, max: 1, step: 0.01, default: -0.1, group: 'Camera', hint: 'Moves the point the camera looks at and orbits along the time axis: −1 the far (oldest) edge, 1 the front where new sound arrives.' },
  ],
  presets: [
    { name: 'Solar wind', description: 'Solid hills with a glowing grid', params: {} },
    {
      name: 'Unknown pleasures', description: 'Hidden-line ridges, the classic pulsar-plot look',
      params: { mode: 'ridges', wireStyle: 'rows', columns: 128, rows: 72, scroll: 18, height: 2.2, curve: 1.8, lineOpacity: 0.95, camElevation: 34, camDistance: 12, fog: 0.6, baseBrightness: 0.35, brightness: 1.3, width: 9, depth: 13 },
    },
    {
      name: 'Neon canyon', description: 'Mirrored wireframe flyover, bass down the middle',
      params: { mode: 'wire', mirror: true, columns: 80, rows: 160, scroll: 45, height: 3.2, width: 14, depth: 26, camElevation: 9, camDistance: 9, camFov: 70, camTargetZ: -0.3, lineOpacity: 0.85, fog: 0.3, colorBy: 'frequency' },
      modulations: { camDistance: { source: 'bass', amount: -0.06, smooth: 0.6 } },
    },
    {
      name: 'Stardust dunes', description: 'Point cloud coloured by height, slow orbit',
      params: { mode: 'points', columns: 160, rows: 140, scroll: 24, pointSize: 2.2, brightness: 0.75, colorBy: 'height', camSpeed: 4, camElevation: 34, camDistance: 14, height: 3, curve: 1.8, fog: 0.5, baseBrightness: 0.15 },
    },
  ],

  create(canvas) {
    const renderer = createRenderer(canvas);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 200);
    const orbit = new AutoOrbit();
    const target = new THREE.Vector3();

    const uniforms = {
      uFront: { value: 0 }, uDepth: { value: 1 }, uOpacity: { value: 1 }, uFog: { value: 0.5 }, uBright: { value: 1 }, uPointSize: { value: 3 }, uPxScale: { value: 1 },
    };
    const mkMat = (define: string, extra: Partial<THREE.ShaderMaterialParameters> = {}) =>
      new THREE.ShaderMaterial({
        vertexShader: VERT, fragmentShader: FRAG, defines: { [define]: 1 }, transparent: true, depthWrite: false,
        uniforms: { ...uniforms, uOpacity: { value: 1 }, uBright: { value: 1 }, uLight: { value: 0 } }, ...extra,
      });
    // all three share uFront/uDepth/uFog/uPointSize/uPxScale objects; opacity + brightness per material
    const solidMat = mkMat('IS_SOLID', { depthWrite: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, side: THREE.DoubleSide });
    const lineMat = mkMat('IS_LINE', ADD_PREMUL);
    const pointMat = mkMat('IS_POINTS', ADD_PREMUL);
    pointMat.uniforms.uLight.value = 1;

    let C = 0;
    let R = 0;
    let hist = new Float32Array(0); // ring buffer R×C
    let head = 0;
    let cur = new Float32Array(0);
    let colFreq = new Float32Array(0);
    let colRgb = new Float32Array(0);
    let pos: THREE.BufferAttribute | null = null;
    let col: THREE.BufferAttribute | null = null;
    let meshGeo: THREE.BufferGeometry | null = null;
    let lineGeo: THREE.BufferGeometry | null = null;
    let pointGeo: THREE.BufferGeometry | null = null;
    let mesh: THREE.Mesh | null = null;
    let lines: THREE.LineSegments | null = null;
    let points: THREE.Points | null = null;
    let wireStyle = '';
    let acc = 0;
    let colorKey: ColorMapper | null = null;
    let mirrorKey = false;
    let bandsKey = 0;
    const lut = new Float32Array(64 * 3);

    const buildLineIndex = (style: string) => {
      const idx: number[] = [];
      for (let r = 0; r < R; r++)
        for (let j = 0; j < C; j++) {
          const i = r * C + j;
          if (style !== 'columns' && j < C - 1) idx.push(i, i + 1);
          if (style !== 'rows' && r < R - 1) idx.push(i, i + C);
        }
      lineGeo!.setIndex(idx);
      wireStyle = style;
    };

    const build = (c: number, r: number) => {
      for (const o of [mesh, lines, points]) if (o) scene.remove(o);
      meshGeo?.dispose(); lineGeo?.dispose(); pointGeo?.dispose();
      C = c; R = r;
      hist = new Float32Array(R * C);
      cur = new Float32Array(C);
      colFreq = new Float32Array(C);
      colRgb = new Float32Array(C * 3);
      head = 0;
      colorKey = null;
      pos = new THREE.BufferAttribute(new Float32Array(R * C * 3), 3).setUsage(THREE.DynamicDrawUsage);
      col = new THREE.BufferAttribute(new Float32Array(R * C * 3), 3).setUsage(THREE.DynamicDrawUsage);
      meshGeo = new THREE.BufferGeometry();
      meshGeo.setAttribute('position', pos);
      meshGeo.setAttribute('color', col);
      const tri: number[] = [];
      for (let y = 0; y < R - 1; y++)
        for (let x = 0; x < C - 1; x++) {
          const a = y * C + x;
          tri.push(a, a + 1, a + C, a + 1, a + C + 1, a + C);
        }
      meshGeo.setIndex(tri);
      lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute('position', pos);
      lineGeo.setAttribute('color', col);
      buildLineIndex(wireStyle || 'grid');
      pointGeo = new THREE.BufferGeometry();
      pointGeo.setAttribute('position', pos);
      pointGeo.setAttribute('color', col);
      for (const g of [meshGeo, lineGeo, pointGeo]) g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
      mesh = new THREE.Mesh(meshGeo, solidMat);
      lines = new THREE.LineSegments(lineGeo, lineMat);
      points = new THREE.Points(pointGeo, pointMat);
      mesh.renderOrder = 0; lines.renderOrder = 1; points.renderOrder = 2;
      for (const o of [mesh, lines, points]) { o.frustumCulled = false; scene.add(o); }
    };

    return {
      resize(w, h, dpr) {
        resizeRenderer(renderer, camera, w, h, dpr);
        uniforms.uPxScale.value = h * dpr * 0.12;
      },
      render({ params: p, audio, dt, color }) {
        const c = Math.round(num(p, 'columns', 96));
        const r = Math.round(num(p, 'rows', 120));
        if (c !== C || r !== R) build(c, r);
        const style = str(p, 'wireStyle', 'grid');
        const mode = str(p, 'mode', 'solid+wire');
        const ls = mode === 'ridges' && style === 'grid' ? 'rows' : style;
        if (ls !== wireStyle) buildLineIndex(ls);

        const bands = audio.bands;
        const nb = bands.length;
        const mirror = bool(p, 'mirror');
        // column → fractional band index
        const bandIdx = (j: number) => {
          const u = C > 1 ? j / (C - 1) : 0;
          return (mirror ? Math.abs(2 * u - 1) : u) * Math.max(0, nb - 1);
        };

        // colours per column (recomputed only when the mapping or layout changes)
        if (color !== colorKey || mirror !== mirrorKey || nb !== bandsKey || audio.bandFreqs[nb - 1] !== colFreq[C - 1]) {
          colorKey = color; mirrorKey = mirror; bandsKey = nb;
          for (let j = 0; j < C; j++) {
            const hz = nb ? sampleArray(audio.bandFreqs, bandIdx(j)) || 30 * Math.pow(500, bandIdx(j) / Math.max(1, nb - 1)) : 440;
            colFreq[j] = hz;
            const rgb = color.freq(hz, 1);
            colRgb[j * 3] = rgb[0]; colRgb[j * 3 + 1] = rgb[1]; colRgb[j * 3 + 2] = rgb[2];
          }
          for (let i = 0; i < 64; i++) {
            const rgb: RGB = color.norm(i / 63, 1);
            lut[i * 3] = rgb[0]; lut[i * 3 + 1] = rgb[1]; lut[i * 3 + 2] = rgb[2];
          }
        }

        // smoothed current row
        const sm = num(p, 'smoothing', 0.35);
        const k = 1 - Math.pow(sm, dt * 60);
        for (let j = 0; j < C; j++) {
          const v = nb ? sampleArray(bands, bandIdx(j)) : 0;
          cur[j] += (v - cur[j]) * (v > cur[j] ? Math.max(k, 0.5) : k);
        }
        acc += dt * num(p, 'scroll', 30);
        let pushes = 0;
        while (acc >= 1 && pushes < R) {
          acc -= 1; pushes++;
          head = (head + R - 1) % R;
          hist.set(cur, head * C);
        }
        if (acc >= 1) acc = 0;
        const frac = acc;

        const W = num(p, 'width', 11);
        const D = num(p, 'depth', 16);
        const H = num(p, 'height', 2.6);
        const curve = num(p, 'curve', 1.4);
        const front = D / 2;
        const dz = D / Math.max(1, R - 1);
        const base = num(p, 'baseBrightness', 0.22) * (mode === 'points' ? 0.3 : 1);
        const colorBy = str(p, 'colorBy', 'frequency');
        const pa = pos!.array as Float32Array;
        const ca = col!.array as Float32Array;
        for (let y = 0; y < R; y++) {
          const row = ((head + y) % R) * C;
          const z = front - (y + frac) * dz;
          const age = y / Math.max(1, R - 1);
          for (let x = 0; x < C; x++) {
            const i = y * C + x;
            const v = Math.min(1, Math.max(0, hist[row + x]));
            const hv = Math.pow(v, curve);
            pa[i * 3] = (x / Math.max(1, C - 1) - 0.5) * W;
            pa[i * 3 + 1] = hv * H;
            pa[i * 3 + 2] = z;
            const b = base + (1 - base) * Math.min(1, hv * 1.3 + v * 0.2);
            let cr: number, cg: number, cb: number;
            if (colorBy === 'height') {
              const li = Math.min(63, Math.round(Math.min(1, hv * 1.2) * 63)) * 3;
              cr = lut[li]; cg = lut[li + 1]; cb = lut[li + 2];
            } else if (colorBy === 'age') {
              const li = Math.round(age * 63) * 3;
              cr = lut[li]; cg = lut[li + 1]; cb = lut[li + 2];
            } else {
              cr = colRgb[x * 3]; cg = colRgb[x * 3 + 1]; cb = colRgb[x * 3 + 2];
            }
            ca[i * 3] = cr * b; ca[i * 3 + 1] = cg * b; ca[i * 3 + 2] = cb * b;
          }
        }
        pos!.needsUpdate = true;
        col!.needsUpdate = true;

        uniforms.uFront.value = front;
        uniforms.uDepth.value = D;
        uniforms.uFog.value = num(p, 'fog', 0.45);
        uniforms.uPointSize.value = num(p, 'pointSize', 3);
        const bright = num(p, 'brightness', 1.1);
        // shared uniform objects need syncing into each material's copy
        for (const m of [solidMat, lineMat, pointMat]) {
          m.uniforms.uFront.value = front;
          m.uniforms.uDepth.value = D;
          m.uniforms.uFog.value = uniforms.uFog.value;
          m.uniforms.uPointSize.value = uniforms.uPointSize.value;
          m.uniforms.uPxScale.value = uniforms.uPxScale.value;
          m.uniforms.uBright.value = bright;
        }
        const solidOp = num(p, 'solidOpacity', 0.9);
        const lineOp = num(p, 'lineOpacity', 0.7);
        mesh!.visible = mode === 'solid' || mode === 'solid+wire' || mode === 'ridges';
        solidMat.colorWrite = mode !== 'ridges';
        solidMat.uniforms.uOpacity.value = solidOp;
        solidMat.uniforms.uBright.value = mode === 'solid+wire' ? bright * 0.75 : bright;
        lines!.visible = mode === 'wire' || mode === 'solid+wire' || mode === 'ridges';
        lineMat.uniforms.uOpacity.value = lineOp;
        lineMat.uniforms.uBright.value = mode === 'solid+wire' ? bright * 1.4 : bright;
        // ridges: lines are depth-tested against the invisible solid, so normal blending reads crisper
        const ridge = mode === 'ridges';
        if ((lineMat.blending === THREE.NormalBlending) !== ridge) {
          lineMat.blending = ridge ? THREE.NormalBlending : THREE.CustomBlending;
          lineMat.needsUpdate = true;
        }
        lineMat.uniforms.uLight.value = ridge ? 0 : 1;
        points!.visible = mode === 'points';
        pointMat.uniforms.uOpacity.value = 1;

        target.set(0, H * 0.25, num(p, 'camTargetZ', -0.1) * D * 0.5);
        orbit.update(camera, p, dt, target);
        renderer.render(scene, camera);
      },
      dispose() {
        disposeAll(renderer, scene);
      },
    };
  },
};

export default viz;
