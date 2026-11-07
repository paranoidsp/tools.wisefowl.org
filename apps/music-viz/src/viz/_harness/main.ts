/**
 * Dev-only harness for the 2D visualizations (not part of the app build).
 *   /viz-harness.html?viz=harmonic-bloom&preset=1         one tile, 1440×900
 *   /viz-harness.html?sheet=1&viz=harmonic-bloom          every preset of one viz
 *   /viz-harness.html?sheet=1                             every preset of every 2D viz
 * Exposes window.__advance(frames) and window.__perf(frames) for Playwright.
 */
import { createColorMapper } from '../../color';
import { DEFAULT_COLOR, DEFAULT_POST, makeLayer } from '../../core/defaults';
import type { ColorSettings, Layer, Modulation, ParamSpec, ParamValues, VizDefinition, VizInstance, AudioFeatures } from '../../core/types';
import { FakeAudio } from './fakeAudio';
import { syntheticFeatures } from '../../audio/synthetic';
import { DEFAULT_ANALYSIS } from '../../core/defaults';

const q = new URLSearchParams(location.search);
const modules = import.meta.glob<{ default: VizDefinition }>('../*/index.ts');

function modValue(src: string, a: AudioFeatures, t: number): number {
  switch (src) {
    case 'loudness': return a.loudness;
    case 'rms': return a.rms;
    case 'bass': return a.bass;
    case 'mid': return a.mid;
    case 'treble': return a.treble;
    case 'beatPulse': return a.beatPulse;
    case 'flux': return a.flux;
    case 'centroidNorm': return a.centroidNorm;
    case 'pitchNorm': return a.pitch.norm;
    case 'beatPhase': return a.beatPhase;
    case 'lfoSlow': return 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.1 * t);
    case 'lfoFast': return 0.5 + 0.5 * Math.sin(2 * Math.PI * t);
    default: return 0.5 + 0.25 * Math.sin(t * 1.31) + 0.15 * Math.sin(t * 2.97 + 1.3);
  }
}
function applyMods(specs: ParamSpec[], base: ParamValues, mods: Record<string, Modulation>, a: AudioFeatures, t: number, st: Record<string, number>) {
  const out: ParamValues = { ...base };
  for (const key of Object.keys(mods)) {
    const spec = specs.find((s) => s.key === key);
    if (!spec || spec.type !== 'number') continue;
    const m = mods[key];
    const raw = modValue(m.source, a, t);
    const prev = st[key] ?? raw;
    const v = prev + (raw - prev) * (1 - Math.min(0.99, m.smooth));
    st[key] = v;
    const b = (base[key] as number) ?? spec.default;
    out[key] = Math.min(spec.max, Math.max(spec.min, b + m.amount * (spec.max - spec.min) * v));
  }
  return out;
}

interface Tile { def: VizDefinition; layer: Layer; inst: VizInstance; out: HTMLCanvasElement; octx: CanvasRenderingContext2D; lc: HTMLCanvasElement; lctx: CanvasRenderingContext2D; w: number; h: number; st: Record<string, number>; ms: number[] }

const color: ColorSettings = { ...DEFAULT_COLOR, mode: (q.get('mode') as ColorSettings['mode']) ?? DEFAULT_COLOR.mode };
const mapper = createColorMapper(color);
const fake = new FakeAudio();
const dpr = 1;
const glow = Number(q.get('glow') ?? DEFAULT_POST.glow);
const feedback = Number(q.get('feedback') ?? 0);
let t = Number(q.get('t') ?? 4);
const tiles: Tile[] = [];
const flush = q.get('flush') === '1';

function makeTile(def: VizDefinition, presetIdx: number, w: number, h: number) {
  const layer = makeLayer(def, { feedback }, def.presets?.length ? presetIdx : undefined);
  for (const [k, v] of q.entries()) {
    if (!k.startsWith('p.')) continue;
    layer.params[k.slice(2)] = v === 'true' ? true : v === 'false' ? false : isNaN(Number(v)) ? v : Number(v);
  }
  const wrap = document.createElement('div');
  wrap.className = 'tile';
  const out = document.createElement('canvas');
  out.width = w * dpr; out.height = h * dpr;
  out.style.width = `${w}px`; out.style.height = `${h}px`;
  const label = document.createElement('span');
  label.textContent = `${def.id} · ${def.presets?.[presetIdx]?.name ?? 'default'}`;
  wrap.append(out);
  if (q.get('labels') !== '0') wrap.append(label);
  document.getElementById('root')!.append(wrap);
  const lc = document.createElement('canvas');
  lc.width = w * dpr; lc.height = h * dpr;
  const lctx = lc.getContext('2d')!;
  const inst = def.create(lc);
  inst.resize?.(w, h, dpr);
  tiles.push({ def, layer, inst, out, octx: out.getContext('2d')!, lc, lctx, w, h, st: {}, ms: [] });
}

function renderTile(tl: Tile, audio: AudioFeatures, dt: number) {
  const c = tl.lctx;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1;
  c.filter = 'none';
  if (tl.layer.feedback > 0) {
    c.globalCompositeOperation = 'destination-out';
    c.fillStyle = `rgba(0,0,0,${1 - tl.layer.feedback})`;
    c.fillRect(0, 0, tl.lc.width, tl.lc.height);
  } else c.clearRect(0, 0, tl.lc.width, tl.lc.height);
  c.globalCompositeOperation = 'source-over';
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.save();
  const params = applyMods(tl.def.params, tl.layer.params, tl.layer.modulations, audio, t, tl.st);
  const t0 = performance.now();
  tl.inst.render({ width: tl.w, height: tl.h, dpr, time: t, dt, audio, params, color: mapper });
  if (flush) c.getImageData(0, 0, 1, 1); // force rasterisation into the timing
  tl.ms.push(performance.now() - t0);
  c.restore();
  const o = tl.octx;
  o.globalCompositeOperation = 'source-over';
  o.fillStyle = DEFAULT_POST.background;
  o.fillRect(0, 0, tl.out.width, tl.out.height);
  o.drawImage(tl.lc, 0, 0);
  if (glow > 0) {
    o.save();
    o.globalCompositeOperation = 'screen';
    o.globalAlpha = glow;
    o.filter = `blur(${DEFAULT_POST.glowRadius}px) brightness(1.15)`;
    o.drawImage(tl.out, 0, 0);
    o.restore();
  }
}

function advance(frames: number) {
  for (let i = 0; i < frames; i++) {
    t += 1 / 60;
    const a = q.get('audio') === 'synth' ? syntheticFeatures(t, DEFAULT_ANALYSIS) : fake.step(t);
    for (const tl of tiles) renderTile(tl, a, 1 / 60);
  }
}

async function main() {
  const want = q.get('viz');
  const defs: VizDefinition[] = [];
  for (const [path, load] of Object.entries(modules)) {
    const id = path.split('/')[1];
    if (want && !want.split(',').includes(id)) continue;
    try {
      const m = await load();
      if (m.default && m.default.renderer === 'canvas2d') defs.push(m.default);
    } catch (e) { console.error('load failed', path, e); }
  }
  defs.sort((a, b) => a.id.localeCompare(b.id));
  if (q.get('sheet')) {
    const tw = Number(q.get('tw') ?? 480), th = Number(q.get('th') ?? 300);
    for (const d of defs) {
      const n = Math.max(1, d.presets?.length ?? 0);
      for (let p = 0; p < n; p++) makeTile(d, p, tw, th);
    }
  } else {
    const w = Number(q.get('w') ?? 1440), h = Number(q.get('h') ?? 900);
    for (const d of defs) makeTile(d, Number(q.get('preset') ?? 0), w, h);
  }
  (window as any).__advance = (n: number) => { advance(n); return true; };
  (window as any).__perf = (n: number) => {
    for (const tl of tiles) tl.ms.length = 0;
    advance(n);
    return tiles.map((tl) => {
      const s = [...tl.ms].sort((a, b) => a - b);
      return { id: tl.def.id, preset: tl.layer.name, avg: s.reduce((a, b) => a + b, 0) / s.length, p95: s[Math.floor(s.length * 0.95)] };
    });
  };
  (window as any).__ready = true;
  if (q.get('live')) { const loop = () => { advance(1); requestAnimationFrame(loop); }; loop(); }
}
main();
