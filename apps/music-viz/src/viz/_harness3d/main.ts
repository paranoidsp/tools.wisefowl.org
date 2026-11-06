/**
 * 3D viz dev harness. URL params:
 *   ?viz=<id>&preset=<n>   one layer of that viz (preset index, optional)
 *   &bg=%23ffffff          stage background (test alpha fringes)
 *   &hud=0                 hide the HUD
 *   &stress=<n>            create+dispose every webgl viz n times, report
 *   &p.<key>=<v>          override a param
 *   &perf=<frames>         after warm-up, time n frames → window.__perf
 */
import { Compositor, type CompositorDoc } from '../../core/compositor';
import { DEFAULT_ANALYSIS, DEFAULT_COLOR, DEFAULT_POST, makeLayer } from '../../core/defaults';
import { silent } from '../../audio/engine';
import { VIZ_LIST, getViz } from '../../core/registry';
import type { ColorMode } from '../../core/types';
import { createFakeFeatures } from './fake-features';

const q = new URLSearchParams(location.search);
const w = window as unknown as Record<string, unknown>;
const warnings: string[] = [];
const origWarn = console.warn;
console.warn = (...a: unknown[]) => { warnings.push(a.map(String).join(' ')); origWarn(...a); };
const origErr = console.error;
console.error = (...a: unknown[]) => { warnings.push('ERR ' + a.map(String).join(' ')); origErr(...a); };
w.__warnings = warnings;

const hud = document.getElementById('hud')!;
const stage = document.getElementById('stage')!;
const update = createFakeFeatures();
const t0 = performance.now();
const timeScale = Number(q.get('speed') ?? 1);

async function stress(n: number) {
  const ids = VIZ_LIST.filter((v) => v.renderer === 'webgl').map((v) => v.id);
  for (let r = 0; r < n; r++) {
    for (const id of ids) {
      const def = getViz(id)!;
      const canvas = document.createElement('canvas');
      const inst = def.create(canvas);
      inst.resize?.(320, 200, 1);
      inst.render({ width: 320, height: 200, dpr: 1, time: r, dt: 1 / 60, audio: r % 2 ? update(r) : silent(DEFAULT_ANALYSIS), params: makeLayer(def).params, color: (await import('../../color')).createColorMapper(DEFAULT_COLOR) });
      inst.dispose?.();
      canvas.width = canvas.height = 0;
    }
    await new Promise((r) => setTimeout(r, 0));
  }
  const ctxWarn = warnings.filter((s) => /context/i.test(s));
  w.__stress = { ids, rounds: n, warnings: warnings.slice(), contextWarnings: ctxWarn.length };
  hud.textContent = `stress done: ${ids.length} vizzes × ${n}\ncontext warnings: ${ctxWarn.length}\n${warnings.slice(0, 10).join('\n')}`;
}

if (q.get('stress')) {
  void stress(Number(q.get('stress')));
} else {
  const id = q.get('viz') ?? 'spectrum-terrain';
  const def = getViz(id);
  if (!def) {
    hud.textContent = `unknown viz ${id}. available: ${VIZ_LIST.map((v) => v.id).join(', ')}`;
  } else {
    const preset = q.get('preset');
    const layer = makeLayer(def, {}, preset != null ? Number(preset) : undefined);
    // &p.<key>=<value> overrides individual params
    for (const [k, v] of q) {
      if (!k.startsWith('p.')) continue;
      const key = k.slice(2);
      layer.params[key] = v === 'true' ? true : v === 'false' ? false : isNaN(Number(v)) ? v : Number(v);
    }
    const color = { ...DEFAULT_COLOR, mode: (q.get('color') as ColorMode) ?? DEFAULT_COLOR.mode };
    const doc: CompositorDoc = {
      layers: [layer],
      color,
      post: { ...DEFAULT_POST, background: q.get('bg') ?? DEFAULT_POST.background, glow: Number(q.get('glow') ?? DEFAULT_POST.glow) },
    };
    // &sim=<dt seconds>: deterministic simulated clock (each frame advances dt), &warm=<frames> fast-forwards first
    const sim = Number(q.get('sim') ?? 0);
    let simT = 0;
    const comp = new Compositor(
      { doc: () => doc, features: () => update(sim ? simT : ((performance.now() - t0) / 1000) * timeScale) },
      { maxDpr: 1 },
    );
    comp.mount(stage);
    if (sim) {
      const warm = Number(q.get('warm') ?? 0);
      const step = () => { simT += sim; comp.frame(simT * 1000); };
      for (let i = 0; i < warm; i++) step();
      const loop = () => { step(); requestAnimationFrame(loop); };
      w.__ready = true;
      requestAnimationFrame(loop);
      hud.textContent = q.get('hud') === '0' ? '' : `${def.name} — ${layer.name} (sim)`;
    } else {
    const perfN = Number(q.get('perf') ?? 0);
    if (perfN) {
      // manual frames: warm up 30, then time perfN
      let i = 0;
      const times: number[] = [];
      const step = () => {
        const a = performance.now();
        comp.frame(a);
        const b = performance.now();
        if (i >= 30) times.push(b - a);
        i++;
        if (times.length < perfN) requestAnimationFrame(step);
        else {
          times.sort((x, y) => x - y);
          const avg = times.reduce((s, x) => s + x, 0) / times.length;
          w.__perf = { avg, p50: times[times.length >> 1], p95: times[Math.floor(times.length * 0.95)] };
          hud.textContent = JSON.stringify(w.__perf);
        }
      };
      requestAnimationFrame(step);
    } else {
      comp.start();
      if (q.get('hud') !== '0')
        setInterval(() => {
          hud.textContent = `${def.name} — ${layer.name}\n${comp.stats.fps} fps  ${comp.stats.frameMs.toFixed(2)} ms\n${Object.values(comp.stats.errors).join('\n')}`;
        }, 250);
    }
    }
    w.__ready = true;
  }
}
