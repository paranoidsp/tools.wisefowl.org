/** Honest, low-effect views for checking what the analysis actually sees (try a sine sweep). */
import type { Scene } from '../core/types';

const scenes: Scene[] = [
  {
    id: 'calibration-spectrogram',
    name: 'Calibration: Spectrogram',
    description: 'A scrolling spectrogram above the raw waveform with no glow or trails; play a sine sweep and the line should climb smoothly through every colour.',
    tags: ['calibration', 'spectrum', 'minimal'],
    layers: [
      { vizId: 'spectrogram', name: 'Spectrogram' },
      { vizId: 'oscilloscope', name: 'Waveform', opacity: 0.9, params: { colorBy: 'pitch', glow: 0 }, transform: { x: 0, y: 0.72, scale: 1, rotation: 0 } },
    ],
    color: { mode: 'light-octave', saturation: 0.9, lightness: 0.55, intensityToBrightness: 0.8 },
    analysis: { fftSize: 8192, smoothing: 0.3, featureSmoothing: 0.2 },
    post: { background: '#000000', glow: 0, vignette: 0, trails: 0, grain: 0 },
  },
  {
    id: 'calibration-bands',
    name: 'Calibration: Bands',
    description: 'Fine spectrum bars on a log axis, each painted in its frequency’s colour, for checking band layout, dB range and the colour mapping side by side.',
    tags: ['calibration', 'spectrum', 'classic'],
    layers: [
      { vizId: 'spectrum-bars', name: 'Bands', params: { gap: 0.12, height: 0.85, radius: 1, alpha: 1 } },
    ],
    color: { mode: 'pitch-hue', saturation: 0.9, lightness: 0.55, intensityToBrightness: 0 },
    analysis: { bandCount: 128, smoothing: 0.4 },
    post: { background: '#050608', glow: 0, vignette: 0, trails: 0 },
  },
  {
    id: 'calibration-chroma',
    name: 'Calibration: Chroma',
    description: 'The twelve pitch-class energies with note names and guides; a held note should light one wedge and a chord its few notes.',
    tags: ['calibration', 'chroma', 'harmony'],
    layers: [
      { vizId: 'chroma-wheel', name: 'Chroma', params: { style: 'wedges', labels: true, guides: 0.6, center: true, smoothing: 0.4, chord: 'polygon' } },
    ],
    color: { mode: 'pitch-hue', saturation: 0.85, lightness: 0.55 },
    analysis: { fftSize: 8192 },
    post: { background: '#07080b', glow: 0, vignette: 0.2 },
  },
];

export default scenes;
