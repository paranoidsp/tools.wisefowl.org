import type {
  AnalysisSettings,
  ColorSettings,
  Layer,
  LayerTransform,
  ParamSpec,
  ParamValues,
  PostSettings,
  SceneLayer,
  VizDefinition,
} from './types';

export const DEFAULT_COLOR: ColorSettings = {
  mode: 'light-octave',
  hueOffset: 0,
  hueStart: 260,
  hueEnd: 0,
  saturation: 0.9,
  lightness: 0.55,
  intensityToBrightness: 0.6,
  gamma: 1,
  gradient: [
    { pos: 0, color: '#1b0b3a' },
    { pos: 0.35, color: '#6a2bd9' },
    { pos: 0.65, color: '#ff4f8b' },
    { pos: 1, color: '#ffd36e' },
  ],
  a4: 440,
};

export const DEFAULT_ANALYSIS: AnalysisSettings = {
  fftSize: 4096,
  smoothing: 0.6,
  minDb: -95,
  maxDb: -20,
  gain: 1,
  bandCount: 64,
  freqScale: 'log',
  minFreq: 30,
  maxFreq: 16000,
  beatSensitivity: 0.55,
  beatDecay: 0.35,
  featureSmoothing: 0.5,
};

export const DEFAULT_POST: PostSettings = {
  background: '#07080b',
  trails: 0,
  glow: 0.25,
  glowRadius: 14,
  vignette: 0.35,
  grain: 0,
  renderScale: 1,
  aspect: 'fill',
};

export const DEFAULT_TRANSFORM: LayerTransform = { x: 0, y: 0, scale: 1, rotation: 0 };

export function defaultParams(specs: ParamSpec[]): ParamValues {
  const out: ParamValues = {};
  for (const s of specs) out[s.key] = structuredClone(s.default);
  return out;
}

let counter = 0;
export function uid(prefix = 'l'): string {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Build a full Layer for a viz, applying an optional preset / scene overrides. */
export function makeLayer(def: VizDefinition, over: Partial<SceneLayer> = {}, presetIndex?: number): Layer {
  const preset = presetIndex != null ? def.presets?.[presetIndex] : undefined;
  return {
    id: uid(),
    vizId: def.id,
    name: over.name ?? preset?.name ?? def.name,
    visible: over.visible ?? true,
    opacity: over.opacity ?? 1,
    blend: over.blend ?? 'source-over',
    params: { ...defaultParams(def.params), ...(preset?.params ?? {}), ...(over.params ?? {}) },
    modulations: { ...(preset?.modulations ?? {}), ...(over.modulations ?? {}) },
    transform: { ...DEFAULT_TRANSFORM, ...(over.transform ?? {}) },
    feedback: over.feedback ?? 0,
  };
}
