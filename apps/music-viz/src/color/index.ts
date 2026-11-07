/**
 * Colour mapping library: sound → colour.
 *
 * Every visualization gets its colours from a `ColorMapper` built from the
 * global `ColorSettings`, so the Mapping panel restyles the whole stage.
 *
 * Pipeline (done once per settings change, into lookup tables):
 *   1. the mode produces a *base colour* for a pitch class or a palette
 *      position (light-octave → wavelength → CIE XYZ → sRGB, hue wheels,
 *      historical tables, user gradients …);
 *   2. the base colour is converted to OKLab and styled perceptually:
 *      chroma × saturation, lightness (0.5 = the mode's native colour,
 *      < 0.5 darkens, > 0.5 tints toward white), optional lightness
 *      equalisation for synthetic hue wheels, then gamut-mapped by reducing
 *      chroma until it fits sRGB;
 *   3. `intensity` dims along OKLab L (perceptually even), precomputed as 17
 *      levels and interpolated.
 *
 * At render time `freq()` costs one log2, a table read and a lerp.
 */
import type { ColorMapper, ColorMode, ColorSettings, GradientStop, RGB } from '../core/types';

// ─────────────────────────────────────────────────────────────── constants ──

/** speed of light, m/s */
export const SPEED_OF_LIGHT = 299_792_458;
/** audible range used for log-frequency palette positions */
export const FREQ_MIN = 20;
export const FREQ_MAX = 20_000;
/** visible-light fold window, THz. 395 → 790 THz is exactly one octave (≈ 759 → 380 nm). */
export const LIGHT_MIN_THZ = 395;
export const LIGHT_MAX_THZ = 790;

export const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'] as const;
export const NOTE_NAMES_ASCII = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

// ──────────────────────────────────────────────────────────── pitch helpers ──

export function midiFromHz(hz: number, a4 = 440): number {
  return 69 + 12 * Math.log2(Math.max(1e-6, hz) / a4);
}
export function hzFromMidi(midi: number, a4 = 440): number {
  return a4 * Math.pow(2, (midi - 69) / 12);
}
/** fractional pitch class 0 (C) … <12 (B) */
export function pitchClassFromHz(hz: number, a4 = 440): number {
  const m = midiFromHz(hz, a4);
  return ((m % 12) + 12) % 12;
}
/** e.g. noteName(440) → "A4", noteName(450) → "A4 +39¢" when withCents */
export function noteName(hz: number, a4 = 440, withCents = false): string {
  if (!(hz > 0)) return '—';
  const m = midiFromHz(hz, a4);
  const r = Math.round(m);
  const pc = ((r % 12) + 12) % 12;
  const oct = Math.floor(r / 12) - 1;
  const base = `${NOTE_NAMES[pc]}${oct}`;
  if (!withCents) return base;
  const cents = Math.round((m - r) * 100);
  return cents === 0 ? base : `${base} ${cents > 0 ? '+' : '−'}${Math.abs(cents)}¢`;
}
export function midiName(midi: number): string {
  const r = Math.round(midi);
  return `${NOTE_NAMES[((r % 12) + 12) % 12]}${Math.floor(r / 12) - 1}`;
}

/** log-frequency position 0..1 across FREQ_MIN…FREQ_MAX (clamped) */
export function freqToNorm(hz: number, min = FREQ_MIN, max = FREQ_MAX): number {
  if (!(hz > min)) return 0;
  if (hz >= max) return 1;
  return Math.log(hz / min) / Math.log(max / min);
}
export function normToFreq(t: number, min = FREQ_MIN, max = FREQ_MAX): number {
  return min * Math.pow(max / min, t);
}

// ──────────────────────────────────────────────────── sound → light (octave) ──

export interface LightFold {
  /** frequency of light after folding, THz */
  thz: number;
  /** wavelength in vacuum, nm */
  nm: number;
  /** how many octaves the sound was shifted up (≈ 40 for audible sound) */
  octaves: number;
}

/**
 * Shift a sound frequency up by whole octaves until it lands in the
 * visible-light window [395, 790) THz. `shiftFraction` (0..1, a fraction of
 * an octave) rotates where the fold lands, which rotates the hues.
 */
export function freqToLightWavelength(hz: number, shiftFraction = 0): LightFold {
  const f = Math.max(1e-3, hz) * Math.pow(2, shiftFraction);
  const lo = LIGHT_MIN_THZ * 1e12;
  const k = Math.floor(Math.log2(lo / f)) + 1;
  let fl = f * Math.pow(2, k);
  let oct = k;
  // guard against floating error at the window edges
  if (fl >= 2 * lo) { fl /= 2; oct -= 1; }
  if (fl < lo) { fl *= 2; oct += 1; }
  return { thz: fl / 1e12, nm: (SPEED_OF_LIGHT / fl) * 1e9, octaves: oct };
}

// ───────────────────────────────────────────── CIE 1931 (Wyman et al. 2013) ──

function g(x: number, mu: number, s1: number, s2: number): number {
  const t = (x - mu) / (x < mu ? s1 : s2);
  return Math.exp(-0.5 * t * t);
}

/**
 * CIE 1931 2° colour-matching functions, multi-lobe piecewise-Gaussian fit
 * (Wyman, Sloan & Shirley 2013, "Simple Analytic Approximations to the CIE
 * XYZ Color Matching Functions"). Returns XYZ for monochromatic light at
 * `nm` with unit radiance.
 */
export function wavelengthToXYZ(nm: number): [number, number, number] {
  const x = 1.056 * g(nm, 599.8, 37.9, 31.0) + 0.362 * g(nm, 442.0, 16.0, 26.7) - 0.065 * g(nm, 501.1, 20.4, 26.2);
  const y = 0.821 * g(nm, 568.8, 46.9, 40.5) + 0.286 * g(nm, 530.9, 16.3, 31.1);
  const z = 1.217 * g(nm, 437.0, 11.8, 36.0) + 0.681 * g(nm, 459.0, 26.0, 13.8);
  return [x, y, z];
}

function xyzToLinearSrgb(X: number, Y: number, Z: number): RGB {
  return [
    3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z,
    -0.969266 * X + 1.8760108 * Y + 0.041556 * Z,
    0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z,
  ];
}

/** chromaticity is taken from this range: outside it the Gaussian fit's tails are unreliable
 *  and the true chromaticity of spectral light barely changes anyway */
const NM_CHROMA_MIN = 415;
const NM_CHROMA_MAX = 650;
const WL_MIN = 380;
const WL_MAX = 780;
const WHITE_MIX = 0.15;
let wlTable: Float32Array | null = null;

function buildWavelengthTable(): Float32Array {
  const n = WL_MAX - WL_MIN + 1;
  const t = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const nm = Math.min(NM_CHROMA_MAX, Math.max(NM_CHROMA_MIN, WL_MIN + i));
    const [X, Y, Z] = wavelengthToXYZ(nm);
    let [r, gg, b] = xyzToLinearSrgb(X, Y, Z);
    // out of gamut: add a little white (desaturate), then clip the remaining
    // negative channel. Pure white-addition is colorimetrically "right" but
    // reads too pink/cold (Abney effect); pure clipping is closest to how
    // spectral light is perceived. A 15% blend of the two keeps hues honest.
    const m = Math.min(r, gg, b);
    if (m < 0) { const w = -m * WHITE_MIX; r = Math.max(0, r + w); gg = Math.max(0, gg + w); b = Math.max(0, b + w); }
    const mx = Math.max(r, gg, b, 1e-9);
    const c: RGB = [encode(r / mx), encode(gg / mx), encode(b / mx)];
    t[i * 3] = c[0]; t[i * 3 + 1] = c[1]; t[i * 3 + 2] = c[2];
  }
  return t;
}

/**
 * Wavelength (380–780 nm) → display sRGB (gamma-encoded, 0..1).
 *
 * Spectral colours lie outside the sRGB gamut. CIE 1931 (Wyman fit) → XYZ →
 * linear sRGB, then a little white is added and any remaining negative channel
 * clipped, and the result is normalised so its brightest channel is 1 — the
 * band stays vivid instead of fading into the dim tails of the eye's
 * sensitivity. Pass `physical: true` to scale by the photopic luminosity
 * ȳ(λ) instead: dark reds and violets at the ends.
 */
export function wavelengthToRGB(nm: number, physical = false): RGB {
  if (!wlTable) wlTable = buildWavelengthTable();
  const x = Math.min(WL_MAX, Math.max(WL_MIN, nm)) - WL_MIN;
  const i = Math.min(WL_MAX - WL_MIN - 1, Math.floor(x));
  const u = x - i;
  const T = wlTable;
  let r = T[i * 3] + (T[i * 3 + 3] - T[i * 3]) * u;
  let gg = T[i * 3 + 1] + (T[i * 3 + 4] - T[i * 3 + 1]) * u;
  let b = T[i * 3 + 2] + (T[i * 3 + 5] - T[i * 3 + 2]) * u;
  if (physical) {
    const y = wavelengthToXYZ(Math.min(WL_MAX, Math.max(WL_MIN, nm)))[1];
    const k = Math.min(1, y / 0.75);
    r = encode(decode(r) * k); gg = encode(decode(gg) * k); b = encode(decode(b) * k);
  }
  return [r, gg, b];
}

// ─────────────────────────────────────────────────────────── colour spaces ──

export function decode(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
export function encode(c: number): number {
  if (c <= 0) return 0;
  if (c >= 1) return 1;
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

export type Lab = [number, number, number];

export function linearToOklab(r: number, gg: number, b: number): Lab {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * gg + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * gg + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * gg + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
export function oklabToLinear(L: number, a: number, b: number): RGB {
  const l = L + 0.3963377774 * a + 0.2158037573 * b;
  const m = L - 0.1055613458 * a - 0.0638541728 * b;
  const s = L - 0.0894841775 * a - 1.291485548 * b;
  const l3 = l * l * l, m3 = m * m * m, s3 = s * s * s;
  return [
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  ];
}
export function srgbToOklab(c: RGB): Lab {
  return linearToOklab(decode(c[0]), decode(c[1]), decode(c[2]));
}
export function oklabToSrgb(L: number, a: number, b: number): RGB {
  const [r, gg, bb] = oklabToLinear(L, a, b);
  return [encode(r), encode(gg), encode(bb)];
}

/** HSL → sRGB (h degrees, s/l 0..1) */
export function hslToRgb(h: number, s: number, l: number): RGB {
  h = ((h % 360) + 360) % 360;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}
/** sRGB → HSL hue in degrees (NaN for greys) */
export function rgbHue(c: RGB): number {
  const [r, gg, b] = c;
  const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), d = mx - mn;
  if (d < 1e-6) return NaN;
  let h: number;
  if (mx === r) h = ((gg - b) / d) % 6;
  else if (mx === gg) h = (b - r) / d + 2;
  else h = (r - gg) / d + 4;
  return ((h * 60) % 360 + 360) % 360;
}

export function hexToRgb(hex: string): RGB {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [0, 0, 0];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const HEX2: string[] = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));
function byte(v: number): number {
  return v <= 0 ? 0 : v >= 1 ? 255 : (v * 255 + 0.5) | 0;
}
export function rgbToHex(c: RGB): string {
  return '#' + HEX2[byte(c[0])] + HEX2[byte(c[1])] + HEX2[byte(c[2])];
}
export function rgbToCss(c: RGB, alpha = 1): string {
  return alpha >= 1
    ? `rgb(${byte(c[0])},${byte(c[1])},${byte(c[2])})`
    : `rgba(${byte(c[0])},${byte(c[1])},${byte(c[2])},${alpha <= 0 ? 0 : alpha})`;
}

// ───────────────────────────────────────────────────────────────── gradients ──

/** Sample a gradient (interpolated in OKLab for smooth, even blends). Stops need not be sorted. */
export function sampleGradient(stops: GradientStop[], t: number): RGB {
  if (!stops || stops.length === 0) return [t, t, t];
  const s = stops.length > 1 && !isSorted(stops) ? [...stops].sort((a, b) => a.pos - b.pos) : stops;
  if (t <= s[0].pos) return hexToRgb(s[0].color);
  const last = s[s.length - 1];
  if (t >= last.pos) return hexToRgb(last.color);
  for (let i = 1; i < s.length; i++) {
    if (t <= s[i].pos) {
      const a = s[i - 1], b = s[i];
      const u = b.pos > a.pos ? (t - a.pos) / (b.pos - a.pos) : 0;
      const la = srgbToOklab(hexToRgb(a.color)), lb = srgbToOklab(hexToRgb(b.color));
      return oklabToSrgb(la[0] + (lb[0] - la[0]) * u, la[1] + (lb[1] - la[1]) * u, la[2] + (lb[2] - la[2]) * u);
    }
  }
  return hexToRgb(last.color);
}
function isSorted(s: GradientStop[]) {
  for (let i = 1; i < s.length; i++) if (s[i].pos < s[i - 1].pos) return false;
  return true;
}

/** CSS linear-gradient() string for a stop list (for UI swatches). */
export function gradientCss(stops: GradientStop[], angle = 90): string {
  const s = [...stops].sort((a, b) => a.pos - b.pos);
  return `linear-gradient(${angle}deg, ${s.map((x) => `${x.color} ${(x.pos * 100).toFixed(1)}%`).join(', ')})`;
}

export const GRADIENT_PRESETS: { id: string; name: string; stops: GradientStop[] }[] = [
  { id: 'nebula', name: 'Nebula', stops: [
    { pos: 0, color: '#1b0b3a' }, { pos: 0.35, color: '#6a2bd9' }, { pos: 0.65, color: '#ff4f8b' }, { pos: 1, color: '#ffd36e' } ] },
  { id: 'magma', name: 'Magma', stops: [
    { pos: 0, color: '#000004' }, { pos: 0.25, color: '#3b0f70' }, { pos: 0.5, color: '#8c2981' }, { pos: 0.75, color: '#fe9f6d' }, { pos: 1, color: '#fcfdbf' } ] },
  { id: 'viridis', name: 'Viridis', stops: [
    { pos: 0, color: '#440154' }, { pos: 0.25, color: '#3b528b' }, { pos: 0.5, color: '#21918c' }, { pos: 0.75, color: '#5ec962' }, { pos: 1, color: '#fde725' } ] },
  { id: 'ember', name: 'Ember', stops: [
    { pos: 0, color: '#120400' }, { pos: 0.4, color: '#8a1c00' }, { pos: 0.7, color: '#ff6a00' }, { pos: 1, color: '#fff1c1' } ] },
  { id: 'ocean', name: 'Ocean', stops: [
    { pos: 0, color: '#02060f' }, { pos: 0.35, color: '#0b3d6b' }, { pos: 0.7, color: '#1fb5c9' }, { pos: 1, color: '#e2fff8' } ] },
  { id: 'aurora', name: 'Aurora', stops: [
    { pos: 0, color: '#06121f' }, { pos: 0.3, color: '#0f7b6c' }, { pos: 0.6, color: '#64f0a0' }, { pos: 0.85, color: '#b78cff' }, { pos: 1, color: '#ffd6ff' } ] },
  { id: 'synthwave', name: 'Synthwave', stops: [
    { pos: 0, color: '#2b0a4d' }, { pos: 0.45, color: '#ff2fa0' }, { pos: 0.75, color: '#ff9e3d' }, { pos: 1, color: '#3df5ff' } ] },
  { id: 'mono', name: 'Monochrome', stops: [ { pos: 0, color: '#050506' }, { pos: 1, color: '#f4f5f8' } ] },
  { id: 'ink', name: 'Ink & gold', stops: [ { pos: 0, color: '#0a0b10' }, { pos: 0.6, color: '#3a3f52' }, { pos: 1, color: '#ffcf70' } ] },
  { id: 'ice', name: 'Ice', stops: [ { pos: 0, color: '#0a0f24' }, { pos: 0.5, color: '#5d7cff' }, { pos: 1, color: '#f0f6ff' } ] },
];

// ──────────────────────────────────────────────────────── historical tables ──

/**
 * Scriabin's clavier à lumières key colours (Prometheus, 1910), as commonly
 * charted from Sabaneev's 1911 account. Index = pitch class C … B.
 */
export const SCRIABIN_COLORS: { note: string; color: string; name: string }[] = [
  { note: 'C', color: '#ff0000', name: 'red' },
  { note: 'C♯', color: '#8f00ff', name: 'violet' },
  { note: 'D', color: '#ffff00', name: 'yellow' },
  { note: 'D♯', color: '#b7468b', name: 'steely, with a glint of metal (flesh)' },
  { note: 'E', color: '#c3f2ff', name: 'pearly white-blue (moonlight)' },
  { note: 'F', color: '#ab0034', name: 'deep red' },
  { note: 'F♯', color: '#7f8bfd', name: 'bright blue' },
  { note: 'G', color: '#ff7f00', name: 'orange-rose' },
  { note: 'G♯', color: '#bb75fc', name: 'purple-violet' },
  { note: 'A', color: '#33cc33', name: 'green' },
  { note: 'A♯', color: '#a9677c', name: 'steel with a metallic sheen' },
  { note: 'B', color: '#8ec9ff', name: 'blue, like E' },
];

/**
 * Newton's seven colours (Opticks, 1704). He divided the spectrum in the
 * proportions of a string sounding the Dorian scale on D: red spans D→E,
 * orange E→F, yellow F→G, green G→A, blue A→B, indigo B→C, violet C→D.
 * Each diatonic note takes the colour of the band it begins; the chromatic
 * notes between are blended.
 */
export const NEWTON_COLORS: { note: string; pc: number; color: string; name: string }[] = [
  { note: 'D', pc: 2, color: '#e8202a', name: 'red' },
  { note: 'E', pc: 4, color: '#ff8a1c', name: 'orange' },
  { note: 'F', pc: 5, color: '#ffe11a', name: 'yellow' },
  { note: 'G', pc: 7, color: '#2fc24a', name: 'green' },
  { note: 'A', pc: 9, color: '#1f6fe0', name: 'blue' },
  { note: 'B', pc: 11, color: '#4b2ca8', name: 'indigo' },
  { note: 'C', pc: 12, color: '#8b3fd1', name: 'violet' },
];

// ──────────────────────────────────────────────────────────────── mode info ──

export const COLOR_MODES: ColorMode[] = ['light-octave', 'pitch-hue', 'fifths-hue', 'scriabin', 'newton', 'spectral', 'gradient'];

export interface ModeInfo {
  label: string;
  short: string;
  /** one paragraph of explanation */
  explanation: string;
  /** what `hueOffset` does in this mode */
  hueOffsetMeaning: string;
  /** colours depend only on pitch class (octave equivalence) */
  pitchBased: boolean;
}

export const MODE_INFO: Record<ColorMode, ModeInfo> = {
  'light-octave': {
    label: 'Light octave',
    short: 'Fold sound up ~40 octaves into visible light',
    explanation:
      'Treat sound and light as the same kind of wave and double the frequency of a note until it lands in the visible band. A4 (440 Hz) needs 40 doublings to reach ≈ 484 THz, which is ≈ 620 nm, an orange-red. The visible band (≈ 395–790 THz, 760–380 nm) spans almost exactly one octave, so each pitch class gets one spectral colour and the octave itself is lost: every A is the same orange. Because the spectrum doesn’t loop, the fold has a seam between deep red and violet, near F/F♯ at standard tuning. Wavelengths become colour through the CIE 1931 colour-matching functions (Wyman et al. fit) → XYZ → sRGB, desaturated just enough to be displayable.',
    hueOffsetMeaning: 'Shifts the fold by a fraction of an octave (360° = one octave), sliding every note along the spectrum.',
    pitchBased: true,
  },
  'pitch-hue': {
    label: 'Pitch → hue',
    short: 'Chromatic scale around the colour wheel',
    explanation:
      'The twelve pitch classes are spread evenly round the hue wheel in chromatic order, 30° per semitone, with C at the hue offset. Neighbouring semitones get neighbouring hues, so a chromatic run is a smooth rainbow. The octave is ignored: C2 and C6 share a colour. Consonant intervals such as a fifth (210° apart) come out as near-complementary colours.',
    hueOffsetMeaning: 'The hue of C (degrees). Every other note follows at 30° per semitone.',
    pitchBased: true,
  },
  'fifths-hue': {
    label: 'Circle of fifths',
    short: 'Hue follows the circle of fifths',
    explanation:
      'Pitch classes go round the wheel in circle-of-fifths order (C, G, D, A, E, B, F♯, …), so notes a fifth apart sit next to each other in hue. Diatonic keys then occupy a contiguous arc of colour. A major chord becomes a narrow, harmonious cluster of hues, chromatic clashes look like clashes, and modulating to a nearby key shifts the whole palette slightly. This is the mapping most aligned with how harmony is heard.',
    hueOffsetMeaning: 'The hue of C (degrees). G is +30°, D +60°, and so on round the circle of fifths.',
    pitchBased: true,
  },
  scriabin: {
    label: 'Scriabin',
    short: 'Scriabin’s clavier à lumières (1910)',
    explanation:
      'Alexander Scriabin wrote a part for a “keyboard of light” in Prometheus: Poem of Fire. These colours are his key-to-colour associations as charted by his friend Leonid Sabaneev. They roughly follow the circle of fifths for the bright keys (C red, G orange, D yellow, A green, E pearly blue) and use darker, “steely” or violet colours for the flat keys. Notes between keys blend smoothly. This is a personal, synesthetic system and doesn’t come from physics.',
    hueOffsetMeaning: 'Rotates every colour’s hue by this many degrees (0 = Scriabin’s own colours).',
    pitchBased: true,
  },
  newton: {
    label: 'Newton',
    short: 'Newton’s seven colours as the Dorian scale',
    explanation:
      'In Opticks (1704) Newton divided the spectrum into seven colours with the same proportions as a string sounding the Dorian scale on D. Red runs D→E, orange E→F, yellow F→G, green G→A, blue A→B, indigo B→C and violet C→D. He added orange and indigo partly so that there would be seven colours to match the seven notes. Each white key takes the colour of the band it begins, and the sharps blend between their neighbours.',
    hueOffsetMeaning: 'Rotates every colour’s hue by this many degrees.',
    pitchBased: true,
  },
  spectral: {
    label: 'Spectral range',
    short: 'Low → high frequency sweeps a hue range',
    explanation:
      'Position on a logarithmic frequency axis (20 Hz → 20 kHz) sweeps linearly from the start hue to the end hue. Unlike the pitch modes, octaves matter: a bass note and a high whistle get very different colours, so this mode shows register rather than harmony. Gamma bends the sweep toward the lows (gamma < 1) or the highs (gamma > 1).',
    hueOffsetMeaning: 'Added to both the start and end hue.',
    pitchBased: false,
  },
  gradient: {
    label: 'Gradient',
    short: 'Log-frequency → your own gradient',
    explanation:
      'Position on a logarithmic frequency axis (20 Hz → 20 kHz) picks a colour from a custom gradient, blended in OKLab so the transitions look even. Use it for designed looks such as monochrome, brand palettes or heat-maps. Visualizations that colour by level or progress also sample this palette through norm(). Gamma bends where the middle of the gradient falls.',
    hueOffsetMeaning: 'Not used.',
    pitchBased: false,
  },
};

// ─────────────────────────────────────────────────────────────── the mapper ──

/** number of precomputed intensity levels (interpolated between) */
const NL = 17;
/** pitch-class LUT resolution: entries per semitone */
const PC_RES = 60;
const PC_N = 12 * PC_RES;
/** palette-position LUT size */
const POS_N = 1024;

/** modes whose base colours are synthetic hue wheels / normalised spectra: equalise their lightness */
const EQUALIZE: Record<ColorMode, number> = {
  'light-octave': 0.4,
  'pitch-hue': 0.4,
  'fifths-hue': 0.4,
  spectral: 0.4,
  scriabin: 0,
  newton: 0,
  gradient: 0,
};

function lerpHue(a: number, b: number, u: number): number {
  let d = ((b - a) % 360 + 540) % 360 - 180;
  return a + d * u;
}

function rotateLab(lab: Lab, deg: number): Lab {
  if (!deg) return lab;
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [lab[0], lab[1] * c - lab[2] * s, lab[1] * s + lab[2] * c];
}

function inGamut(L: number, a: number, b: number): boolean {
  const [r, gg, bb] = oklabToLinear(L, a, b);
  const e = 1e-4;
  return r >= -e && r <= 1 + e && gg >= -e && gg <= 1 + e && bb >= -e && bb <= 1 + e;
}

/** Base OKLab colour for a fractional pitch class in a pitch-based mode. */
function pitchBase(mode: ColorMode, pc: number, s: ColorSettings, cache: { scr: Lab[]; nw: Lab[] }): Lab {
  pc = ((pc % 12) + 12) % 12;
  switch (mode) {
    case 'light-octave': {
      // frequency of this pitch class in octave 4 at the configured tuning
      const hz = s.a4 * Math.pow(2, (pc - 9) / 12);
      const { nm } = freqToLightWavelength(hz, s.hueOffset / 360);
      return srgbToOklab(wavelengthToRGB(nm));
    }
    case 'pitch-hue':
      return srgbToOklab(hslToRgb(s.hueOffset + pc * 30, 1, 0.5));
    case 'fifths-hue': {
      const i = Math.floor(pc), u = pc - i;
      const h0 = ((i * 7) % 12) * 30, h1 = ((((i + 1) % 12) * 7) % 12) * 30;
      return srgbToOklab(hslToRgb(s.hueOffset + lerpHue(h0, h1, u), 1, 0.5));
    }
    case 'scriabin': {
      const i = Math.floor(pc), u = pc - i;
      const a = cache.scr[i % 12], b = cache.scr[(i + 1) % 12];
      return rotateLab([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u], s.hueOffset);
    }
    case 'newton': {
      // anchors at D=2, E=4, F=5, G=7, A=9, B=11, C=12(=0), wrapping to D=14
      const p = pc < 2 ? pc + 12 : pc;
      const pts = NEWTON_COLORS;
      for (let k = 0; k < pts.length; k++) {
        const a = pts[k];
        const bpc = k + 1 < pts.length ? pts[k + 1].pc : 14;
        if (p >= a.pc && p <= bpc) {
          const la = cache.nw[k], lb = cache.nw[(k + 1) % pts.length];
          const u = (p - a.pc) / (bpc - a.pc);
          return rotateLab([la[0] + (lb[0] - la[0]) * u, la[1] + (lb[1] - la[1]) * u, la[2] + (lb[2] - la[2]) * u], s.hueOffset);
        }
      }
      return cache.nw[0];
    }
    default:
      return [0.5, 0, 0];
  }
}

/** Base OKLab colour at palette position p (already gamma-adjusted). */
function paletteBase(mode: ColorMode, p: number, s: ColorSettings, cache: { scr: Lab[]; nw: Lab[] }, gradLab: (t: number) => Lab): Lab {
  switch (mode) {
    case 'spectral':
      return srgbToOklab(hslToRgb(s.hueOffset + s.hueStart + (s.hueEnd - s.hueStart) * p, 1, 0.5));
    case 'gradient':
      return gradLab(p);
    default:
      return pitchBase(mode, p * 12, s, cache);
  }
}

/** Apply saturation / lightness / equalisation and gamut-map. Returns OKLab. */
function style(lab: Lab, s: ColorSettings, eq: number): Lab {
  let [L, a, b] = lab;
  let C = Math.hypot(a, b);
  const h = Math.atan2(b, a);
  if (eq > 0) L = L + (0.72 - L) * eq;
  C *= Math.max(0, Math.min(1.5, s.saturation));
  const lt = Math.max(0, Math.min(1, s.lightness));
  if (lt <= 0.5) {
    const k = lt / 0.5;
    L *= k;
    C *= k;
  } else {
    const k = (lt - 0.5) / 0.5;
    L = L + (1 - L) * k;
    C *= 1 - k;
  }
  const ca = Math.cos(h), sa = Math.sin(h);
  if (!inGamut(L, C * ca, C * sa)) {
    let lo = 0, hi = C;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(L, mid * ca, mid * sa)) lo = mid;
      else hi = mid;
    }
    C = lo;
  }
  return [L, C * ca, C * sa];
}

/** Fill `out` (N × NL × 3 floats) with display sRGB for each entry and intensity level. */
function fillLevels(out: Float32Array, idx: number, lab: Lab) {
  const lin = oklabToLinear(lab[0], lab[1], lab[2]);
  const base = idx * NL * 3;
  for (let l = 0; l < NL; l++) {
    // uniform scaling of OKLab (L, a, b) by k scales linear RGB by k³ and stays in gamut
    const k = l / (NL - 1);
    const k3 = k * k * k;
    const o = base + l * 3;
    out[o] = encode(lin[0] * k3);
    out[o + 1] = encode(lin[1] * k3);
    out[o + 2] = encode(lin[2] * k3);
  }
}

const mapperCache = new WeakMap<ColorSettings, ColorMapper>();

export function createColorMapper(settings: ColorSettings): ColorMapper {
  const hit = mapperCache.get(settings);
  if (hit) return hit;
  const s = settings;
  const mode: ColorMode = (COLOR_MODES as string[]).includes(s.mode) ? s.mode : 'light-octave';
  const eq = EQUALIZE[mode];
  const cache = {
    scr: SCRIABIN_COLORS.map((c) => srgbToOklab(hexToRgb(c.color))),
    nw: NEWTON_COLORS.map((c) => srgbToOklab(hexToRgb(c.color))),
  };
  const stops = (s.gradient?.length ? s.gradient : [{ pos: 0, color: '#000000' }, { pos: 1, color: '#ffffff' }])
    .slice()
    .sort((a, b) => a.pos - b.pos);
  const stopLab = stops.map((x) => srgbToOklab(hexToRgb(x.color)));
  const gradLab = (t: number): Lab => {
    if (t <= stops[0].pos) return stopLab[0];
    for (let i = 1; i < stops.length; i++) {
      if (t <= stops[i].pos) {
        const a = stopLab[i - 1], b = stopLab[i];
        const span = stops[i].pos - stops[i - 1].pos;
        const u = span > 0 ? (t - stops[i - 1].pos) / span : 0;
        return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
      }
    }
    return stopLab[stopLab.length - 1];
  };

  const pitchBased = MODE_INFO[mode].pitchBased;
  const gamma = s.gamma > 0 ? s.gamma : 1;

  // palette-position LUT (index = raw position; gamma baked in)
  const posLUT = new Float32Array(POS_N * NL * 3);
  for (let i = 0; i < POS_N; i++) {
    const p = Math.pow(i / (POS_N - 1), gamma);
    // pitch modes: the palette walks the pitch circle once (slightly short of 12 to avoid wrapping back to C)
    const lab = pitchBased ? pitchBase(mode, p * 12 * (1 - 1e-6), s, cache) : paletteBase(mode, p, s, cache, gradLab);
    fillLevels(posLUT, i, style(lab, s, eq));
  }
  // pitch-class LUT
  const pcLUT = pitchBased ? new Float32Array(PC_N * NL * 3) : null;
  if (pcLUT) for (let i = 0; i < PC_N; i++) fillLevels(pcLUT, i, style(pitchBase(mode, i / PC_RES, s, cache), s, eq));

  const itb = Math.max(0, Math.min(1, s.intensityToBrightness));
  const read = (lut: Float32Array, idx: number, intensity: number | undefined): RGB => {
    let k = 1;
    if (intensity !== undefined && itb > 0) {
      const i = intensity <= 0 ? 0 : intensity >= 1 ? 1 : intensity;
      k = 1 - itb * (1 - i);
    }
    const f = k * (NL - 1);
    const l0 = f >= NL - 1 ? NL - 2 : f | 0;
    const u = f - l0;
    const o = idx * NL * 3 + l0 * 3;
    if (u === 0) return [lut[o], lut[o + 1], lut[o + 2]];
    return [
      lut[o] + (lut[o + 3] - lut[o]) * u,
      lut[o + 1] + (lut[o + 4] - lut[o + 1]) * u,
      lut[o + 2] + (lut[o + 5] - lut[o + 2]) * u,
    ];
  };

  const LOG_MIN = Math.log2(FREQ_MIN);
  const LOG_SPAN = Math.log2(FREQ_MAX) - LOG_MIN;
  const LOG_A4 = Math.log2(s.a4 > 0 ? s.a4 : 440);

  const pcIndex = (pc: number) => {
    let x = pc * PC_RES + 0.5;
    x = x % PC_N;
    if (x < 0) x += PC_N;
    return x | 0;
  };
  const posIndex = (t: number) => (t <= 0 ? 0 : t >= 1 ? POS_N - 1 : (t * (POS_N - 1) + 0.5) | 0);

  const mapper: ColorMapper = {
    settings,
    freq(hz, intensity) {
      if (!(hz > 0)) hz = FREQ_MIN;
      const lg = Math.log2(hz);
      if (pcLUT) {
        // pitch class relative to C: midi = 69 + 12·log2(hz/a4); pc = midi mod 12
        const pc = 9 + 12 * (lg - LOG_A4);
        return read(pcLUT, pcIndex(pc), intensity);
      }
      return read(posLUT, posIndex((lg - LOG_MIN) / LOG_SPAN), intensity);
    },
    pitchClass(pc, intensity) {
      if (pcLUT) return read(pcLUT, pcIndex(pc), intensity);
      const p = (((pc % 12) + 12) % 12) / 12;
      return read(posLUT, posIndex(p), intensity);
    },
    norm(t, intensity) {
      return read(posLUT, posIndex(t), intensity);
    },
    css: rgbToCss,
    hex: rgbToHex,
  };
  mapperCache.set(settings, mapper);
  return mapper;
}

/** Convenience: a mapper for a mode with otherwise-default-ish settings (used for comparisons). */
export function withMode(base: ColorSettings, mode: ColorMode): ColorSettings {
  return { ...base, mode };
}
