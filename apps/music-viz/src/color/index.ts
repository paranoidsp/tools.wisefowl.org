// STUB — replaced by the colour agent. Keeps the app compiling.
import type { ColorMapper, ColorSettings, RGB } from '../core/types';

function hsl(h: number, s: number, l: number): RGB {
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

export function createColorMapper(settings: ColorSettings): ColorMapper {
  const pc = (p: number, i = 1): RGB => hsl((((p / 12) * 360 + settings.hueOffset) % 360 + 360) % 360, settings.saturation, settings.lightness * (1 - settings.intensityToBrightness * (1 - i)));
  return {
    settings,
    freq: (hz, i) => pc(((12 * Math.log2(Math.max(hz, 1) / settings.a4) + 9) % 12 + 12) % 12, i),
    pitchClass: pc,
    norm: (t, i) => pc(t * 12, i),
    css: (c, a = 1) => `rgba(${(c[0] * 255) | 0},${(c[1] * 255) | 0},${(c[2] * 255) | 0},${a})`,
    hex: (c) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join(''),
  };
}
