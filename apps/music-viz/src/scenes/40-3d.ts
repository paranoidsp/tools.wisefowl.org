/** Sound in space: three.js showcases. */
import type { Scene } from '../core/types';

const scenes: Scene[] = [
  {
    id: 'solar-wind',
    name: 'Solar Wind',
    description: 'The spectrum scrolls toward you as a landscape: frequency runs across, time runs into the distance, energy is height, and colour is folded light.',
    tags: ['3d', 'spectrum', 'terrain', 'light-octave'],
    layers: [
      { vizId: 'spectrum-terrain', name: 'Terrain' },
    ],
    color: { mode: 'light-octave', saturation: 0.95, lightness: 0.55 },
    post: { background: '#04050a', glow: 0.35, glowRadius: 16, vignette: 0.5 },
  },
  {
    id: 'neon-canyon',
    name: 'Neon Canyon',
    description: 'A mirrored wireframe valley with the bass down the middle and treble climbing both walls, in synthwave register colours.',
    tags: ['3d', 'terrain', 'gradient', 'spectrum'],
    layers: [
      { vizId: 'spectrum-terrain', name: 'Canyon', params: { mode: 'wire', mirror: true, columns: 80, rows: 160, scroll: 45, height: 3.2, width: 14, depth: 26, camElevation: 9, camDistance: 9, camFov: 70, camTargetZ: -0.3, lineOpacity: 0.85, fog: 0.3, colorBy: 'frequency' },
        modulations: { camDistance: { source: 'bass', amount: -0.06, smooth: 0.6 } } },
    ],
    color: {
      mode: 'gradient',
      gradient: [ { pos: 0, color: '#2b0a4d' }, { pos: 0.45, color: '#ff2fa0' }, { pos: 0.75, color: '#ff9e3d' }, { pos: 1, color: '#3df5ff' } ],
      saturation: 1,
      lightness: 0.5,
    },
    post: { background: '#0a0414', glow: 0.5, glowRadius: 14, vignette: 0.45 },
  },
  {
    id: 'harmonic-orbits',
    name: 'Harmonic Orbits',
    description: 'The fundamental is a sun and each harmonic a planet orbiting at a radius set by its number, sized by its amplitude and coloured by its own frequency.',
    tags: ['3d', 'harmonics', 'space'],
    layers: [
      { vizId: 'harmonic-orbits', name: 'Orbits', params: { orbitLaw: 'kepler', orbitSpeed: 40, tilt: 8, trail: 0.55 } },
    ],
    color: { mode: 'light-octave', saturation: 0.95, lightness: 0.58 },
    post: { background: '#03040a', glow: 0.45, glowRadius: 18, vignette: 0.5 },
  },
  {
    id: 'fifths-tower',
    name: 'Fifths Tower',
    description: 'A helix of pitch, one turn per octave, ordered by the circle of fifths so consonant notes stand next to each other as they rise.',
    tags: ['3d', 'pitch', 'fifths-hue', 'harmony'],
    layers: [
      { vizId: 'pitch-helix', name: 'Helix', params: { order: 'fifths', layout: 'helix', labels: true } },
    ],
    color: { mode: 'fifths-hue', saturation: 0.9, lightness: 0.56 },
    post: { background: '#06070b', glow: 0.35, vignette: 0.45 },
  },
  {
    id: 'shepard-cone',
    name: 'Shepard Cone',
    description: 'Pitch as a cone seen from above: angle is pitch class, distance from the centre is octave, and Scriabin’s colours mark the keys.',
    tags: ['3d', 'pitch', 'scriabin'],
    layers: [
      { vizId: 'pitch-helix', name: 'Cone', params: { layout: 'cone' } },
    ],
    color: { mode: 'scriabin', saturation: 1, lightness: 0.52 },
    post: { background: '#07060a', glow: 0.4, vignette: 0.45 },
  },
  {
    id: 'galaxy',
    name: 'Particle Galaxy',
    description: 'A spiral galaxy of particles with the bass in its core and treble in its outer arms; bands push the stars outward and beats burst through it.',
    tags: ['3d', 'particles', 'beats', 'gradient'],
    layers: [
      { vizId: 'particle-galaxy', name: 'Galaxy', params: { colorBy: 'palette' } },
    ],
    color: { mode: 'gradient', gradient: [ { pos: 0, color: '#ffd6a0' }, { pos: 0.35, color: '#ff6fa8' }, { pos: 0.7, color: '#6a5cff' }, { pos: 1, color: '#7fe8ff' } ] },
    post: { background: '#020308', glow: 0.5, glowRadius: 20, vignette: 0.55 },
  },
  {
    id: 'helix-over-warp',
    name: 'Helix in the Aurora',
    description: 'A pitch helix, one turn per octave, floats over a domain-warped aurora whose folds light up with the bands and swell on the bass.',
    tags: ['3d', 'pitch', 'shader', 'layered'],
    layers: [
      { vizId: 'spectral-tunnel', name: 'Aurora', opacity: 0.6, params: { mode: 'warp', warp: 2.6, scale: 1.1, gain: 1.8, base: 0.15, gamma: 1.1, rings: 0.6, ringGlow: 0.8, colorBy: 'palette', resolution: 0.6 } },
      { vizId: 'pitch-helix', name: 'Helix', params: { layout: 'helix', labels: false } },
    ],
    color: {
      mode: 'pitch-hue',
      hueOffset: 200,
      saturation: 0.85,
      lightness: 0.56,
      gradient: [ { pos: 0, color: '#06121f' }, { pos: 0.3, color: '#0f7b6c' }, { pos: 0.6, color: '#64f0a0' }, { pos: 0.85, color: '#b78cff' }, { pos: 1, color: '#ffd6ff' } ],
    },
    post: { background: '#020406', glow: 0.35, vignette: 0.5 },
  },
  {
    id: 'mandala-vortex',
    name: 'Mandala Vortex',
    description: 'Seen from straight above, the fundamental is a blob ringed by its orbiting harmonics, over a vinyl vortex in which radius is frequency and the past swirls outward.',
    tags: ['3d', 'harmonics', 'shader', 'layered'],
    layers: [
      { vizId: 'spectral-tunnel', name: 'Vortex', opacity: 0.75, params: { mode: 'vortex', twist: 1.5, spin: 0.05, rows: 200, scroll: 40, gain: 1.6, gamma: 1.3, ringGlow: 0.6, fade: 0.3, colorBy: 'palette' } },
      {
        vizId: 'harmonic-orbits',
        name: 'Mandala',
        params: { count: 12, spacing: 'log', radius: 7, tilt: 0, precession: 0, orbitLaw: 'locked', orbitSpeed: 25, ringOpacity: 0.9, trail: 0.85, size: 0.32, camElevation: 89, camDistance: 15, camSpeed: 0, camSway: 0, shock: 0.8, halo: 4 },
        modulations: { orbitSpeed: { source: 'loudness', amount: 0.15, smooth: 0.5 } },
      },
    ],
    color: {
      mode: 'light-octave',
      saturation: 0.95,
      lightness: 0.56,
      gradient: [ { pos: 0, color: '#2b0a4d' }, { pos: 0.45, color: '#ff2fa0' }, { pos: 0.75, color: '#ff9e3d' }, { pos: 1, color: '#3df5ff' } ],
    },
    post: { background: '#030308', glow: 0.4, glowRadius: 18, vignette: 0.5 },
  },
  {
    id: 'hyperspace',
    name: 'Kaleido Hyperspace',
    description: 'Fly down a six-fold mirrored tunnel: frequency runs around the walls, time runs along them, and every beat fires a ring of light toward you.',
    tags: ['3d', 'shader', 'beats', 'gradient'],
    layers: [
      { vizId: 'spectral-tunnel', name: 'Tunnel', params: { symmetry: 6, twist: 3.2, speed: 1, spin: -0.04, depth: 0.35, ringGlow: 0.9, rings: 1.6, colorBy: 'palette', gamma: 1.3 }, modulations: { twist: { source: 'bass', amount: 0.08, smooth: 0.6 } } },
    ],
    color: {
      mode: 'gradient',
      gradient: [ { pos: 0, color: '#2b0a4d' }, { pos: 0.45, color: '#ff2fa0' }, { pos: 0.75, color: '#ff9e3d' }, { pos: 1, color: '#3df5ff' } ],
    },
    post: { background: '#020406', glow: 0.3, vignette: 0.5 },
  },
];

export default scenes;
