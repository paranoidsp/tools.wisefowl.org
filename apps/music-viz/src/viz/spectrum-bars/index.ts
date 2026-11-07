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
    { key: 'gap', label: 'Gap', type: 'number', min: 0, max: 0.9, step: 0.01, default: 0.25, group: 'Shape', hint: 'Fraction of each band’s slot left empty between bars. 0 makes a solid skyline; high values give thin needles, which help you pick out single bands.' },
    { key: 'height', label: 'Height', type: 'number', min: 0.1, max: 1, step: 0.01, default: 0.7, group: 'Shape', hint: 'How tall a bar at full energy reaches, as a fraction of the canvas height. Each bar’s height is its band’s loudness on the dB scale set in Analysis.' },
    { key: 'radius', label: 'Corner radius', type: 'number', min: 0, max: 20, step: 0.5, default: 3, unit: 'px', group: 'Shape', hint: 'Rounds the corners of each bar. Purely cosmetic; large values turn narrow bars into pills.' },
    { key: 'mirror', label: 'Mirror vertically', type: 'boolean', default: false, group: 'Shape', hint: 'Grows each bar both up and down from its base line, at half height each way, so the spectrum reads as a symmetric waveform-like shape. Looks best with Anchor = Centre.' },
    {
      key: 'anchor', label: 'Anchor', type: 'select', default: 'bottom', group: 'Shape', hint: 'Where the bars’ base line sits: along the bottom edge or across the middle of the canvas.',
      options: [
        { value: 'bottom', label: 'Bottom', hint: 'Bars stand on the bottom edge, like a classic equaliser display.' },
        { value: 'center', label: 'Centre', hint: 'Bars are centred on the middle line and grow outward from it.' },
      ],
    },
    { key: 'colorBy', label: 'Colour by', type: 'select', default: 'freq', group: 'Colour', hint: 'What decides each bar’s colour: where the band sits in pitch, or how loud it is right now.',
      options: [
        { value: 'freq', label: 'Frequency', hint: 'Each bar takes its band’s centre frequency through the global colour mapping, so colour encodes pitch.' },
        { value: 'level', label: 'Level', hint: 'Colour comes from the band’s energy along the palette, so loud bars and quiet bars differ in colour.' },
      ] },
    { key: 'alpha', label: 'Opacity', type: 'number', min: 0.1, max: 1, step: 0.01, default: 0.95, group: 'Colour', hint: 'How opaque the bars are. Lower values let layers underneath show through, and trails (layer feedback) build up more softly.' },
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
