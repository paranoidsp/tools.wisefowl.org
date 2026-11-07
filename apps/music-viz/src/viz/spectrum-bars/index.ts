/**
 * Reference visualization — the simplest possible example of the contract.
 * Classic spectrum bars, coloured by the global colour mapping.
 */
import type { VizDefinition } from '../../core/types';

const viz: VizDefinition = {
  id: 'spectrum-bars',
  name: 'Spectrum Bars',
  description: 'The classic: one bar per perceptual band, height = energy, colour = the band’s frequency through the global colour mapping.',
  renderer: 'canvas2d',
  space: '2d',
  tags: ['classic', 'spectrum'],
  params: [
    { key: 'gap', label: 'Gap', type: 'number', min: 0, max: 0.9, step: 0.01, default: 0.25, group: 'Shape' },
    { key: 'height', label: 'Height', type: 'number', min: 0.1, max: 1, step: 0.01, default: 0.7, group: 'Shape' },
    { key: 'radius', label: 'Corner radius', type: 'number', min: 0, max: 20, step: 0.5, default: 3, unit: 'px', group: 'Shape' },
    { key: 'mirror', label: 'Mirror vertically', type: 'boolean', default: false, group: 'Shape' },
    {
      key: 'anchor', label: 'Anchor', type: 'select', default: 'bottom', group: 'Shape',
      options: [ { value: 'bottom', label: 'Bottom' }, { value: 'center', label: 'Centre' } ],
    },
    { key: 'colorBy', label: 'Colour by', type: 'select', default: 'freq', group: 'Colour',
      options: [ { value: 'freq', label: 'Frequency' }, { value: 'level', label: 'Level' } ] },
    { key: 'alpha', label: 'Opacity', type: 'number', min: 0.1, max: 1, step: 0.01, default: 0.95, group: 'Colour' },
  ],
  presets: [
    { name: 'Classic', params: {} },
    { name: 'Mirrored skyline', params: { mirror: true, anchor: 'center', gap: 0.1, height: 0.45 } },
  ],
  create(canvas) {
    const ctx = canvas.getContext('2d')!;
    return {
      render({ width, height, audio, params, color }) {
        const bands = audio.bands;
        const n = bands.length;
        if (!n) return;
        const slot = width / n;
        const bw = Math.max(1, slot * (1 - (params.gap as number)));
        const maxH = height * (params.height as number);
        const mirror = params.mirror as boolean;
        const center = params.anchor === 'center';
        const r = params.radius as number;
        const alpha = params.alpha as number;
        for (let i = 0; i < n; i++) {
          const v = bands[i];
          const h = Math.max(1, v * maxH * (mirror ? 0.5 : 1));
          const rgb = params.colorBy === 'level' ? color.norm(v, v) : color.freq(audio.bandFreqs[i], v);
          ctx.fillStyle = color.css(rgb, alpha);
          const x = i * slot + (slot - bw) / 2;
          const base = center ? height / 2 : height;
          ctx.beginPath();
          if (mirror) ctx.roundRect(x, base - h, bw, h * 2, r);
          else ctx.roundRect(x, center ? base - h / 2 : base - h, bw, h, r);
          ctx.fill();
        }
      },
    };
  },
};

export default viz;
