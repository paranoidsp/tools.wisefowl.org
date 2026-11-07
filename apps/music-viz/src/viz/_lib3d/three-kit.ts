/**
 * Shared helpers for the three.js visualizations (no index.ts here on
 * purpose, so the registry doesn't mistake this folder for a viz).
 *
 * Colour pipeline: every viz renders with `outputColorSpace = Linear`, so the
 * sRGB triples from the global ColorMapper pass straight through to the
 * canvas unchanged (what you pick in the Mapping panel is what you see).
 *
 * Compositing: the canvas uses premultipliedAlpha: true (the WebGL default).
 * three's NormalBlending writes rgb·a / a into a transparent buffer — already
 * premultiplied — so the 2D stage composites it without dark fringes.
 * Additive glows write rgb > alpha, which source-over treats as light added
 * on top: exactly the "glow" look we want over other layers.
 *
 * preserveDrawingBuffer is false: the compositor drawImage()s the canvas in
 * the same task right after render(), which is valid without it (tested;
 * same speed, one less buffer copy).
 */
import * as THREE from 'three';
import type { ColorMapper, ParamSpec, ParamValues, RGB } from '../../core/types';

export function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  return renderer;
}

/** Dispose every geometry, material and texture reachable from `root`. */
export function disposeObject(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of mats) disposeMaterial(mat);
  });
}

export function disposeMaterial(mat: THREE.Material) {
  for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
  const u = (mat as THREE.ShaderMaterial).uniforms;
  if (u) for (const k in u) if (u[k].value instanceof THREE.Texture) u[k].value.dispose();
  mat.dispose();
}

export function disposeAll(renderer: THREE.WebGLRenderer, ...roots: THREE.Object3D[]) {
  for (const r of roots) disposeObject(r);
  renderer.renderLists.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
}

export function resizeRenderer(renderer: THREE.WebGLRenderer, cam: THREE.PerspectiveCamera | null, w: number, h: number, dpr: number) {
  renderer.setPixelRatio(dpr);
  renderer.setSize(Math.max(1, w), Math.max(1, h), false);
  if (cam) {
    cam.aspect = Math.max(1, w) / Math.max(1, h);
    cam.updateProjectionMatrix();
  }
}

// ──────────────────────────────────────────────────────────── params ──

export const num = (p: ParamValues, k: string, d = 0) => (typeof p[k] === 'number' ? (p[k] as number) : d);
export const str = (p: ParamValues, k: string, d = '') => (typeof p[k] === 'string' ? (p[k] as string) : d);
export const bool = (p: ParamValues, k: string, d = false) => (typeof p[k] === 'boolean' ? (p[k] as boolean) : d);

export interface CameraDefaults {
  speed: number;
  distance: number;
  elevation: number;
  fov: number;
  maxDistance?: number;
}

/** Standard auto-orbit camera controls (group "Camera"). */
export function cameraParams(d: CameraDefaults): ParamSpec[] {
  return [
    { key: 'camSpeed', label: 'Orbit speed', type: 'number', min: -60, max: 60, step: 0.5, default: d.speed, unit: '°/s', group: 'Camera', hint: 'How fast the camera circles the scene, in degrees per second. Negative orbits the other way; 0 holds still so you can set the view with Azimuth offset.' },
    { key: 'camAngle', label: 'Azimuth offset', type: 'number', min: -180, max: 180, step: 1, default: 0, unit: '°', group: 'Camera', hint: 'Turns the camera to a different side of the scene, added on top of the auto-orbit. With Orbit speed at 0 this picks a fixed viewing side.' },
    { key: 'camDistance', label: 'Distance', type: 'number', min: 1, max: d.maxDistance ?? 40, step: 0.1, default: d.distance, group: 'Camera', hint: 'How far the camera sits from the centre, in scene units. Try binding this to Bass (⦿) with a small negative amount so the view pushes in on every kick.' },
    { key: 'camElevation', label: 'Elevation', type: 'number', min: -89, max: 89, step: 1, default: d.elevation, unit: '°', group: 'Camera', hint: 'Camera height as an angle above (positive) or below (negative) the horizon. Near 90° you look straight down on the scene, like a map.' },
    { key: 'camFov', label: 'Field of view', type: 'number', min: 15, max: 110, step: 1, default: d.fov, unit: '°', group: 'Camera', hint: 'Field of view: how wide the lens is. Low values act like a telephoto (flat, little depth); high values are wide-angle, with near things looming and strong perspective.' },
    { key: 'camSway', label: 'Sway', type: 'number', min: 0, max: 1, step: 0.01, default: 0.15, group: 'Camera', hint: 'Adds a slow, gentle drift to the camera angle and height (independent of the music), so even a still camera feels hand-held and alive. 0 = locked.' },
  ];
}

/** Integrates azimuth with dt so changing speed never makes the camera jump. */
export class AutoOrbit {
  azimuth = 0;
  private t = 0;
  update(cam: THREE.PerspectiveCamera, p: ParamValues, dt: number, target?: THREE.Vector3, yOffset = 0) {
    this.t += dt;
    this.azimuth += ((num(p, 'camSpeed') * Math.PI) / 180) * dt;
    const sway = num(p, 'camSway');
    const az = this.azimuth + (num(p, 'camAngle') * Math.PI) / 180 + sway * 0.25 * Math.sin(this.t * 0.21);
    const el = THREE.MathUtils.clamp(((num(p, 'camElevation') + sway * 8 * Math.sin(this.t * 0.33 + 1)) * Math.PI) / 180, -1.55, 1.55);
    const d = num(p, 'camDistance', 10);
    const tx = target?.x ?? 0;
    const ty = (target?.y ?? 0) + yOffset;
    const tz = target?.z ?? 0;
    cam.position.set(tx + d * Math.cos(el) * Math.sin(az), ty + d * Math.sin(el), tz + d * Math.cos(el) * Math.cos(az));
    cam.lookAt(tx, ty, tz);
    const fov = num(p, 'camFov', 50);
    if (cam.fov !== fov) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }
}

// ──────────────────────────────────────────────────────────── colour ──

export function setColor(c: THREE.Color, rgb: RGB, scale = 1): THREE.Color {
  return c.setRGB(rgb[0] * scale, rgb[1] * scale, rgb[2] * scale, THREE.LinearSRGBColorSpace);
}

/**
 * 1D RGBA texture filled from a colour function; rebuilt only when the
 * ColorMapper identity (i.e. the global mapping) or the size changes.
 */
export class PaletteTexture {
  texture: THREE.DataTexture;
  private data: Uint8Array;
  private key: unknown = null;
  private keyB: unknown = null;
  constructor(public size = 256) {
    this.data = new Uint8Array(size * 4);
    this.texture = new THREE.DataTexture(this.data, size, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.needsUpdate = true;
  }
  /** returns true if rebuilt */
  update(key: ColorMapper, fn: (i: number, n: number) => RGB, keyB: unknown = null, size = this.size): boolean {
    if (key === this.key && keyB === this.keyB && size === this.size) return false;
    this.key = key;
    this.keyB = keyB;
    if (size !== this.size) {
      this.size = size;
      this.data = new Uint8Array(size * 4);
      this.texture.dispose();
      this.texture.image = { data: this.data, width: size, height: 1 } as unknown as THREE.DataTexture['image'];
    }
    for (let i = 0; i < size; i++) {
      const c = fn(i, size);
      this.data[i * 4] = clamp255(c[0]);
      this.data[i * 4 + 1] = clamp255(c[1]);
      this.data[i * 4 + 2] = clamp255(c[2]);
      this.data[i * 4 + 3] = 255;
    }
    this.texture.needsUpdate = true;
    return true;
  }
  dispose() {
    this.texture.dispose();
  }
}

const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));

/** Soft radial sprite (gaussian core + halo), white in RGB, falloff in alpha. */
export function glowTexture(size = 64): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const r = Math.sqrt(dx * dx + dy * dy) * 2;
      const a = Math.max(0, Math.exp(-r * r * 9) * 0.85 + Math.exp(-r * r * 2.2) * 0.25 - 0.02 * r) * (r < 1 ? 1 : 0);
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = clamp255(Math.min(1, a));
    }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

// ───────────────────────────────────────────────────────────── audio ──

/** Linear interpolation into a Float32Array at fractional index. */
export function sampleArray(a: Float32Array, x: number): number {
  const n = a.length;
  if (!n) return 0;
  if (x <= 0) return a[0];
  if (x >= n - 1) return a[n - 1];
  const i = Math.floor(x);
  const f = x - i;
  return a[i] * (1 - f) + a[i + 1] * f;
}

/** Energy of the FFT spectrum at `hz` (max over ±halfWidth semitones). */
export function spectrumAt(spectrum: Float32Array, sampleRate: number, fftSize: number, hz: number, halfWidthSemis = 0.5): number {
  const binHz = sampleRate / fftSize;
  const r = Math.pow(2, halfWidthSemis / 12);
  const lo = Math.max(0, Math.floor(hz / r / binHz));
  const hi = Math.min(spectrum.length - 1, Math.ceil((hz * r) / binHz));
  if (hi < lo) return 0;
  let m = 0;
  for (let i = lo; i <= hi; i++) if (spectrum[i] > m) m = spectrum[i];
  return m;
}

/** One-pole attack/release follower; attack/release in seconds. */
export function follow(prev: number, target: number, dt: number, attack: number, release: number): number {
  const tau = target > prev ? attack : release;
  if (tau <= 0) return target;
  return prev + (target - prev) * (1 - Math.exp(-dt / tau));
}

// ────────────────────────────────────────────────────── blending ──

/**
 * "Light" blending in premultiplied space: shaders output
 * `vec4(rgb, max(rgb))` (see GLSL_PREMUL_ADD) and both colour and alpha add.
 * Unlike three's AdditiveBlending (alpha = a·a), dim glows never become
 * opaque dark smudges once the layer is composited over the stage.
 */
export const ADD_PREMUL: THREE.ShaderMaterialParameters = {
  transparent: true,
  depthWrite: false,
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneFactor,
  blendSrcAlpha: THREE.OneFactor,
  blendDstAlpha: THREE.OneFactor,
};

export const GLSL_PREMUL_ADD = /* glsl */ `
  vec4 lightOut(vec3 c) { c = max(c, vec3(0.0)); return vec4(c, min(1.0, max(c.r, max(c.g, c.b)))); }
`;

const LINE_VERT = /* glsl */ `
  attribute vec3 color;
  varying vec3 vC;
  void main() { vC = color; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const LINE_FRAG = GLSL_PREMUL_ADD + /* glsl */ `
  uniform float uGain;
  varying vec3 vC;
  void main() { gl_FragColor = lightOut(vC * uGain); }
`;

/** Vertex-coloured lines/points that add light (colour = brightness). */
export function lightLineMaterial(gain = 1): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({ vertexShader: LINE_VERT, fragmentShader: LINE_FRAG, uniforms: { uGain: { value: gain } }, ...ADD_PREMUL });
}

const GLOW_VERT = /* glsl */ `
  attribute float size;
  attribute vec3 color;
  uniform float uPxScale;
  varying vec3 vC;
  void main() {
    vC = color;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(size * uPxScale / max(0.05, -mv.z), 0.0, 1024.0);
    gl_Position = projectionMatrix * mv;
  }
`;
const GLOW_FRAG = GLSL_PREMUL_ADD + /* glsl */ `
  uniform float uSharp;
  varying vec3 vC;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(p, p);
    if (r2 > 1.0) discard;
    float a = exp(-r2 * uSharp) * (1.0 - r2);
    gl_FragColor = lightOut(vC * a);
  }
`;

/**
 * Soft glowing sprites sized in world units. Attributes: position, color
 * (brightness baked in), size. Set `uniforms.uPxScale` each frame with
 * pxScaleFor(camera, pixelHeight).
 */
export function glowPointsMaterial(sharp = 3.5): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({ vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG, uniforms: { uPxScale: { value: 1 }, uSharp: { value: sharp } }, ...ADD_PREMUL });
}

export function pxScaleFor(cam: THREE.PerspectiveCamera, pixelHeight: number): number {
  return pixelHeight / (2 * Math.tan((cam.fov * Math.PI) / 360));
}

export function dynAttr(n: number, itemSize: number): THREE.BufferAttribute {
  return new THREE.BufferAttribute(new Float32Array(n * itemSize), itemSize).setUsage(THREE.DynamicDrawUsage);
}
