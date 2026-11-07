/** Restrained, mostly monochrome looks. */
import type { Scene } from '../core/types';

const MONO = [ { pos: 0, color: '#050506' }, { pos: 1, color: '#f4f5f8' } ];

const scenes: Scene[] = [
  {
    id: 'unknown-pleasures',
    name: 'Unknown Pleasures',
    description: 'The spectrum’s recent history as stacked hidden-line ridges in monochrome, like the pulsar plot on a famous record sleeve: shape alone, no hue.',
    tags: ['minimal', 'monochrome', '3d', 'spectrum'],
    layers: [
      { vizId: 'spectrum-terrain', name: 'Ridges', params: { mode: 'ridges', wireStyle: 'rows', columns: 128, rows: 72, scroll: 18, height: 2.2, curve: 1.8, lineOpacity: 0.95, camElevation: 34, camDistance: 12, fog: 0.6, baseBrightness: 0.35, brightness: 1.3, width: 9, depth: 13, colorBy: 'height' } },
    ],
    color: { mode: 'gradient', gradient: MONO, saturation: 0, lightness: 0.5 },
    post: { background: '#000000', glow: 0.12, vignette: 0.35, grain: 0.15 },
  },
  {
    id: 'ink-and-gold',
    name: 'Ink & Gold',
    description: 'Thin harmonic rings drawn as one warm line colour on near-black; only their size, spacing and wobble carry the sound.',
    tags: ['minimal', 'harmonics', 'monochrome'],
    layers: [
      { vizId: 'harmonic-bloom', name: 'Rings', params: { style: 'line', colorBy: 'mono', monoColor: '#ffcf70', rings: 12, thickness: 2, lobes: 0.4, halo: 0.25, additive: true } },
    ],
    color: { mode: 'gradient', gradient: [ { pos: 0, color: '#0a0b10' }, { pos: 0.6, color: '#3a3f52' }, { pos: 1, color: '#ffcf70' } ] },
    post: { background: '#08080a', glow: 0.3, glowRadius: 10, vignette: 0.5, grain: 0.08 },
  },
  {
    id: 'silver-scope',
    name: 'Silver Scope',
    description: 'A bare oscilloscope trace with a little phosphor persistence, the waveform itself in grey on black.',
    tags: ['minimal', 'monochrome', 'waveform', 'trails'],
    layers: [
      { vizId: 'oscilloscope', name: 'Scope', feedback: 0.6, params: { colorBy: 'mono', monoColor: '#d8dce6', glow: 0.4 } },
    ],
    color: { mode: 'gradient', gradient: MONO, saturation: 0 },
    post: { background: '#000000', glow: 0.35, glowRadius: 8, vignette: 0.4 },
  },
  {
    id: 'blueprint',
    name: 'Blueprint',
    description: 'Thin mirrored bars in a single cold blue, so the shape of the spectrum carries everything.',
    tags: ['minimal', 'spectrum', 'monochrome'],
    layers: [
      { vizId: 'spectrum-bars', name: 'Bars', params: { mirror: true, anchor: 'center', gap: 0.55, height: 0.5, radius: 6, colorBy: 'level' } },
    ],
    color: { mode: 'gradient', gradient: [ { pos: 0, color: '#0a0f24' }, { pos: 0.5, color: '#5d7cff' }, { pos: 1, color: '#f0f6ff' } ], intensityToBrightness: 0.3 },
    post: { background: '#060914', glow: 0.25, vignette: 0.45 },
  },
];

export default scenes;
