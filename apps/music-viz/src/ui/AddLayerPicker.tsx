/** Modal picker for adding a visualization layer, with a live preview. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { syntheticFeatures } from '../audio/synthetic';
import { Compositor } from '../core/compositor';
import { DEFAULT_ANALYSIS, DEFAULT_POST, makeLayer } from '../core/defaults';
import { VIZ_LIST } from '../core/registry';
import { useStore } from '../core/store';
import type { Layer, VizDefinition } from '../core/types';
import { IconClose, IconCube, IconPlus, IconSearch, IconSquare } from './icons';
import { useUi } from './uiStore';

type SpaceFilter = 'all' | '2d' | '3d';

export function AddLayerPicker() {
  const open = useUi((s) => s.pickerOpen);
  if (!open) return null;
  return createPortal(<Picker onClose={() => useUi.getState().setPickerOpen(false)} />, document.body);
}

function matches(v: VizDefinition, q: string) {
  if (!q) return true;
  const hay = `${v.name} ${v.description} ${(v.tags ?? []).join(' ')} ${(v.presets ?? []).map((p) => p.name).join(' ')}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((w) => hay.includes(w));
}

function Picker({ onClose }: { onClose(): void }) {
  const [q, setQ] = useState('');
  const [space, setSpace] = useState<SpaceFilter>('all');
  const list = useMemo(() => VIZ_LIST.filter((v) => (space === 'all' || v.space === space) && matches(v, q)), [q, space]);
  const [hiId, setHiId] = useState<string | null>(VIZ_LIST[0]?.id ?? null);
  const [presetIdx, setPresetIdx] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);


  const add = (v: VizDefinition, preset?: number) => {
    useStore.getState().addLayer(v.id, preset);
    useStore.getState().setTab('studio');
    onClose();
  };

  const groups: { title: string; items: VizDefinition[] }[] = [
    { title: '2D', items: list.filter((v) => v.space === '2d') },
    { title: '3D', items: list.filter((v) => v.space === '3d') },
  ].filter((g) => g.items.length);
  const flat = groups.flatMap((g) => g.items);
  const hi = list.find((v) => v.id === hiId) ?? flat[0];

  useEffect(() => setPresetIdx(null), [hi?.id]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    const i = hi ? flat.indexOf(hi) : -1;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = flat[Math.max(0, Math.min(flat.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (n) {
        setHiId(n.id);
        listRef.current?.querySelector(`[data-id="${n.id}"]`)?.scrollIntoView({ block: 'nearest' });
      }
    } else if (e.key === 'Enter' && hi) {
      e.preventDefault();
      add(hi, presetIdx ?? undefined);
    }
  };

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal picker" role="dialog" aria-modal="true" aria-label="Add layer" onKeyDown={onKey}>
        <div className="picker__left">
          <div className="picker__search">
            <IconSearch size={15} />
            <input autoFocus placeholder="Search visualizations, tags, presets…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search visualizations" />
            <div className="picker__filters">
              {(['all', '2d', '3d'] as SpaceFilter[]).map((s) => (
                <button key={s} className={`chip ${space === s ? 'is-on' : ''}`} onClick={() => setSpace(s)}>
                  {s === 'all' ? 'All' : s.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div className="picker__list" ref={listRef}>
            {groups.map((g) => (
              <div key={g.title} className="picker__group">
                <div className="picker__glabel">
                  {g.title} <span className="num">{g.items.length}</span>
                </div>
                {g.items.map((v) => (
                  <button
                    key={v.id}
                    data-id={v.id}
                    className={`picker__item ${hi?.id === v.id ? 'is-hi' : ''}`}
                    onPointerEnter={() => setHiId(v.id)}
                    onFocus={() => setHiId(v.id)}
                    onClick={() => add(v)}
                    onDoubleClick={() => add(v)}
                  >
                    <span className="picker__icon">{v.space === '3d' ? <IconCube size={14} /> : <IconSquare size={14} />}</span>
                    <span className="picker__text">
                      <span className="picker__name">{v.name}</span>
                      <span className="picker__desc">{v.description}</span>
                    </span>
                    {v.presets?.length ? <span className="picker__count num">{v.presets.length}</span> : null}
                  </button>
                ))}
              </div>
            ))}
            {flat.length === 0 && <div className="picker__none">Nothing matches “{q}”.</div>}
          </div>
        </div>
        <div className="picker__right">
          <button className="icon-btn picker__close" onClick={onClose} aria-label="Close" data-tip="Close" data-tip-kbd="Esc">
            <IconClose size={15} />
          </button>
          {hi ? (
            <>
              <Preview def={hi} presetIdx={presetIdx} />
              <div className="picker__detail">
                <div className="insp-head__eyebrow">
                  <span>{hi.space === '3d' ? '3D' : '2D'}</span>
                  <span className="dot-sep" />
                  <span>{hi.renderer === 'webgl' ? 'WebGL' : 'Canvas'}</span>
                  {hi.tags?.map((t) => (
                    <span key={t} className="tag">
                      {t}
                    </span>
                  ))}
                </div>
                <h3 className="picker__title">{hi.name}</h3>
                <p className="picker__long">{hi.description}</p>
                {hi.presets && hi.presets.length > 0 && (
                  <>
                    <div className="picker__glabel">Start from a preset</div>
                    <div className="picker__presets">
                      {hi.presets.map((p, i) => (
                        <button
                          key={i}
                          className={`preset-chip ${presetIdx === i ? 'is-on' : ''}`}
                          onPointerEnter={() => setPresetIdx(i)}
                          onClick={() => add(hi, i)}
                          data-tip={p.description}
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <div className="picker__foot">
                <span className="muted">
                  <kbd>↑</kbd> <kbd>↓</kbd> browse · <kbd>↵</kbd> add
                </span>
                <button className="btn btn--primary" onClick={() => add(hi, presetIdx ?? undefined)}>
                  <IconPlus size={14} /> Add {presetIdx != null ? `“${hi.presets?.[presetIdx]?.name}”` : 'layer'}
                </button>
              </div>
            </>
          ) : (
            <div className="picker__none">No visualizations found.</div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Live preview of a single viz driven by synthetic audio. */
function Preview({ def, presetIdx }: { def: VizDefinition; presetIdx: number | null }) {
  const host = useRef<HTMLDivElement>(null);
  const doc = useRef<{ layers: Layer[] }>({ layers: [] });
  const comp = useRef<Compositor | null>(null);

  useEffect(() => {
    const t0 = performance.now();
    const c = new Compositor(
      {
        doc: () => ({ layers: doc.current.layers, color: useStore.getState().color, post: { ...DEFAULT_POST, vignette: 0.2 } }),
        features: () => syntheticFeatures((performance.now() - t0) / 1000, DEFAULT_ANALYSIS),
      },
      { maxDpr: 1.5 },
    );
    comp.current = c;
    c.mount(host.current!);
    c.start();
    return () => {
      c.dispose();
      comp.current = null;
    };
  }, []);

  useEffect(() => {
    // debounce so fast hovering doesn't thrash WebGL contexts
    const id = setTimeout(() => {
      try {
        doc.current.layers = [makeLayer(def, {}, presetIdx ?? undefined)];
      } catch {
        doc.current.layers = [];
      }
    }, 90);
    return () => clearTimeout(id);
  }, [def, presetIdx]);

  return (
    <div className="picker__preview">
      <div className="picker__canvas" ref={host} />
      <span className="picker__previewtag">Preview · synthetic audio</span>
    </div>
  );
}
