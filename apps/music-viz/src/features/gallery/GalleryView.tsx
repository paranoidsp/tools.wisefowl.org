/**
 * Gallery: curated scenes (full layer stacks) and single visualizations with
 * their presets, as cards with generated thumbnails and a live preview on
 * hover. Opening a card loads it into the Studio.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { SCENES, VIZ_LIST } from '../../core/registry';
import { useStore } from '../../core/store';
import type { Scene, VizDefinition } from '../../core/types';
import { getLatestFeatures, latestFeaturesAt } from '../../ui/liveFeatures';
import { syntheticFeatures } from '../../audio/synthetic';
import {
  missingVizIds,
  requestThumb,
  sceneDoc,
  startLivePreview,
  thumbKey,
  vizDoc,
  type FeatureSource,
  type PreviewDoc,
  type Thumb,
} from './thumbs';
import './gallery.css';

/** tag chips shown; the rest are reachable through search */
const MAX_CHIPS = 14;

/** Use the real stage's features while audio plays, so hover previews react to the music. */
const previewFeatures: FeatureSource = (t, analysis) => {
  const f = getLatestFeatures();
  if (f && f.playing && performance.now() - latestFeaturesAt() < 250) return f;
  return syntheticFeatures(t, analysis);
};

/** undefined = pending, null = failed */
function useThumb(key: string, doc: () => PreviewDoc, priority: number, el: React.RefObject<HTMLElement | null>): Thumb | undefined {
  const [thumb, setUrl] = useState<Thumb | undefined>(undefined);
  useEffect(() => {
    setUrl(undefined);
    const node = el.current;
    let unsub: (() => void) | null = null;
    // only render thumbnails for cards near the viewport
    if (!node || typeof IntersectionObserver === 'undefined') {
      unsub = requestThumb(key, doc, setUrl, priority);
      return () => unsub?.();
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !unsub) {
          unsub = requestThumb(key, doc, setUrl, priority);
          io.disconnect();
        }
      },
      { rootMargin: '400px 0px' },
    );
    io.observe(node);
    return () => {
      io.disconnect();
      unsub?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return thumb;
}

function Preview({ thumbKeyStr, doc, priority, label, compact }: { thumbKeyStr: string; doc: () => PreviewDoc; priority: number; label: string; compact?: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const thumb = useThumb(thumbKeyStr, doc, priority, rootRef);
  const thumbCanvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = thumbCanvas.current;
    if (!c || !thumb) return;
    c.width = thumb.width;
    c.height = thumb.height;
    c.getContext('2d')!.drawImage(thumb, 0, 0);
  }, [thumb]);
  const liveRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    if (!hover || !liveRef.current) return;
    const host = liveRef.current;
    let stop: (() => void) | null = null;
    const timer = window.setTimeout(() => {
      stop = startLivePreview(host, doc(), previewFeatures);
    }, 140);
    return () => {
      clearTimeout(timer);
      stop?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hover]);

  return (
    <div
      ref={rootRef}
      className={`gal-preview${compact ? ' gal-preview--compact' : ''}`}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
    >
      {thumb ? (
        <canvas ref={thumbCanvas} className="gal-thumb" role="img" aria-label={label} />
      ) : thumb === null ? (
        <div className="gal-thumb gal-thumb--empty">No preview</div>
      ) : (
        <div className="gal-thumb gal-thumb--loading" />
      )}
      <div ref={liveRef} className={`gal-live${hover ? ' is-on' : ''}`} />
      {hover && <span className="gal-live-badge">Live</span>}
    </div>
  );
}

function SceneCard({ scene, index, onOpen }: { scene: Scene; index: number; onOpen: (s: Scene) => void }) {
  const missing = useMemo(() => missingVizIds(scene), [scene]);
  const key = useMemo(() => thumbKey('scene', scene.id, scene), [scene]);
  const docFn = () => sceneDoc(scene);
  const vizNames = scene.layers.length;
  return (
    <article className="gal-card" onClick={() => onOpen(scene)} onKeyDown={(e) => e.key === 'Enter' && onOpen(scene)} tabIndex={0} role="button" aria-label={`Open ${scene.name}`}>
      <Preview thumbKeyStr={key} doc={docFn} priority={index} label={scene.name} />
      <div className="gal-card__body">
        <div className="gal-card__head">
          <h3 className="gal-card__title">{scene.name}</h3>
          <span className="gal-card__meta">{vizNames} layer{vizNames === 1 ? '' : 's'}</span>
        </div>
        <p className="gal-card__desc">{scene.description}</p>
        <div className="gal-card__foot">
          <div className="gal-tags">
            {(scene.tags ?? []).slice(0, 4).map((t) => (
              <span key={t} className="gal-tag">{t}</span>
            ))}
            {missing.length > 0 && <span className="gal-tag gal-tag--warn" title={`Not available: ${missing.join(', ')}`}>partial</span>}
          </div>
          <button
            className="gal-open"
            onClick={(e) => {
              e.stopPropagation();
              onOpen(scene);
            }}
          >
            Open
          </button>
        </div>
      </div>
    </article>
  );
}

function VizCard({ def, presetIndex, index, onOpen }: { def: VizDefinition; presetIndex: number | undefined; index: number; onOpen: () => void }) {
  const preset = presetIndex != null ? def.presets?.[presetIndex] : undefined;
  const key = useMemo(() => thumbKey('viz', `${def.id}:${presetIndex ?? 'd'}`, [def.params.map((p) => p.key), preset?.params ?? null]), [def, presetIndex, preset]);
  const docFn = () => vizDoc(def, presetIndex);
  return (
    <button className="gal-vcard" onClick={onOpen} title={preset?.description ?? def.description}>
      <Preview thumbKeyStr={key} doc={docFn} priority={1000 + index} label={preset?.name ?? def.name} compact />
      <div className="gal-vcard__name">{preset?.name ?? 'Default'}</div>
    </button>
  );
}

export function GalleryView() {
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);

  const scenes = useMemo(() => SCENES.filter((s) => missingVizIds(s).length < s.layers.length), []);
  const allTags = useMemo(() => {
    const count = new Map<string, number>();
    for (const s of scenes) for (const t of s.tags ?? []) count.set(t, (count.get(t) ?? 0) + 1);
    return [...count.entries()]
      .filter(([t]) => t !== 'featured')
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, MAX_CHIPS)
      .map(([t]) => t);
  }, [scenes]);

  const q = query.trim().toLowerCase();
  const shown = scenes.filter((s) => {
    if (tag && !(s.tags ?? []).includes(tag)) return false;
    if (!q) return true;
    return [s.name, s.description, ...(s.tags ?? []), ...s.layers.map((l) => l.vizId)].join(' ').toLowerCase().includes(q);
  });
  const shownViz = VIZ_LIST.filter((v) => {
    if (tag && !(v.tags ?? []).includes(tag) && !(tag === '3d' && v.space === '3d')) return false;
    if (!q) return true;
    return [v.name, v.description, ...(v.tags ?? []), ...(v.presets ?? []).map((p) => p.name)].join(' ').toLowerCase().includes(q);
  });

  const openScene = (s: Scene) => {
    const st = useStore.getState();
    st.loadScene(s);
    st.setTab('studio');
  };
  const openViz = (def: VizDefinition, presetIndex?: number) => {
    const st = useStore.getState();
    st.newProject();
    st.addLayer(def.id, presetIndex);
    st.setTab('studio');
  };

  return (
    <div className="gal-root">
      <div className="gal-inner">
        <header className="gal-header">
          <div>
            <h1 className="gal-h1">Gallery</h1>
            <p className="gal-sub">
              Curated scenes to start from. Each is a full layer stack with its own colour mapping and post effects. Hover to preview live, then open one and make it yours.
            </p>
          </div>
          <label className="gal-search">
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search scenes and visualizations" spellCheck={false} />
            {query && (
              <button className="gal-search__clear" onClick={() => setQuery('')} aria-label="Clear search">
                ×
              </button>
            )}
          </label>
        </header>

        <div className="gal-chips" role="toolbar" aria-label="Filter by tag">
          <button className={`gal-chip${tag == null ? ' is-on' : ''}`} onClick={() => setTag(null)}>
            All <span className="gal-chip__n">{scenes.length}</span>
          </button>
          {allTags.map((t) => (
            <button key={t} className={`gal-chip${tag === t ? ' is-on' : ''}`} onClick={() => setTag(tag === t ? null : t)}>
              {t}
            </button>
          ))}
        </div>

        <section className="gal-section">
          {shown.length > 0 ? (
            <div className="gal-grid">
              {shown.map((s, i) => (
                <SceneCard key={s.id} scene={s} index={i} onOpen={openScene} />
              ))}
            </div>
          ) : (
            <div className="gal-empty">
              {scenes.length === 0 ? 'No scenes are available yet.' : 'No scenes match. Try another search or tag.'}
              {(q || tag) && (
                <button className="gal-linkbtn" onClick={() => { setQuery(''); setTag(null); }}>
                  Clear filters
                </button>
              )}
            </div>
          )}
        </section>

        <section className="gal-section">
          <div className="gal-section__head">
            <h2 className="gal-h2">Start from a single visualization</h2>
            <p className="gal-sub">Opening one starts a new project with a single layer. Every preset is just a starting point for its parameters.</p>
          </div>
          {shownViz.length === 0 && <div className="gal-empty">No visualizations match.</div>}
          <div className="gal-vlist">
            {shownViz.map((def, vi) => {
              const presets = def.presets?.length ? def.presets.map((_, i) => i) : [undefined];
              return (
                <div key={def.id} className="gal-vrow">
                  <div className="gal-vrow__info">
                    <div className="gal-vrow__title">
                      {def.name}
                      <span className="gal-space">{def.space === '3d' ? '3D' : '2D'}</span>
                    </div>
                    <p className="gal-vrow__desc">{def.description}</p>
                  </div>
                  <div className="gal-vrow__presets">
                    {presets.map((pi, k) => (
                      <VizCard key={k} def={def} presetIndex={pi} index={vi * 8 + k} onOpen={() => openViz(def, pi)} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

export default GalleryView;
