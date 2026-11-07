/**
 * Core contracts for Music Viz Studio.
 *
 * Everything else in the app (audio engine, colour mapping, visualizations,
 * UI) talks through these types. Change them deliberately: every module
 * depends on them. See PLAN.md for the architecture overview.
 */

// ─────────────────────────────────────────────────────────────── colour ──

/** Linear-ish sRGB triple, each channel 0..1. */
export type RGB = [number, number, number];

export interface GradientStop {
  /** 0..1 position along the gradient */
  pos: number;
  /** CSS hex colour, e.g. "#ff8800" */
  color: string;
}

export type ColorMode =
  | 'light-octave' // fold frequency up by octaves into the visible-light band (≈400–790 THz) → wavelength → RGB
  | 'pitch-hue' // pitch class → hue wheel (chromatic order)
  | 'fifths-hue' // pitch class → hue wheel ordered by the circle of fifths
  | 'scriabin' // Scriabin's synesthetic key colours
  | 'newton' // Newton's 7-colour scale mapped to diatonic notes
  | 'spectral' // log-frequency position → hue range [hueStart, hueEnd]
  | 'gradient'; // log-frequency position → user gradient

export interface ColorSettings {
  mode: ColorMode;
  /** degrees, rotates hue-based modes */
  hueOffset: number;
  /** for 'spectral' mode */
  hueStart: number;
  hueEnd: number;
  /** 0..1 */
  saturation: number;
  /** 0..1 base lightness */
  lightness: number;
  /** how much intensity (amplitude) drives brightness, 0..1 */
  intensityToBrightness: number;
  /** gamma applied to normalized position before palette lookup */
  gamma: number;
  /** used by 'gradient' mode, and available to visualizations via ColorMapper.norm */
  gradient: GradientStop[];
  /** reference pitch for A4, Hz */
  a4: number;
}

/**
 * Handed to every visualization each frame. All visualizations should get
 * their colours from here (rather than hard-coding) so the global Mapping
 * panel controls the look of everything at once.
 */
export interface ColorMapper {
  settings: ColorSettings;
  /** colour for a frequency in Hz; intensity 0..1 optionally modulates brightness */
  freq(hz: number, intensity?: number): RGB;
  /** colour for a (fractional) pitch class, 0 = C … 11 = B */
  pitchClass(pc: number, intensity?: number): RGB;
  /** colour at a normalized position 0..1 along the active palette */
  norm(t: number, intensity?: number): RGB;
  /** helpers */
  css(rgb: RGB, alpha?: number): string;
  hex(rgb: RGB): string;
}

// ──────────────────────────────────────────────────────────────── audio ──

export type FreqScale = 'log' | 'mel' | 'bark' | 'linear';

export interface AnalysisSettings {
  fftSize: 1024 | 2048 | 4096 | 8192 | 16384;
  /** AnalyserNode.smoothingTimeConstant, 0..0.99 */
  smoothing: number;
  /** dB floor / ceiling used to normalize magnitudes to 0..1 */
  minDb: number;
  maxDb: number;
  /** post-normalization gain, 0.1..4 */
  gain: number;
  /** number of perceptual bands produced in AudioFeatures.bands */
  bandCount: number;
  freqScale: FreqScale;
  minFreq: number;
  maxFreq: number;
  /** onset detection sensitivity 0..1 (higher = more beats) */
  beatSensitivity: number;
  /** seconds for beatPulse to decay from 1 → 0 */
  beatDecay: number;
  /** extra temporal smoothing applied to scalar features, 0..0.99 */
  featureSmoothing: number;
}

export interface Partial_ {
  freq: number;
  amp: number;
}

/**
 * Everything a visualization might want to know about the sound right now.
 * Produced once per animation frame by the audio engine. All "0..1" values
 * are already normalized with the AnalysisSettings.
 */
export interface AudioFeatures {
  /** seconds since start of track */
  time: number;
  duration: number;
  playing: boolean;
  sampleRate: number;
  fftSize: number;

  /** per FFT bin, 0..1 normalized magnitude (length fftSize/2) */
  spectrum: Float32Array;
  /** per FFT bin, raw dB */
  spectrumDb: Float32Array;
  /** time-domain samples −1..1 (length fftSize) */
  waveform: Float32Array;

  /** bandCount perceptually-spaced bands, 0..1 */
  bands: Float32Array;
  /** centre frequency of each band, Hz */
  bandFreqs: Float32Array;

  /** 12 pitch-class energies (C … B), 0..1, max-normalized */
  chroma: Float32Array;

  /** 0..1 */
  rms: number;
  /** perceptual loudness 0..1 (smoothed) */
  loudness: number;
  peak: number;
  bass: number;
  mid: number;
  treble: number;

  /** spectral centroid, Hz, and normalized 0..1 on the band scale */
  centroid: number;
  centroidNorm: number;
  /** spectral flux (positive change), 0..1 */
  flux: number;

  /** true on the frame an onset/beat was detected */
  beat: boolean;
  /** 1 at a beat, decaying to 0 over beatDecay */
  beatPulse: number;
  /** tempo estimate (null until confident) */
  bpm: number | null;
  /** 0..1 position within the current beat interval (0 when bpm unknown) */
  beatPhase: number;
  /** count of beats since load */
  beatCount: number;

  /** estimated dominant fundamental */
  pitch: { freq: number; clarity: number; norm: number };
  /** harmonic series of the fundamental (k·f0) with measured amplitudes, k = 1..N */
  partials: Partial_[];
  /** strongest spectral peaks, sorted by amplitude desc */
  peaks: Partial_[];
}

/** Scalar features that can drive parameter modulation. */
export type ModSource =
  | 'loudness'
  | 'rms'
  | 'bass'
  | 'mid'
  | 'treble'
  | 'beatPulse'
  | 'flux'
  | 'centroidNorm'
  | 'pitchNorm'
  | 'beatPhase'
  | 'lfoSlow'
  | 'lfoFast'
  | 'random';

export const MOD_SOURCES: { id: ModSource; label: string; hint: string }[] = [
  { id: 'loudness', label: 'Loudness', hint: 'Overall loudness, weighted like the ear hears it and auto-levelled, so quiet and loud tracks both move it.' },
  { id: 'rms', label: 'RMS', hint: 'Raw waveform level (root-mean-square). Follows the true amplitude, with no ear weighting or auto-levelling.' },
  { id: 'bass', label: 'Bass', hint: 'Energy from 20–250 Hz: kick drums and bass lines.' },
  { id: 'mid', label: 'Mid', hint: 'Energy from 250 Hz–4 kHz, where voices, guitars and most melodies live.' },
  { id: 'treble', label: 'Treble', hint: 'Energy above 4 kHz: cymbals, hi-hats, breath and “s” sounds.' },
  { id: 'beatPulse', label: 'Beat', hint: 'Jumps to 1 on each detected beat (a sudden rise in energy), then falls to 0 over the Beat decay time.' },
  { id: 'flux', label: 'Flux', hint: 'Spectral flux: how much the spectrum just changed. Spikes on new notes and hits, stays low on held chords.' },
  { id: 'centroidNorm', label: 'Brightness', hint: 'Spectral centroid, the spectrum’s centre of mass: high for bright, hissy sounds, low for dark, muffled ones.' },
  { id: 'pitchNorm', label: 'Pitch', hint: 'The main detected note, from Min freq (0) to Max freq (1) on a log scale.' },
  { id: 'beatPhase', label: 'Beat phase', hint: 'Ramps 0 → 1 across each beat once a tempo is found, then repeats. Good for motion that stays in time.' },
  { id: 'lfoSlow', label: 'LFO slow', hint: 'Low-frequency oscillator: a sine wave taking 10 s per cycle, ignoring the audio. For gentle drift.' },
  { id: 'lfoFast', label: 'LFO fast', hint: 'A sine wave cycling once per second, ignoring the audio. For steady pulsing.' },
  { id: 'random', label: 'Random', hint: 'Smooth wandering noise, ignoring the audio. For organic, unpredictable movement.' },
];

// ─────────────────────────────────────────────────────────────── params ──

export type ParamValue = number | string | boolean | GradientStop[];

interface ParamBase {
  key: string;
  label: string;
  /** groups render as collapsible sections in the inspector */
  group?: string;
  /**
   * Shown as the setting's tooltip (and inline in "Describe settings" mode).
   * Write it to teach: what it changes on screen, which part of the sound it
   * relates to, and a tip for exploring. One or two sentences.
   */
  hint?: string;
}

export type ParamSpec =
  | (ParamBase & {
      type: 'number';
      min: number;
      max: number;
      step?: number;
      default: number;
      unit?: string;
      /** slider response */
      curve?: 'linear' | 'log';
    })
  | (ParamBase & {
      type: 'select';
      /** `hint` explains what choosing this option does (shown in the dropdown / tooltip) */
      options: { value: string; label: string; hint?: string }[];
      default: string;
    })
  | (ParamBase & { type: 'boolean'; default: boolean })
  | (ParamBase & { type: 'color'; default: string })
  | (ParamBase & { type: 'gradient'; default: GradientStop[] });

export type ParamValues = Record<string, ParamValue>;

export interface Modulation {
  source: ModSource;
  /** −1..1, fraction of the param's (max−min) range added at source = 1 */
  amount: number;
  /** 0..0.99, extra one-pole smoothing on the source */
  smooth: number;
}

// ─────────────────────────────────────────────────────── visualizations ──

export interface RenderContext {
  /** CSS pixel size of the layer canvas. For canvas2d, the compositor has
   *  already applied a dpr transform, so draw in CSS pixels. */
  width: number;
  height: number;
  dpr: number;
  /** seconds since app start (wall clock), and frame delta */
  time: number;
  dt: number;
  audio: AudioFeatures;
  /** effective params this frame (base values + modulation applied) */
  params: ParamValues;
  color: ColorMapper;
}

export interface VizInstance {
  /**
   * Draw one frame.
   * canvas2d: the compositor clears (or fades, if layer feedback > 0) the
   *   canvas and sets ctx transform to dpr before calling. Do not clear
   *   unless you mean to; leave the background transparent so layers blend.
   * webgl: you own the canvas entirely (clear with alpha 0 for blending).
   */
  render(rc: RenderContext): void;
  /** called on mount and whenever size changes (CSS px + dpr) */
  resize?(width: number, height: number, dpr: number): void;
  dispose?(): void;
}

export interface VizPreset {
  name: string;
  description?: string;
  params: ParamValues;
  modulations?: Record<string, Modulation>;
}

export interface VizDefinition {
  /** kebab-case, unique, stable (used in saved projects) */
  id: string;
  name: string;
  /** one or two sentences: what idea of mapping sound → visuals it explores */
  description: string;
  /** canvas2d: compositor gives you a 2D canvas. webgl: you make a WebGL/three.js renderer on the canvas. */
  renderer: 'canvas2d' | 'webgl';
  /** "2D" or "3D" space */
  space: '2d' | '3d';
  tags?: string[];
  params: ParamSpec[];
  presets?: VizPreset[];
  create(canvas: HTMLCanvasElement): VizInstance;
}

// ──────────────────────────────────────────────────────── layers/scenes ──

export type BlendMode =
  | 'source-over'
  | 'lighter'
  | 'screen'
  | 'multiply'
  | 'overlay'
  | 'difference'
  | 'exclusion'
  | 'color-dodge'
  | 'soft-light'
  | 'hard-light'
  | 'hue'
  | 'color'
  | 'luminosity';

export const BLEND_MODES: { value: BlendMode; label: string; hint: string }[] = [
  { value: 'source-over', label: 'Normal', hint: 'Paints this layer over the ones below; only its transparent parts let them show.' },
  { value: 'lighter', label: 'Add', hint: 'Adds the colours: overlaps get brighter and can burn to white. Black adds nothing. Good for light.' },
  { value: 'screen', label: 'Screen', hint: 'Lightens: like projecting two slides onto one screen. Black disappears; overlaps brighten gently.' },
  { value: 'multiply', label: 'Multiply', hint: 'Darkens: like stacking coloured gels. White disappears. Over a black stage it shows nothing.' },
  { value: 'overlay', label: 'Overlay', hint: 'Adds contrast to the layers below, tinted by this one: their lights get lighter, darks darker.' },
  { value: 'soft-light', label: 'Soft light', hint: 'A gentle Overlay: tints the layers below and slightly lightens or darkens them, like a soft lamp.' },
  { value: 'hard-light', label: 'Hard light', hint: 'A strong Overlay led by this layer: its light parts screen, its dark parts multiply.' },
  { value: 'color-dodge', label: 'Color dodge', hint: 'Brightens the layers below by this colour, blowing highlights out to vivid colour. Black does nothing.' },
  { value: 'difference', label: 'Difference', hint: 'Subtracts colours: matching colours turn black, white inverts. Gives psychedelic, inverted overlaps.' },
  { value: 'exclusion', label: 'Exclusion', hint: 'A softer Difference: white inverts, black does nothing, mid tones wash toward grey.' },
  { value: 'hue', label: 'Hue', hint: 'Takes this layer’s hue but keeps the brightness and saturation below: recolours without reshading.' },
  { value: 'color', label: 'Color', hint: 'Takes this layer’s hue and saturation over the brightness below, like tinting a black-and-white photo.' },
  { value: 'luminosity', label: 'Luminosity', hint: 'Takes this layer’s brightness with the colours below it: the opposite of Color.' },
];

export interface LayerTransform {
  /** offset as a fraction of stage size, −1..1 */
  x: number;
  y: number;
  scale: number;
  /** degrees */
  rotation: number;
}

export interface Layer {
  id: string;
  vizId: string;
  name: string;
  visible: boolean;
  opacity: number;
  blend: BlendMode;
  params: ParamValues;
  modulations: Record<string, Modulation>;
  transform: LayerTransform;
  /** canvas2d layers only: 0 = clear every frame, 0.99 = long trails */
  feedback: number;
}

export interface PostSettings {
  background: string;
  /** whole-stage trails 0..0.99 */
  trails: number;
  /** bloom-ish glow 0..1 */
  glow: number;
  glowRadius: number;
  vignette: number;
  /** film grain 0..1 */
  grain: number;
  /** 0.5..2 multiplier on devicePixelRatio */
  renderScale: number;
  /** 'fill' or fixed aspect ratios */
  aspect: 'fill' | '16:9' | '1:1' | '9:16' | '4:3';
}

/** A layer definition inside a scene: id is assigned on load. */
export type SceneLayer = Partial<Omit<Layer, 'id' | 'vizId'>> & { vizId: string };

/** A curated starting point: a full stack of layers + mapping + post settings. */
export interface Scene {
  id: string;
  name: string;
  description: string;
  tags?: string[];
  layers: SceneLayer[];
  color?: Partial<ColorSettings>;
  analysis?: Partial<AnalysisSettings>;
  post?: Partial<PostSettings>;
}

/** What gets saved / exported. */
export interface ProjectFile {
  app: 'music-viz-studio';
  version: 1;
  name: string;
  layers: Layer[];
  color: ColorSettings;
  analysis: AnalysisSettings;
  post: PostSettings;
}
