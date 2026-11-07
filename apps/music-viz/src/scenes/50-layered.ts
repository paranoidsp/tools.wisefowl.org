/** Layer stacks that lean on blend modes. */
import type { Scene } from '../core/types';

const scenes: Scene[] = [
  {
    id: 'difference-engine',
    name: 'Difference Engine',
    description: 'A chroma wheel in difference mode over a mirrored skyline: wherever the two overlap the colours invert, so harmony and spectrum cut into each other.',
    tags: ['layered', 'blend', 'chroma', 'spectrum'],
    layers: [
      { vizId: 'spectrum-bars', name: 'Skyline', params: { mirror: true, anchor: 'center', gap: 0.05, height: 0.7, radius: 0 } },
      { vizId: 'chroma-wheel', name: 'Wheel', blend: 'difference', params: { style: 'wedges', inner: 0.1, outer: 0.95, chord: 'none', labels: false, guides: 0 } },
    ],
    color: { mode: 'pitch-hue', hueOffset: 200, saturation: 0.9, lightness: 0.55 },
    post: { background: '#000000', glow: 0.15, vignette: 0.35 },
  },
  {
    id: 'additive-light',
    name: 'Additive Light',
    description: 'Harmonic rings and 3D orbits added together like beams of light, so where partials coincide they burn toward white.',
    tags: ['layered', 'blend', 'harmonics', '3d', 'glow'],
    layers: [
      { vizId: 'harmonic-orbits', name: 'Orbits', opacity: 0.85, params: { harmColor: 'partial' } },
      { vizId: 'harmonic-bloom', name: 'Bloom', blend: 'lighter', opacity: 0.8, params: { style: 'band', spacing: 'wavelength', rings: 12, softness: 0.9 } },
    ],
    color: { mode: 'light-octave', saturation: 0.95, lightness: 0.5, intensityToBrightness: 0.6 },
    post: { background: '#020306', glow: 0.55, glowRadius: 22, vignette: 0.55 },
  },
  {
    id: 'prism',
    name: 'Prism',
    description: 'A radial spectrum and flowing ribbons screened together over a soft chroma wheel: three readings of the same sound in one light.',
    tags: ['layered', 'blend', 'radial', 'flow'],
    layers: [
      { vizId: 'chroma-wheel', name: 'Chroma', opacity: 0.45, params: { style: 'petals', labels: false, chord: 'none', guides: 0 } },
      { vizId: 'radial-spectrum', name: 'Radial', blend: 'screen' },
      { vizId: 'flow-ribbons', name: 'Ribbons', blend: 'screen', opacity: 0.8, params: { style: 'silk' } },
    ],
    color: { mode: 'fifths-hue', hueOffset: 30, saturation: 0.9, lightness: 0.55 },
    post: { background: '#06060a', glow: 0.4, vignette: 0.45 },
  },
  {
    id: 'harmonic-field',
    name: 'Harmonic Field',
    description: 'A frequency field fills the stage while a harmonic bloom overlays its centre in soft light, giving fundamental, partials and spectrum in one picture.',
    tags: ['layered', 'blend', 'harmonics', 'field'],
    layers: [
      { vizId: 'frequency-field', name: 'Field', opacity: 0.8 },
      { vizId: 'harmonic-bloom', name: 'Bloom', blend: 'screen', opacity: 0.7, params: { rings: 8, brightness: 0.7, halo: 0.3 } },
    ],
    color: { mode: 'scriabin', saturation: 0.95, lightness: 0.52 },
    post: { background: '#050508', glow: 0.35, vignette: 0.45 },
  },
];

export default scenes;
