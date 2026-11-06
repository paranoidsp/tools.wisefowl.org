/**
 * Procedurally synthesized demo tracks so the studio works with no file and
 * every feature has something to show. Notes are rendered sample-by-sample
 * (dsp.ts), then mixed through a generated convolution reverb + compressor
 * in an OfflineAudioContext. Rendered buffers are cached per id.
 */
import type { DemoTrack } from '../core/engine-api';
import { bank, createMix, finish, noise, seedNoise, voice, type Mix } from './dsp';

export const DEMOS: DemoTrack[] = [
  { id: 'drone', name: 'Harmonic Drone', description: 'Sustained tones whose partials swell and fade slowly. Great for harmonic rings and timbre colour.' },
  { id: 'pulse', name: 'Pulse', description: 'Kick, snare and hats at 120 BPM with a bass line and pad. A beat-detection showcase.' },
  { id: 'arpeggio', name: 'Arpeggio', description: 'Am–F–C–G arpeggios sweeping across three octaves at 100 BPM. Watch pitch and chroma move.' },
  { id: 'sweep', name: 'Sweep', description: 'A sine sweep from 30 Hz to 12 kHz with band-limited noise bursts. Calibrate your frequency mappings.' },
];

const SR = 44100;
const cache = new Map<string, Promise<AudioBuffer>>();

export function renderDemo(id: string): Promise<AudioBuffer> {
  let p = cache.get(id);
  if (!p) {
    const def = TRACKS[id];
    if (!def) return Promise.reject(new Error(`Unknown demo track “${id}”`));
    p = build(def).catch((e) => {
      cache.delete(id);
      throw e;
    });
    cache.set(id, p);
  }
  return p;
}

interface Track {
  duration: number;
  wet?: number;
  /** reverb size 0..1 */
  room?: number;
  build: (m: Mix, rnd: () => number, tick: () => Promise<void>) => Promise<void>;
}

async function build(def: Track): Promise<AudioBuffer> {
  const m = createMix(SR, def.duration);
  const rnd = mulberry32(0x5eed);
  seedNoise(0x9e3779b9);
  let last = performance.now();
  // yield to the event loop every ~25 ms so the UI stays responsive
  const tick = async () => {
    if (performance.now() - last > 20) {
      await new Promise<void>((r) => setTimeout(r, 0));
      last = performance.now();
    }
  };
  await def.build(m, rnd, tick);
  return finish(m, { wet: def.wet, room: def.room, tick });
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

/** Smooth random curve through `n` control points over `len` seconds (cosine interpolated). */
function breathCurve(rnd: () => number, len: number, step: number, lo: number, hi: number) {
  const n = Math.ceil(len / step) + 2;
  const pts = new Float32Array(n);
  for (let i = 0; i < n; i++) pts[i] = lo + (hi - lo) * rnd();
  return (tau: number) => {
    const x = tau / step;
    const i = Math.min(n - 2, Math.floor(x));
    const fr = x - i;
    const w = 0.5 - 0.5 * Math.cos(Math.PI * fr);
    return pts[i] * (1 - w) + pts[i + 1] * w;
  };
}

const TRACKS: Record<string, Track> = {
  // 1. Harmonic Drone — additive voices with slowly breathing partials.
  drone: {
    duration: 44,
    wet: 0.75,
    room: 0.95,
    async build(m, rnd, tick) {
      const sections: [number, number][] = [ [0, 45], [10, 41], [20, 48], [30, 43] ]; // A2 F2 C3 G2
      const len = 14;
      for (const [t0, root] of sections) {
        const voices = [
          { f: midi(root), n: 12, lvl: 1 },
          { f: midi(root + 7), n: 7, lvl: 0.42 },
          { f: midi(root + 16), n: 4, lvl: 0.2 },
        ];
        const dur = Math.min(len, m.n / SR - t0);
        for (const v of voices) {
          // two banks per voice (odd / even partials) panned apart for width
          for (let side = 0; side < 2; side++) {
            const freqs: number[] = [], amps: number[] = [], curves: ((t: number) => number)[] = [];
            for (let k = 1 + side; k <= v.n; k += 2) {
              const fk = v.f * k;
              if (fk > 9000) break;
              const breathe = breathCurve(rnd, dur, 1.3 + rnd() * 1.2, 0.3, 1);
              const hi = k > 2;
              freqs.push(fk * (1 + (rnd() - 0.5) * 0.0012));
              amps.push((v.lvl * 0.13) / Math.pow(k, 0.9));
              curves.push((tau: number) => {
                // section envelope: 3 s fade in / 4 s fade out; upper partials bloom mid-section
                const fade = Math.min(1, tau / 3, Math.max(0, (dur - tau) / 4));
                const mid = Math.sin((Math.PI * tau) / dur);
                const bright = hi ? 0.2 + 0.9 * mid * mid : 1;
                return fade * fade * bright * breathe(tau);
              });
            }
            bank(m, { t: t0, dur, freqs, amps, curves, pan: side ? 0.35 : -0.35, send: 0.7 });
            await tick();
          }
        }
      }
    },
  },

  // 2. Pulse — 120 BPM four-on-the-floor with bass and pad.
  pulse: {
    duration: 34,
    wet: 0.45,
    async build(m, _rnd, tick) {
      const beat = 0.5;
      const bars = 16;
      const roots = [33, 33, 29, 31]; // A1 A1 F1 G1
      const chords = [ [57, 60, 64], [57, 60, 64], [53, 57, 60], [55, 59, 62] ];
      const t0 = 0.05;
      for (let bar = 0; bar < bars; bar++) {
        const tb = t0 + bar * 4 * beat;
        if (bar >= 8) {
          for (const n of chords[bar % 4]) {
            for (const det of [-0.004, 0.004]) {
              voice(m, {
                t: tb, dur: 4 * beat + 0.1, freq: midi(n) * (1 + det), wave: 'saw', amp: 0.05,
                attack: 0.35, release: 0.3, pan: det > 0 ? 0.45 : -0.45, send: 0.6,
                filter: { type: 'lowpass', from: 1200, q: 0.7 },
              });
            }
          }
        }
        for (let q = 0; q < 4; q++) {
          const t = tb + q * beat;
          // kick
          voice(m, { t, dur: 0.45, freq: 165, freqEnd: 48, glide: 0.11, amp: 0.8, attack: 0.002, decay: 0.42, send: 0.04 });
          noise(m, { t, dur: 0.02, amp: 0.25, decay: 0.012, filter: { type: 'highpass', from: 3000, q: 0.7 } }); // click
          // snare on 2 & 4
          if (bar >= 2 && (q === 1 || q === 3)) {
            noise(m, { t, dur: 0.3, amp: 1.1, decay: 0.2, filter: { type: 'bandpass', from: 1900, q: 0.7 }, send: 0.35 });
            voice(m, { t, dur: 0.18, freq: 205, freqEnd: 165, glide: 0.08, wave: 'tri', amp: 0.4, attack: 0.001, decay: 0.12, send: 0.2 });
          }
          // hats on 8ths
          if (bar >= 2) {
            for (let e = 0; e < 2; e++) {
              const open = e === 1 && q === 3 && bar % 2 === 1;
              noise(m, {
                t: t + e * beat * 0.5, dur: open ? 0.35 : 0.08, amp: e ? 0.45 : 0.25, decay: open ? 0.3 : 0.05,
                filter: { type: 'highpass', from: 7500, q: 0.7 }, pan: e ? 0.3 : -0.3, send: 0.15,
              });
            }
          }
          // bass on 8ths
          if (bar >= 4) {
            for (let e = 0; e < 2; e++) {
              const note = roots[bar % 4] + (e === 1 && q % 2 === 1 ? 12 : 0);
              voice(m, {
                t: t + e * beat * 0.5 + 0.005, dur: 0.24, freq: midi(note), wave: 'saw', amp: 0.55,
                attack: 0.004, decay: 0.5, release: 0.04, send: 0.04,
                filter: { type: 'lowpass', from: 1500, to: 200, time: 0.18, q: 4 },
              });
            }
          }
          await tick();
        }
      }
    },
  },

  // 3. Arpeggio — Am F C G, 8th notes at 100 BPM across three octaves, with an echo.
  arpeggio: {
    duration: 40,
    wet: 0.6,
    async build(m, _rnd, tick) {
      const eighth = 0.3;
      const chords = [ [57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62] ];
      const t0 = 0.05;
      let step = 0;
      for (let cycle = 0; cycle < 2; cycle++) {
        for (const ch of chords) {
          const tones: number[] = [];
          for (let oct = -12; oct <= 12; oct += 12) for (const n of ch) tones.push(n + oct);
          const seq = [...tones, ...tones.slice(1, -1).reverse()]; // 9 up + 7 down = 16
          const tc = t0 + step * eighth;
          const span = 16 * eighth;
          voice(m, { t: tc, dur: 2.6, freq: midi(ch[0] - 24), amp: 0.3, attack: 0.02, decay: 2.4, send: 0.2 });
          for (const n of ch) voice(m, { t: tc, dur: span + 0.4, freq: midi(n - 12), amp: 0.03, attack: 0.8, release: 0.6, send: 0.8 });
          for (let i = 0; i < 16; i++) {
            const t = t0 + (step + i) * eighth;
            const f = midi(seq[i]);
            const pan = ((seq[i] - 60) / 24) * 0.7;
            for (let echo = 0; echo < 3; echo++) {
              const g = Math.pow(0.33, echo);
              const o = { t: t + echo * eighth * 1.5, dur: 0.62, amp: 0.3 * g, attack: 0.006, decay: 0.55, pan: echo % 2 ? -pan : pan, send: 0.35 + 0.2 * echo };
              voice(m, { ...o, freq: f, wave: 'tri' });
              voice(m, { ...o, freq: f * 2, amp: o.amp * 0.22 });
            }
          }
          step += 16;
          await tick();
        }
      }
    },
  },

  // 4. Sweep — 30 Hz → 12 kHz exponential sine sweep + band-limited noise bursts.
  sweep: {
    duration: 33,
    wet: 0.3,
    async build(m, _rnd, tick) {
      voice(m, {
        t: 0.5, dur: 30.5, freq: 30, freqEnd: 12000, glide: 30, amp: 0.42, attack: 0.5, release: 0.5, send: 0.06,
        curve: (tau) => (tau < 20 ? 1 : 1 - 0.45 * Math.min(1, (tau - 20) / 10)), // gentler at the top
      });
      await tick();
      const centres = [80, 250, 800, 2500, 8000];
      let i = 0;
      for (let t = 1.5; t < 31; t += 2) {
        const fc = centres[i % centres.length];
        noise(m, { t, dur: 0.4, amp: 1.6, decay: 0.3, filter: { type: 'bandpass', from: fc, q: 2.5 }, pan: i % 2 ? 0.3 : -0.3, send: 0.25 });
        i++;
      }
    },
  },
};
