/** The default scene: the representative "primary blob + harmonic rings" idea in folded-light colour. */
import type { Scene } from '../core/types';

const scenes: Scene[] = [
  {
    id: 'harmonic-bloom',
    name: 'Harmonic Bloom',
    description: 'The fundamental is a glowing blob and its harmonics are rings around it, each coloured by folding its frequency ~40 octaves up into visible light.',
    tags: ['featured', 'harmonics', 'light-octave', 'glow'],
    layers: [
      { vizId: 'radial-spectrum', name: 'Spectrum halo', opacity: 0.3, blend: 'screen', transform: { x: 0, y: 0, scale: 1.18, rotation: 0 } },
      { vizId: 'harmonic-bloom', name: 'Bloom', params: { rings: 10, softness: 0.6, halo: 0.4, brightness: 0.7 } },
    ],
    color: { mode: 'light-octave', saturation: 0.92, lightness: 0.56, intensityToBrightness: 0.7 },
    post: { background: '#05060a', glow: 0.22, glowRadius: 16, vignette: 0.5, trails: 0.1 },
  },
];

export default scenes;
