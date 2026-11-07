/**
 * Random visualizations, for exploring.
 *
 * Uniformly random settings mostly look broken, so randomness here starts
 * from a visualization's presets (which are known to look good) and varies
 * the settings *around* them. "Wildness" is how far from the preset it
 * strays. Every roll is seeded, so the same seed always rebuilds the same
 * scene: the seed is part of its name, so a lucky roll can be found again.
 */
import { COLOR_MODES, GRADIENT_PRESETS } from '../color';
import { DEFAULT_COLOR, defaultParams } from './defaults';
import { VIZ_LIST } from './registry';
import type { BlendMode, ColorMode, Layer, ModSource, Modulation, ParamSpec, ParamValues, Scene, SceneLayer, VizDefinition } from './types';

/** Small, fast, seedable PRNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo: number, hi: number) => lo + (hi - lo) * next(),
    chance: (p: number) => next() < p,
    pick: <T,>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)],
    weighted: <T,>(items: readonly [T, number][]): T => {
      const total = items.reduce((s, [, w]) => s + w, 0);
      let r = next() * total;
      for (const [v, w] of items) if ((r -= w) <= 0) return v;
      return items[items.length - 1][0];
    },
    /** roughly normal, mean 0, sd 1 */
    gauss: () => {
      let s = 0;
      for (let i = 0; i < 4; i++) s += next();
      return (s - 2) * 1.732;
    },
  };
}
type Rng = ReturnType<typeof rng>;

export const newSeed = () => (Math.random() * 0xffffffff) >>> 0;
export const seedTag = (seed: number) => seed.toString(36).slice(-5).padStart(5, '0');

/** Params whose cost scales with their value; never push these above their base. */
const COSTLY = /count|particles|resolution|quality|history|rows|segments|detail/i;
/** Modulation sources that read well when a random knob is bound to the music. */
const MUSICAL: ModSource[] = ['bass', 'beatPulse', 'loudness', 'mid', 'treble', 'centroidNorm', 'flux'];

/**
 * Vary a set of params around `base`.
 * wildness 0 = unchanged, ~0.15 = tasteful variation, 1 = anything goes.
 */
export function varyParams(specs: ParamSpec[], base: ParamValues, wildness: number, r: Rng): ParamValues {
  const out: ParamValues = { ...base };
  for (const s of specs) {
    const v = base[s.key];
    switch (s.type) {
      case 'number': {
        const b = typeof v === 'number' ? v : s.default;
        const span = s.max - s.min;
        let x: number;
        if (s.curve === 'log' && s.min > 0) {
          const lb = Math.log(b), lmin = Math.log(s.min), lmax = Math.log(s.max);
          x = Math.exp(Math.min(lmax, Math.max(lmin, lb + r.gauss() * wildness * (lmax - lmin) * 0.6)));
        } else x = b + r.gauss() * wildness * span * 0.6;
        if (COSTLY.test(s.key)) x = Math.min(x, b);
        x = Math.min(s.max, Math.max(s.min, x));
        if (s.step) x = Math.round(x / s.step) * s.step;
        out[s.key] = Number(x.toFixed(6));
        break;
      }
      case 'select':
        if (r.chance(wildness * 0.6)) out[s.key] = r.pick(s.options).value;
        break;
      case 'boolean':
        if (r.chance(wildness * 0.35)) out[s.key] = !(v ?? s.default);
        break;
      case 'color':
        if (r.chance(wildness * 0.5)) out[s.key] = hslHex(r.range(0, 360), r.range(0.55, 0.95), r.range(0.5, 0.7));
        break;
      case 'gradient':
        if (r.chance(wildness * 0.5)) out[s.key] = structuredClone(r.pick(GRADIENT_PRESETS).stops);
        break;
    }
  }
  return out;
}

/** Bind 0–2 random numeric params to musical features. */
function randomMods(def: VizDefinition, r: Rng, wildness: number): Record<string, Modulation> {
  const nums = def.params.filter((p) => p.type === 'number' && !COSTLY.test(p.key));
  const mods: Record<string, Modulation> = {};
  const n = r.weighted<number>([[0, 1 - wildness * 0.5], [1, 0.6], [2, wildness]]);
  for (let i = 0; i < n && nums.length; i++) {
    const p = r.pick(nums);
    mods[p.key] = {
      source: r.pick(MUSICAL),
      amount: Number(((r.chance(0.8) ? 1 : -1) * r.range(0.08, 0.15 + 0.3 * wildness)).toFixed(3)),
      smooth: Number(r.range(0.2, 0.7).toFixed(2)),
    };
  }
  return mods;
}

function hslHex(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function layerFrom(def: VizDefinition, r: Rng, wildness: number, index: number): SceneLayer {
  const presetIdx = def.presets?.length ? Math.floor(r.next() * def.presets.length) : -1;
  const preset = presetIdx >= 0 ? def.presets![presetIdx] : undefined;
  const base = { ...defaultParams(def.params), ...(preset?.params ?? {}) };
  const blend: BlendMode =
    index === 0 ? 'source-over' : r.weighted<BlendMode>([['screen', 4], ['lighter', 4], ['source-over', 2], ['difference', wildness], ['overlay', wildness]]);
  return {
    vizId: def.id,
    name: preset ? `${def.name} · ${preset.name}` : def.name,
    params: varyParams(def.params, base, wildness, r),
    modulations: { ...(preset?.modulations ?? {}), ...randomMods(def, r, wildness) },
    blend,
    opacity: index === 0 ? 1 : Number(r.range(0.55, 1).toFixed(2)),
    feedback: def.renderer === 'canvas2d' && r.chance(0.25 + wildness * 0.2) ? Number(r.range(0.4, 0.8).toFixed(2)) : 0,
  };
}

/** A whole random scene: 1–3 layers, a colour mapping and post settings. */
export function randomScene(seed = newSeed(), wildness = 0.18): Scene {
  const r = rng(seed);
  const count = r.weighted<number>([[1, 0.4], [2, 0.45], [3, 0.15]]);
  const picked: VizDefinition[] = [];
  let threeD = 0;
  while (picked.length < count) {
    const def = r.pick(VIZ_LIST);
    if (picked.includes(def)) continue;
    // keep it light: at most one 3D layer most of the time
    if (def.space === '3d' && threeD >= (wildness > 0.5 ? 2 : 1)) continue;
    if (def.space === '3d') threeD++;
    picked.push(def);
  }
  // full-screen backgrounds read best at the bottom of the stack
  picked.sort((a, b) => Number(b.id === 'spectral-tunnel') - Number(a.id === 'spectral-tunnel'));
  const layers = picked.map((d, i) => layerFrom(d, r, wildness, i));

  const mode = r.weighted<ColorMode>(COLOR_MODES.map((m) => [m, m === 'gradient' || m === 'light-octave' ? 2 : 1]));
  const color = {
    mode,
    hueOffset: Math.round(r.range(-180, 180) * (mode === 'light-octave' ? 0.3 : 1)),
    saturation: Number(r.range(0.7, 1).toFixed(2)),
    lightness: Number(r.range(0.5, 0.6).toFixed(2)),
    gradient: structuredClone(r.pick(GRADIENT_PRESETS).stops),
    hueStart: Math.round(r.range(0, 360)),
    hueEnd: Math.round(r.range(0, 360)),
    gamma: DEFAULT_COLOR.gamma,
  };
  const post = {
    glow: Number(r.range(0.1, 0.5).toFixed(2)),
    trails: r.chance(0.3) ? Number(r.range(0.2, 0.6).toFixed(2)) : 0,
    vignette: Number(r.range(0.15, 0.5).toFixed(2)),
    grain: r.chance(0.2) ? Number(r.range(0.05, 0.25).toFixed(2)) : 0,
    background: hslHex(r.range(200, 280), r.range(0.2, 0.5), r.range(0.02, 0.05)),
  };
  const names = picked.map((d) => d.name).join(' + ');
  return {
    id: `random-${seedTag(seed)}`,
    name: `Random ${seedTag(seed)} · ${names}`,
    description: `Seed ${seed}. Built from presets of ${names}, with settings varied around them.`,
    tags: ['random'],
    layers,
    color,
    post,
  };
}

/** New values for one existing layer: varied around its current settings. */
export function shuffleLayer(layer: Layer, def: VizDefinition, seed = newSeed(), wildness = 0.22): Pick<Layer, 'params' | 'modulations'> {
  const r = rng(seed);
  return {
    params: varyParams(def.params, layer.params, wildness, r),
    modulations: r.chance(0.5) ? { ...layer.modulations, ...randomMods(def, r, wildness) } : layer.modulations,
  };
}
