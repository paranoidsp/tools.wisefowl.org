/**
 * Static thumbnails + one live hover preview for the Gallery.
 *
 * Thumbnails: a queue renders one document at a time in a throwaway
 * off-DOM Compositor (low res, dpr 1) driven by deterministic synthetic
 * audio, then copies the frame into a small canvas kept in memory. Only one
 * compositor (and so at most a couple of WebGL
 * contexts) exists at a time.
 */
import { syntheticFeatures } from '../../audio/synthetic';
import { Compositor, type CompositorDoc } from '../../core/compositor';
import { DEFAULT_ANALYSIS, DEFAULT_COLOR, DEFAULT_POST, makeLayer } from '../../core/defaults';
import { getViz } from '../../core/registry';
import type { AnalysisSettings, AudioFeatures, Layer, Scene, VizDefinition } from '../../core/types';

export const THUMB_W = 320;
export const THUMB_H = 200;
const FRAMES = 60;
const FPS = 30;
/** start the synthetic track a few seconds in, where things are lively */
const T_START = 7.3;
/** per-thumbnail wall-clock budget */
const TIME_BUDGET_MS = 1200;

export interface PreviewDoc extends CompositorDoc {
  analysis: AnalysisSettings;
}

export function sceneDoc(scene: Scene): PreviewDoc {
  const layers: Layer[] = [];
  for (const sl of scene.layers) {
    const def = getViz(sl.vizId);
    if (def) layers.push(makeLayer(def, sl));
  }
  return {
    layers,
    color: { ...DEFAULT_COLOR, ...(scene.color ?? {}) },
    post: { ...DEFAULT_POST, ...(scene.post ?? {}) },
    analysis: { ...DEFAULT_ANALYSIS, ...(scene.analysis ?? {}) },
  };
}

export function vizDoc(def: VizDefinition, presetIndex?: number): PreviewDoc {
  return {
    layers: [makeLayer(def, {}, presetIndex)],
    color: { ...DEFAULT_COLOR },
    post: { ...DEFAULT_POST },
    analysis: { ...DEFAULT_ANALYSIS },
  };
}

/** Which of a scene's vizIds are not (yet) registered. */
export function missingVizIds(scene: Scene): string[] {
  return [...new Set(scene.layers.map((l) => l.vizId).filter((id) => !getViz(id)))];
}

// ───────────────────────────────────────────────────────────── cache ──

/** A rendered thumbnail (a small 2D canvas), or null if rendering failed. */
export type Thumb = HTMLCanvasElement | null;

const mem = new Map<string, Thumb>();
const listeners = new Map<string, Set<(t: Thumb) => void>>();

function hashStr(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/** cache key: content hash so edited scenes regenerate */
export function thumbKey(kind: string, id: string, content: unknown): string {
  return `${kind}:${id}:${hashStr(JSON.stringify(content))}`;
}

export function cachedThumb(key: string): Thumb | undefined {
  return mem.get(key);
}

function storeThumb(key: string, t: Thumb) {
  mem.set(key, t);
  listeners.get(key)?.forEach((fn) => fn(t));
  listeners.delete(key);
}

// ───────────────────────────────────────────────────────────── queue ──

interface Job {
  key: string;
  doc: () => PreviewDoc;
  priority: number;
}
const queue: Job[] = [];
const queued = new Set<string>();
let running = false;

/**
 * Request a thumbnail; `onReady` fires once (immediately if cached).
 * Returns an unsubscribe function.
 */
export function requestThumb(key: string, doc: () => PreviewDoc, onReady: (t: Thumb) => void, priority = 0): () => void {
  const hit = cachedThumb(key);
  if (hit !== undefined) {
    onReady(hit);
    return () => {};
  }
  let set = listeners.get(key);
  if (!set) listeners.set(key, (set = new Set()));
  set.add(onReady);
  if (!queued.has(key)) {
    queued.add(key);
    queue.push({ key, doc, priority });
    queue.sort((a, b) => a.priority - b.priority);
  }
  pump();
  return () => {
    listeners.get(key)?.delete(onReady);
  };
}

const idle = (fn: () => void) => setTimeout(fn, 24);

function pump() {
  if (running || queue.length === 0) return;
  running = true;
  idle(async () => {
    const job = queue.shift()!;
    queued.delete(job.key);
    try {
      // skip jobs nobody is waiting for any more (navigated away)
      if (listeners.get(job.key)?.size) {
        storeThumb(job.key, await renderThumb(job.doc()));
      }
    } catch (e) {
      console.warn('[gallery] thumbnail failed', e);
      storeThumb(job.key, null);
    }
    running = false;
    pump();
  });
}

async function renderThumb(doc: PreviewDoc): Promise<Thumb> {
  const canvas = document.createElement('canvas');
  let t = T_START;
  const comp = new Compositor({ doc: () => doc, features: () => syntheticFeatures(t, doc.analysis) }, { maxDpr: 1, canvas });
  comp.setSize(THUMB_W, THUMB_H);
  const base = performance.now();
  const started = performance.now();
  try {
    for (let i = 0; i < FRAMES; i++) {
      t = T_START + i / FPS;
      comp.frame(base + (i * 1000) / FPS);
      // yield between frames so the UI stays responsive, and stop early on slow
      // (e.g. software-rendered WebGL) machines: a partial warm-up still looks fine
      await new Promise((r) => setTimeout(r, 0));
      if (performance.now() - started > TIME_BUDGET_MS && i >= 6) break;
    }
    // keep a GPU-side copy; no image encoding (it stalls on a readback)
    const out = document.createElement('canvas');
    out.width = THUMB_W;
    out.height = THUMB_H;
    out.getContext('2d')!.drawImage(canvas, 0, 0);
    return out;
  } finally {
    comp.dispose();
    canvas.width = canvas.height = 0;
  }
}

// ──────────────────────────────────────────────────────── live preview ──

let live: { comp: Compositor; host: HTMLElement } | null = null;

/** Audio features for previews: the real stage's if audio is playing, else synthetic. */
export type FeatureSource = (t: number, analysis: AnalysisSettings) => AudioFeatures;

/** Mount the single shared live preview into `host` (replacing any existing one). */
export function startLivePreview(host: HTMLElement, doc: PreviewDoc, features?: FeatureSource): () => void {
  stopLivePreview();
  const t0 = performance.now();
  const src = features ?? syntheticFeatures;
  const comp = new Compositor(
    { doc: () => doc, features: () => src(T_START + (performance.now() - t0) / 1000, doc.analysis) },
    { maxDpr: Math.min(2, window.devicePixelRatio || 1) },
  );
  comp.mount(host);
  comp.canvas.classList.add('gal-live-canvas');
  comp.start();
  live = { comp, host };
  return () => {
    if (live?.comp === comp) stopLivePreview();
  };
}

export function stopLivePreview() {
  if (!live) return;
  live.comp.dispose();
  live = null;
}

