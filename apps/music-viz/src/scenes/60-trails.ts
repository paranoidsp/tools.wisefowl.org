/** Feedback and trails: time smeared into space. */
import type { Scene } from '../core/types';

const scenes: Scene[] = [
  {
    id: 'comet-beats',
    name: 'Comet Beats',
    description: 'Every beat throws out a burst of particles that leave long trails, so the rhythm piles up as streaks of colour.',
    tags: ['beats', 'particles', 'trails'],
    layers: [
      { vizId: 'beat-particles', name: 'Particles', feedback: 0.78, opacity: 0.9, params: { colorBy: 'peak' } },
    ],
    color: { mode: 'light-octave', saturation: 0.95, lightness: 0.58 },
    post: { background: '#030307', glow: 0.2, glowRadius: 14, vignette: 0.45 },
  },
  {
    id: 'long-exposure',
    name: 'Long Exposure',
    description: 'Harmonic rings with heavy feedback and a slight rotation, so each phrase leaves a fading spirograph of its harmonics.',
    tags: ['trails', 'harmonics', 'feedback'],
    layers: [
      { vizId: 'harmonic-bloom', name: 'Bloom', feedback: 0.82, opacity: 0.75, transform: { x: 0, y: 0, scale: 1, rotation: 0 }, params: { style: 'line', thickness: 1.5, lobes: 0.6, spin: 1.2, halo: 0.05, blobSize: 0.08, brightness: 0.6 } },
    ],
    color: { mode: 'fifths-hue', saturation: 0.9, lightness: 0.56 },
    post: { background: '#040406', glow: 0.15, vignette: 0.5 },
  },
  {
    id: 'phosphor-lissajous',
    name: 'Phosphor',
    description: 'A Lissajous oscilloscope on a glowing, decaying screen, coloured by the dominant pitch: an old CRT that follows the melody.',
    tags: ['trails', 'waveform', 'retro'],
    layers: [
      { vizId: 'oscilloscope', name: 'Scope', feedback: 0.72, opacity: 0.85, params: { mode: 'lissajous', colorBy: 'pitch' } },
    ],
    color: { mode: 'pitch-hue', hueOffset: 120, saturation: 0.85, lightness: 0.58 },
    post: { background: '#010402', glow: 0.25, glowRadius: 10, vignette: 0.55, grain: 0.12 },
  },
  {
    id: 'smoke-ribbons',
    name: 'Smoke Ribbons',
    description: 'Flow ribbons steered by the spectrum leave smoky trails that drift with the music’s brightness.',
    tags: ['trails', 'flow', 'gradient'],
    layers: [
      { vizId: 'flow-ribbons', name: 'Ribbons', feedback: 0.8, opacity: 0.7 },
    ],
    color: {
      mode: 'gradient',
      gradient: [ { pos: 0, color: '#02060f' }, { pos: 0.35, color: '#0b3d6b' }, { pos: 0.7, color: '#1fb5c9' }, { pos: 1, color: '#e2fff8' } ],
    },
    post: { background: '#02040a', glow: 0.15, vignette: 0.5 },
  },
  {
    id: 'morphing-shapes',
    name: 'Shape Shifter',
    description: 'Shapes that morph with timbre and pulse on beats, mirrored into a slow kaleidoscope by feedback.',
    tags: ['beats', 'shape', 'trails'],
    layers: [
      { vizId: 'shape-morph', name: 'Morph', feedback: 0.6 },
    ],
    color: { mode: 'scriabin', saturation: 0.95, lightness: 0.55 },
    post: { background: '#06050a', glow: 0.4, vignette: 0.45 },
  },
  {
    id: 'spiral-trails',
    name: 'Spiral Memory',
    description: 'A pitch spiral with long feedback, so recent melody stays visible as fading light along the turns.',
    tags: ['trails', 'pitch', 'spiral', 'light-octave'],
    layers: [
      { vizId: 'pitch-spiral', name: 'Spiral', feedback: 0.7, params: { labels: false, guides: 0.25 } },
    ],
    color: { mode: 'light-octave', saturation: 0.95, lightness: 0.56 },
    post: { background: '#040408', glow: 0.4, vignette: 0.45 },
  },
];

export default scenes;
