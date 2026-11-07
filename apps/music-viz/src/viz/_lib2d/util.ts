/**
 * Shared helpers for the canvas2d visualizations.
 * (No index.ts here on purpose: the registry only discovers `viz/<id>/index.ts`.)
 */
import type { ColorMapper, ParamSpec, ParamValues, RGB, RenderContext } from '../../core/types';

export const TAU = Math.PI * 2;

// ───────────────────────────────────────────────────────────── params ──

export const num = (p: ParamValues, k: string, d = 0): number => (typeof p[k] === 'number' ? (p[k] as number) : d);
export const str = (p: ParamValues, k: string, d = ''): string => (typeof p[k] === 'string' ? (p[k] as string) : d);
export const bool = (p: ParamValues, k: string, d = false): boolean => (typeof p[k] === 'boolean' ? (p[k] as boolean) : d);

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** frame-rate independent exponential smoothing factor for a 0..0.99 "smoothing" knob */
export function smoothK(smoothing: number, dt: number): number {
  const s = clamp(smoothing, 0, 0.995);
  return 1 - Math.pow(s, dt * 60);
}

// ────────────────────────────────────────────────────────────── pitch ──

export const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
/** position of each pitch class around the circle of fifths (C=0, G=1, D=2 …) */
export const FIFTHS_POS = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];

/** fractional MIDI note number */
export function midiOf(hz: number, a4 = 440): number {
  return 69 + 12 * Math.log2(Math.max(hz, 1e-3) / a4);
}
/** fractional pitch class 0..12 (C = 0) */
export function pitchClassOf(hz: number, a4 = 440): number {
  const m = midiOf(hz, a4);
  return ((m % 12) + 12) % 12;
}
/** 0..1 position of hz on a log axis between lo and hi */
export function logNorm(hz: number, lo: number, hi: number): number {
  return clamp(Math.log(Math.max(hz, 1e-3) / lo) / Math.log(hi / lo), 0, 1);
}
export function logFreq(t: number, lo: number, hi: number): number {
  return lo * Math.pow(hi / lo, t);
}

// ───────────────────────────────────────────────────────────── colour ──

const hexCache = new Map<string, RGB>();
export function hexToRgb(hex: string): RGB {
  let c = hexCache.get(hex);
  if (c) return c;
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  const n = parseInt(h.slice(0, 6), 16) || 0;
  c = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  hexCache.set(hex, c);
  return c;
}

const c255 = (v: number) => (v <= 0 ? 0 : v >= 1 ? 255 : (v * 255 + 0.5) | 0);

/** rgba() string, with optional mix toward white (0..1) */
export function rgba(c: RGB, a = 1, white = 0): string {
  if (white > 0) {
    const w = Math.min(1, white);
    return `rgba(${c255(c[0] + (1 - c[0]) * w)},${c255(c[1] + (1 - c[1]) * w)},${c255(c[2] + (1 - c[2]) * w)},${a < 0 ? 0 : a > 1 ? 1 : a})`;
  }
  return `rgba(${c255(c[0])},${c255(c[1])},${c255(c[2])},${a < 0 ? 0 : a > 1 ? 1 : a})`;
}

/** scale brightness, keeping hue */
export function scaleRgb(c: RGB, k: number, out: RGB = [0, 0, 0]): RGB {
  out[0] = c[0] * k;
  out[1] = c[1] * k;
  out[2] = c[2] * k;
  return out;
}

/** Make sure a mapped colour is never pitch black (dark mapping settings). */
export function lift(c: RGB, minLum = 0.12): RGB {
  const l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  if (l >= minLum) return c;
  const k = l > 1e-4 ? minLum / l : 0;
  if (k === 0) return [minLum, minLum, minLum];
  return [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];
}

/** Common "Palette" select — lets a layer escape the global mapping if the user wants. */
export type PaletteMode = 'mapping' | 'pitch' | 'position' | 'level' | 'mono';

export function paletteParams(group = 'Colour', def: PaletteMode = 'mapping', extra: PaletteMode[] = ['mapping', 'position', 'level', 'mono']): ParamSpec[] {
  const labels: Record<PaletteMode, string> = {
    mapping: 'Mapping (by frequency)',
    pitch: 'Mapping (by pitch class)',
    position: 'Palette sweep (by position)',
    level: 'Palette by level',
    mono: 'Mono (single colour)',
  };
  return [
    {
      key: 'palette', label: 'Palette', type: 'select', default: def, group,
      hint: 'Where colours come from. "Mapping" uses the global colour mapping of each element’s frequency.',
      options: extra.map((v) => ({ value: v, label: labels[v] })),
    },
    { key: 'monoColor', label: 'Mono colour', type: 'color', default: '#9fd8ff', group, hint: 'Used when Palette = Mono' },
  ];
}

/**
 * Resolve a colour for one element.
 *  hz:  element frequency (for mapping)
 *  pos: element position 0..1 (for sweep)
 *  lvl: element level 0..1 (for level + intensity)
 */
export function pickColor(color: ColorMapper, mode: string, mono: string, hz: number, pos: number, lvl: number): RGB {
  switch (mode) {
    case 'pitch':
      return color.pitchClass(pitchClassOf(hz, color.settings.a4), lvl);
    case 'position':
      return color.norm(pos, lvl);
    case 'level':
      return color.norm(lvl, lvl);
    case 'mono': {
      const m = hexToRgb(mono);
      const k = 0.35 + 0.65 * lvl;
      return [m[0] * k, m[1] * k, m[2] * k];
    }
    default:
      return color.freq(hz, lvl);
  }
}

// ───────────────────────────────────────────────────────────── arrays ──

/** attack/release follower: rises fast, falls slower */
export function follow(dst: Float32Array, src: ArrayLike<number>, attack: number, release: number) {
  const n = Math.min(dst.length, src.length);
  for (let i = 0; i < n; i++) {
    const v = src[i];
    const d = dst[i];
    dst[i] = d + (v - d) * (v > d ? attack : release);
  }
}

export function ensureLen(arr: Float32Array, n: number): Float32Array {
  return arr.length === n ? arr : new Float32Array(n);
}

/** sample a Float32Array at fractional index with linear interpolation */
export function sampleLinear(a: ArrayLike<number>, x: number): number {
  const n = a.length;
  if (n === 0) return 0;
  if (x <= 0) return a[0];
  if (x >= n - 1) return a[n - 1];
  const i = x | 0;
  const f = x - i;
  return a[i] * (1 - f) + a[i + 1] * f;
}

/** Catmull-Rom style closed smooth path through points (quadratic midpoints, cheap). */
export function smoothClosedPath(ctx: CanvasRenderingContext2D | Path2D, xs: Float32Array, ys: Float32Array, n: number) {
  if (n < 3) return;
  let mx = (xs[n - 1] + xs[0]) / 2;
  let my = (ys[n - 1] + ys[0]) / 2;
  ctx.moveTo(mx, my);
  for (let i = 0; i < n; i++) {
    const j = i + 1 === n ? 0 : i + 1;
    mx = (xs[i] + xs[j]) / 2;
    my = (ys[i] + ys[j]) / 2;
    ctx.quadraticCurveTo(xs[i], ys[i], mx, my);
  }
  ctx.closePath();
}

export function smoothOpenPath(ctx: CanvasRenderingContext2D | Path2D, xs: Float32Array, ys: Float32Array, n: number) {
  if (n < 2) return;
  ctx.moveTo(xs[0], ys[0]);
  for (let i = 1; i < n - 1; i++) {
    ctx.quadraticCurveTo(xs[i], ys[i], (xs[i] + xs[i + 1]) / 2, (ys[i] + ys[i + 1]) / 2);
  }
  ctx.lineTo(xs[n - 1], ys[n - 1]);
}

// ─────────────────────────────────────────────────────────────── glow ──

/** soft radial glow dot (one gradient; use sparingly) */
export function glowDot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, c: RGB, a: number, core = 0.25) {
  if (r <= 0.5 || a <= 0.003) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(c, a, core));
  g.addColorStop(0.25, rgba(c, a * 0.6));
  g.addColorStop(1, rgba(c, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/**
 * A white soft-dot sprite, tinted per colour on demand and cached. Drawing a
 * sprite with drawImage is far cheaper than a gradient per particle.
 */
export class GlowSprites {
  private cache = new Map<number, HTMLCanvasElement>();
  constructor(private size = 64, private levels = 24) {}
  private key(c: RGB) {
    const q = this.levels - 1;
    return (Math.round(c[0] * q) * this.levels + Math.round(c[1] * q)) * this.levels + Math.round(c[2] * q);
  }
  get(c: RGB): HTMLCanvasElement {
    const k = this.key(c);
    let s = this.cache.get(k);
    if (s) return s;
    if (this.cache.size > 2048) this.cache.clear();
    const q = this.levels - 1;
    const r = Math.round(c[0] * q) / q;
    const g = Math.round(c[1] * q) / q;
    const b = Math.round(c[2] * q) / q;
    s = document.createElement('canvas');
    s.width = s.height = this.size;
    const x = s.getContext('2d')!;
    const h = this.size / 2;
    const grad = x.createRadialGradient(h, h, 0, h, h, h);
    const rgb: RGB = [r, g, b];
    grad.addColorStop(0, rgba(rgb, 1, 0.55));
    grad.addColorStop(0.18, rgba(rgb, 0.85, 0.1));
    grad.addColorStop(0.45, rgba(rgb, 0.3));
    grad.addColorStop(1, rgba(rgb, 0));
    x.fillStyle = grad;
    x.fillRect(0, 0, this.size, this.size);
    this.cache.set(k, s);
    return s;
  }
}

/** Fallbacks for features the engine might not deliver yet (silent / stub). */
export function dominantFreq(rc: RenderContext): number {
  const a = rc.audio;
  if (a.pitch && a.pitch.freq > 0) return a.pitch.freq;
  if (a.peaks && a.peaks.length) return a.peaks[0].freq;
  if (a.centroid > 0) return a.centroid;
  return 220;
}

export function minDim(rc: { width: number; height: number }) {
  return Math.min(rc.width, rc.height);
}

/**
 * A polyline split into short Path2D chunks. Long self-intersecting strokes
 * (scopes, Lissajous figures) can push the GPU path renderer onto a slow
 * path; short chunks stay fast. Overlaps between chunks add up under
 * 'lighter', which reads like phosphor.
 */
export class ChunkPath {
  chunks: Path2D[] = [];
  private cur: Path2D | null = null;
  private n = 0;
  private lx = 0;
  private ly = 0;
  private sx = 0;
  private sy = 0;
  constructor(private size = 128) {}
  moveTo(x: number, y: number) {
    this.cur = new Path2D();
    this.chunks.push(this.cur);
    this.cur.moveTo(x, y);
    this.n = 0;
    this.lx = this.sx = x;
    this.ly = this.sy = y;
  }
  lineTo(x: number, y: number) {
    if (!this.cur) return this.moveTo(x, y);
    if (this.n >= this.size) {
      const sx = this.sx, sy = this.sy;
      this.moveTo(this.lx, this.ly);
      this.sx = sx;
      this.sy = sy;
    }
    this.cur!.lineTo(x, y);
    this.n++;
    this.lx = x;
    this.ly = y;
  }
  closePath() {
    this.lineTo(this.sx, this.sy);
  }
  stroke(ctx: CanvasRenderingContext2D) {
    for (const c of this.chunks) ctx.stroke(c);
  }
}

/**
 * Peak / partial amplitudes from the engine are on a dB-like 0..1 scale, so
 * the audible ones bunch up near 1. Re-spread them relative to the loudest
 * one this frame: amax → 1, amax − span → 0.
 */
export function expandAmp(a: number, amax: number, span = 0.4): number {
  return clamp(1 - (amax - a) / span, 0.04, 1);
}
export function maxAmp(list: { amp: number }[]): number {
  let m = 0;
  for (let i = 0; i < list.length; i++) if (list[i].amp > m) m = list[i].amp;
  return m;
}
