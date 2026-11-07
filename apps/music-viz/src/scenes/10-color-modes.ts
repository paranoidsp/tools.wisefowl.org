/** One scene per colour-mapping idea: the mapping is the point. */
import type { Scene } from '../core/types';

const scenes: Scene[] = [
  {
    id: 'scriabin-clavier',
    name: 'Scriabin’s Clavier',
    description: 'Each sounding note lights up a petal in the colour Scriabin assigned to it in Prometheus, with the harmonics blooming behind.',
    tags: ['scriabin', 'chroma', 'history'],
    layers: [
      { vizId: 'harmonic-bloom', name: 'Bloom', opacity: 0.55, params: { colorBy: 'fundamental', rings: 6, blobSize: 0.18, halo: 0.8 } },
      { vizId: 'chroma-wheel', name: 'Clavier', blend: 'screen', params: { style: 'petals', chord: 'polygon', labels: true, guides: 0.25 } },
    ],
    color: { mode: 'scriabin', saturation: 1, lightness: 0.5 },
    post: { background: '#07060a', glow: 0.4, glowRadius: 16, vignette: 0.45 },
  },
  {
    id: 'circle-of-fifths',
    name: 'Circle of Fifths',
    description: 'Notes a fifth apart sit side by side, in both position and hue, so a key becomes a single arc of related colour and chords become compact shapes.',
    tags: ['fifths-hue', 'harmony', 'chroma'],
    layers: [
      { vizId: 'chroma-wheel', name: 'Fifths wheel', params: { order: 'fifths', style: 'wedges', chord: 'polygon', chordFill: 0.4, inner: 0.34 } },
    ],
    color: { mode: 'fifths-hue', hueOffset: 0, saturation: 0.85, lightness: 0.55 },
    post: { background: '#08090c', glow: 0.25, vignette: 0.35 },
  },
  {
    id: 'newton-opticks',
    name: 'Newton’s Opticks',
    description: 'Newton’s seven spectral colours laid on the Dorian scale (D red … C violet), painted onto a mirrored skyline of frequency bands.',
    tags: ['newton', 'spectrum', 'history', 'classic'],
    layers: [
      { vizId: 'spectrum-bars', name: 'Skyline', params: { mirror: true, anchor: 'center', gap: 0.18, height: 0.62, radius: 2 } },
    ],
    color: { mode: 'newton', saturation: 0.95, lightness: 0.52, intensityToBrightness: 0.7 },
    post: { background: '#09080b', glow: 0.35, glowRadius: 12, vignette: 0.4 },
  },
  {
    id: 'spectral-register',
    name: 'Spectral Register',
    description: 'Colour follows register, not pitch class: low frequencies are deep blue and highs run to red, so you can see where in the range the energy sits.',
    tags: ['spectral', 'spectrum', 'calibration'],
    layers: [
      { vizId: 'spectrogram', name: 'Spectrogram', opacity: 0.85 },
      { vizId: 'spectrum-bars', name: 'Bars', blend: 'screen', params: { gap: 0.35, height: 0.5, radius: 4, alpha: 0.9 } },
    ],
    color: { mode: 'spectral', hueStart: 250, hueEnd: 10, saturation: 0.9, lightness: 0.55 },
    post: { background: '#06070a', glow: 0.2, vignette: 0.3 },
  },
  {
    id: 'light-spiral',
    name: 'Octaves of Light',
    description: 'Pitch laid out as a spiral with one turn per octave: every note at the same angle is the same pitch class and so the same folded-light colour.',
    tags: ['light-octave', 'pitch', 'spiral'],
    layers: [
      { vizId: 'pitch-spiral', name: 'Pitch spiral' },
    ],
    color: { mode: 'light-octave', saturation: 0.95, lightness: 0.55 },
    post: { background: '#05060a', glow: 0.4, glowRadius: 14, vignette: 0.45 },
  },
  {
    id: 'chromatic-mandala',
    name: 'Chromatic Mandala',
    description: 'A plain pitch-to-hue wheel, C at red and each semitone 30° further on, drawn as a slowly turning mandala over a radial spectrum.',
    tags: ['pitch-hue', 'chroma', 'radial'],
    layers: [
      { vizId: 'radial-spectrum', name: 'Radial spectrum', opacity: 0.6, params: { style: 'rays', symmetry: '6' } },
      { vizId: 'chroma-wheel', name: 'Mandala', blend: 'lighter', params: { style: 'rays', chord: 'web', spin: 6, labels: false, guides: 0.15 } },
    ],
    color: { mode: 'pitch-hue', hueOffset: 0, saturation: 0.9, lightness: 0.55 },
    post: { background: '#07070a', glow: 0.35, vignette: 0.4 },
  },
  {
    id: 'gradient-heat',
    name: 'Magma Bands',
    description: 'Register to a perceptual heat-map gradient: bass glows a dark ember and treble burns pale yellow, with brightness tracking loudness.',
    tags: ['gradient', 'spectrum', 'classic'],
    layers: [
      { vizId: 'spectrum-bars', name: 'Bars', params: { gap: 0.08, height: 0.78, radius: 0 } },
    ],
    color: {
      mode: 'gradient',
      saturation: 1,
      lightness: 0.5,
      intensityToBrightness: 0.75,
      gradient: [
        { pos: 0, color: '#000004' }, { pos: 0.25, color: '#3b0f70' }, { pos: 0.5, color: '#8c2981' }, { pos: 0.75, color: '#fe9f6d' }, { pos: 1, color: '#fcfdbf' },
      ],
    },
    post: { background: '#040306', glow: 0.3, vignette: 0.35 },
  },
];

export default scenes;
