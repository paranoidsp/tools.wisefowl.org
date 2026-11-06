/**
 * Compositor: owns the render loop.
 *
 * Per frame: features = source.features() → for each visible layer (bottom →
 * top) compute effective params (base + audio modulation), render the layer
 * into its own canvas, then composite onto the stage with the layer's blend
 * mode, opacity and transform. Finally apply post effects (trails, glow,
 * vignette, grain).
 *
 * The same class drives the main stage and the gallery's preview thumbnails
 * (with a fixed document + synthetic audio features).
 */
import { createColorMapper } from '../color';
import { getViz } from './registry';
import type {
  AudioFeatures,
  ColorMapper,
  ColorSettings,
  Layer,
  ModSource,
  Modulation,
  ParamSpec,
  ParamValues,
  PostSettings,
  VizDefinition,
  VizInstance,
} from './types';

export interface CompositorDoc {
  layers: Layer[];
  color: ColorSettings;
  post: PostSettings;
}

export interface CompositorSource {
  doc(): CompositorDoc;
  features(): AudioFeatures;
}

interface LayerRuntime {
  vizId: string;
  def: VizDefinition;
  inst: VizInstance;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null;
  w: number;
  h: number;
  /** smoothed modulation source values, per param key */
  modState: Record<string, number>;
  error: string | null;
  errorAt: number;
  /** effective params from the last rendered frame */
  lastParams: ParamValues | null;
  /** webgl layers: small 2D copy taken right after render (WebGL buffers can't be read later) */
  thumb: HTMLCanvasElement | null;
}

export interface CompositorStats {
  fps: number;
  frameMs: number;
  layers: number;
  errors: Record<string, string>;
}

const ASPECTS: Record<PostSettings['aspect'], number | null> = {
  fill: null,
  '16:9': 16 / 9,
  '1:1': 1,
  '9:16': 9 / 16,
  '4:3': 4 / 3,
};

function supportsCtxFilter(): boolean {
  try {
    const c = document.createElement('canvas').getContext('2d')!;
    c.filter = 'blur(2px)';
    return c.filter === 'blur(2px)';
  } catch {
    return false;
  }
}

export function modSourceValue(src: ModSource, a: AudioFeatures, t: number): number {
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
    case 'lfoFast': return 0.5 + 0.5 * Math.sin(2 * Math.PI * 1 * t);
    case 'random':
      // cheap smooth noise: sum of incommensurate sines
      return 0.5 + 0.25 * Math.sin(t * 1.31) + 0.15 * Math.sin(t * 2.97 + 1.3) + 0.1 * Math.sin(t * 5.71 + 4.1);
  }
}

/** Effective params = base values + modulation, clamped to each spec's range. */
export function applyModulation(
  specs: ParamSpec[],
  base: ParamValues,
  mods: Record<string, Modulation>,
  audio: AudioFeatures,
  t: number,
  state: Record<string, number>,
): ParamValues {
  const keys = Object.keys(mods);
  if (keys.length === 0) return base;
  const out: ParamValues = { ...base };
  for (const key of keys) {
    const spec = specs.find((s) => s.key === key);
    if (!spec || spec.type !== 'number') continue;
    const m = mods[key];
    const raw = modSourceValue(m.source, audio, t);
    const prev = state[key] ?? raw;
    const v = prev + (raw - prev) * (1 - Math.min(0.99, Math.max(0, m.smooth)));
    state[key] = v;
    const b = typeof base[key] === 'number' ? (base[key] as number) : spec.default;
    out[key] = Math.min(spec.max, Math.max(spec.min, b + m.amount * (spec.max - spec.min) * v));
  }
  return out;
}

export class Compositor {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private glowCanvas = document.createElement('canvas');
  private glowCtx = this.glowCanvas.getContext('2d')!;
  private grainCanvas: HTMLCanvasElement | null = null;
  private runtimes = new Map<string, LayerRuntime>();
  private raf = 0;
  private running = false;
  private lastT = 0;
  private startT = performance.now();
  private colorKey: ColorSettings | null = null;
  private mapper: ColorMapper | null = null;
  private cssW = 1;
  private cssH = 1;
  private dpr = 1;
  private ro: ResizeObserver | null = null;
  private container: HTMLElement | null = null;
  private fpsAcc = 0;
  private fpsFrames = 0;
  private hasFilter = supportsCtxFilter();
  private frameCount = 0;
  /** cap on devicePixelRatio (gallery thumbnails use 1) */
  maxDpr: number;
  stats: CompositorStats = { fps: 0, frameMs: 0, layers: 0, errors: {} };

  constructor(private source: CompositorSource, opts: { maxDpr?: number; canvas?: HTMLCanvasElement } = {}) {
    this.maxDpr = opts.maxDpr ?? 2;
    this.canvas = opts.canvas ?? document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { alpha: false })!;
  }

  /** Fill a container (respecting the post.aspect setting), tracking resizes. */
  mount(container: HTMLElement) {
    this.container = container;
    container.appendChild(this.canvas);
    this.canvas.style.display = 'block';
    this.ro = new ResizeObserver(() => this.fit());
    this.ro.observe(container);
    this.fit();
  }

  unmount() {
    this.ro?.disconnect();
    this.ro = null;
    this.canvas.remove();
    this.container = null;
  }

  private fitAspect: PostSettings['aspect'] | null = null;
  private fitScale = 0;

  private fit() {
    if (!this.container) return;
    this.fitAspect = this.source.doc().post.aspect;
    this.fitScale = this.source.doc().post.renderScale;
    const r = this.container.getBoundingClientRect();
    const aspect = ASPECTS[this.source.doc().post.aspect];
    let w = r.width;
    let h = r.height;
    if (aspect) {
      if (w / h > aspect) w = h * aspect;
      else h = w / aspect;
    }
    this.setSize(Math.max(1, Math.floor(w)), Math.max(1, Math.floor(h)));
  }

  setSize(cssW: number, cssH: number) {
    const post = this.source.doc().post;
    const dpr = Math.min(this.maxDpr, (window.devicePixelRatio || 1) * post.renderScale);
    if (cssW === this.cssW && cssH === this.cssH && dpr === this.dpr) return;
    this.cssW = cssW;
    this.cssH = cssH;
    this.dpr = dpr;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    for (const rt of this.runtimes.values()) this.sizeRuntime(rt);
  }

  get size() {
    return { width: this.cssW, height: this.cssH, dpr: this.dpr };
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastT = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      this.frame(now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  dispose() {
    this.stop();
    this.unmount();
    for (const id of [...this.runtimes.keys()]) this.disposeRuntime(id);
  }

  /** Effective (modulated) params of a layer as of the last frame — for live UI readouts. */
  effectiveParams(layerId: string): ParamValues | null {
    return this.runtimes.get(layerId)?.lastParams ?? null;
  }

  /**
   * The layer's own canvas (pre-composite) — for layer-panel thumbnails.
   * For webgl layers this is a small 2D copy refreshed every few frames,
   * since a WebGL drawing buffer can't be read outside the frame it was drawn in.
   */
  layerCanvas(layerId: string): HTMLCanvasElement | null {
    const rt = this.runtimes.get(layerId);
    if (!rt) return null;
    return rt.ctx ? rt.canvas : rt.thumb;
  }

  /** Seconds on the compositor clock (the `time` handed to visualizations and LFOs). */
  time(): number {
    return (performance.now() - this.startT) / 1000;
  }

  private updateThumb(rt: LayerRuntime) {
    if (!rt.canvas.width || !rt.canvas.height) return;
    if (!rt.thumb) rt.thumb = document.createElement('canvas');
    const tw = 160;
    const th = Math.max(1, Math.round((tw * rt.canvas.height) / rt.canvas.width));
    if (rt.thumb.width !== tw || rt.thumb.height !== th) {
      rt.thumb.width = tw;
      rt.thumb.height = th;
    }
    const g = rt.thumb.getContext('2d')!;
    g.clearRect(0, 0, tw, th);
    g.drawImage(rt.canvas, 0, 0, tw, th);
  }

  /** Last error thrown by a layer's visualization, if any. */
  layerError(layerId: string): string | null {
    return this.stats.errors[layerId] ?? null;
  }

  async snapshot(type = 'image/png'): Promise<Blob | null> {
    return new Promise((res) => this.canvas.toBlob(res, type));
  }

  // ─────────────────────────────────────────────────────────── runtime ──

  private sizeRuntime(rt: LayerRuntime) {
    const pw = Math.round(this.cssW * this.dpr);
    const ph = Math.round(this.cssH * this.dpr);
    if (rt.canvas.width !== pw || rt.canvas.height !== ph || rt.w !== this.cssW || rt.h !== this.cssH) {
      if (rt.def.renderer === 'canvas2d') {
        rt.canvas.width = pw;
        rt.canvas.height = ph;
      }
      rt.w = this.cssW;
      rt.h = this.cssH;
      try {
        rt.inst.resize?.(this.cssW, this.cssH, this.dpr);
      } catch (e) {
        console.error(`[viz ${rt.vizId}] resize failed`, e);
      }
    }
  }

  private ensureRuntime(layer: Layer): LayerRuntime | null {
    const existing = this.runtimes.get(layer.id);
    if (existing && existing.vizId === layer.vizId) return existing;
    if (existing) this.disposeRuntime(layer.id);
    const def = getViz(layer.vizId);
    if (!def) return null;
    const canvas = document.createElement('canvas');
    const ctx = def.renderer === 'canvas2d' ? canvas.getContext('2d') : null;
    let inst: VizInstance;
    try {
      inst = def.create(canvas);
    } catch (e) {
      console.error(`[viz ${def.id}] create failed`, e);
      this.stats.errors[layer.id] = String(e);
      return null;
    }
    const rt: LayerRuntime = { vizId: def.id, def, inst, canvas, ctx, w: 0, h: 0, modState: {}, error: null, errorAt: 0, lastParams: null, thumb: null };
    this.runtimes.set(layer.id, rt);
    this.sizeRuntime(rt);
    return rt;
  }

  private disposeRuntime(id: string) {
    const rt = this.runtimes.get(id);
    if (!rt) return;
    try {
      rt.inst.dispose?.();
    } catch (e) {
      console.error(`[viz ${rt.vizId}] dispose failed`, e);
    }
    rt.canvas.width = rt.canvas.height = 0;
    this.runtimes.delete(id);
    delete this.stats.errors[id];
  }

  private colorMapper(settings: ColorSettings): ColorMapper {
    if (settings !== this.colorKey || !this.mapper) {
      this.colorKey = settings;
      this.mapper = createColorMapper(settings);
    }
    return this.mapper;
  }

  // ───────────────────────────────────────────────────────────── frame ──

  frame(now = performance.now()) {
    const t0 = performance.now();
    const dt = Math.min(0.1, Math.max(0, (now - this.lastT) / 1000));
    this.lastT = now;
    const time = (now - this.startT) / 1000;

    const doc = this.source.doc();
    // re-fit only when something that affects stage size changed (resizes are
    // handled by the ResizeObserver) — getBoundingClientRect forces layout.
    if (this.container && (doc.post.aspect !== this.fitAspect || doc.post.renderScale !== this.fitScale)) this.fit();
    const audio = this.source.features();
    const color = this.colorMapper(doc.color);
    const { ctx, canvas } = this;
    const post = doc.post;
    const W = canvas.width;
    const H = canvas.height;

    // drop runtimes for removed layers
    const live = new Set(doc.layers.map((l) => l.id));
    for (const id of [...this.runtimes.keys()]) if (!live.has(id)) this.disposeRuntime(id);

    // background / trails
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = post.trails > 0 ? 1 - Math.min(0.99, post.trails) : 1;
    ctx.fillStyle = post.background;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;

    let rendered = 0;
    for (const layer of doc.layers) {
      if (!layer.visible || layer.opacity <= 0) continue;
      const rt = this.ensureRuntime(layer);
      if (!rt) continue;
      // back off a failing layer for a second instead of spamming errors
      if (rt.error && now - rt.errorAt < 1000) continue;
      const params = applyModulation(rt.def.params, layer.params, layer.modulations, audio, time, rt.modState);
      rt.lastParams = params;

      if (rt.ctx) {
        const c = rt.ctx;
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.globalAlpha = 1;
        c.filter = 'none';
        if (layer.feedback > 0) {
          c.globalCompositeOperation = 'destination-out';
          c.fillStyle = `rgba(0,0,0,${1 - Math.min(0.995, layer.feedback)})`;
          c.fillRect(0, 0, rt.canvas.width, rt.canvas.height);
        } else {
          c.clearRect(0, 0, rt.canvas.width, rt.canvas.height);
        }
        c.globalCompositeOperation = 'source-over';
        c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        c.save();
      }
      try {
        rt.inst.render({ width: this.cssW, height: this.cssH, dpr: this.dpr, time, dt, audio, params, color });
        if (rt.error) {
          rt.error = null;
          delete this.stats.errors[layer.id];
        }
      } catch (e) {
        if (!rt.error) console.error(`[viz ${rt.vizId}] render failed`, e);
        rt.error = String(e);
        rt.errorAt = now;
        this.stats.errors[layer.id] = rt.error;
      }
      rt.ctx?.restore();
      if (!rt.ctx && this.frameCount % 8 === 0) this.updateThumb(rt);

      // composite
      const tf = layer.transform;
      ctx.save();
      ctx.globalAlpha = layer.opacity;
      ctx.globalCompositeOperation = layer.blend;
      ctx.translate(W / 2 + tf.x * W * 0.5, H / 2 + tf.y * H * 0.5);
      if (tf.rotation) ctx.rotate((tf.rotation * Math.PI) / 180);
      if (tf.scale !== 1) ctx.scale(tf.scale, tf.scale);
      ctx.drawImage(rt.canvas, -W / 2, -H / 2, W, H);
      ctx.restore();
      rendered++;
    }

    // glow: blurred copy of the stage added back on top
    if (post.glow > 0 && rendered > 0) this.applyGlow(post);
    if (post.vignette > 0) this.applyVignette(post.vignette);
    if (post.grain > 0) this.applyGrain(post.grain);

    this.frameCount++;
    // stats
    const ms = performance.now() - t0;
    this.stats.frameMs = this.stats.frameMs * 0.9 + ms * 0.1;
    this.stats.layers = rendered;
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc >= 0.5) {
      this.stats.fps = Math.round(this.fpsFrames / this.fpsAcc);
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }
  }

  private applyGlow(post: PostSettings) {
    const { ctx, canvas } = this;
    const radius = Math.max(1, post.glowRadius * this.dpr);
    if (this.hasFilter) {
      const scale = 0.5;
      const gw = Math.max(1, Math.round(canvas.width * scale));
      const gh = Math.max(1, Math.round(canvas.height * scale));
      if (this.glowCanvas.width !== gw || this.glowCanvas.height !== gh) {
        this.glowCanvas.width = gw;
        this.glowCanvas.height = gh;
      }
      const g = this.glowCtx;
      g.globalCompositeOperation = 'copy';
      g.filter = `blur(${radius * scale}px) brightness(1.15)`;
      g.drawImage(canvas, 0, 0, gw, gh);
      g.filter = 'none';
    } else {
      // fallback blur: downsample hard, let bilinear upscaling smear it
      const k = Math.max(2, Math.round(radius / 2));
      const gw = Math.max(1, Math.round(canvas.width / k));
      const gh = Math.max(1, Math.round(canvas.height / k));
      if (this.glowCanvas.width !== gw || this.glowCanvas.height !== gh) {
        this.glowCanvas.width = gw;
        this.glowCanvas.height = gh;
      }
      const g = this.glowCtx;
      g.globalCompositeOperation = 'copy';
      g.imageSmoothingQuality = 'high';
      g.drawImage(canvas, 0, 0, gw, gh);
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = Math.min(1, post.glow);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.glowCanvas, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  private applyVignette(amount: number) {
    const { ctx, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;
    const r = Math.hypot(W, H) / 2;
    const grad = ctx.createRadialGradient(W / 2, H / 2, r * 0.35, W / 2, H / 2, r);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(0,0,0,${Math.min(1, amount)})`);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  private applyGrain(amount: number) {
    if (!this.grainCanvas) {
      const g = document.createElement('canvas');
      g.width = g.height = 256;
      const gc = g.getContext('2d')!;
      const img = gc.createImageData(256, 256);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = (Math.random() * 255) | 0;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      gc.putImageData(img, 0, 0);
      this.grainCanvas = g;
    }
    const { ctx, canvas } = this;
    const pattern = ctx.createPattern(this.grainCanvas, 'repeat');
    if (!pattern) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, (Math.random() * 256) | 0, (Math.random() * 256) | 0);
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = Math.min(1, amount) * 0.35;
    ctx.fillStyle = pattern;
    ctx.fillRect(-256, -256, canvas.width + 512, canvas.height + 512);
    ctx.restore();
  }
}
