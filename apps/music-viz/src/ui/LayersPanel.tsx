/** Photoshop-style layer stack: top row = top layer. Drag to reorder. */
import { useEffect, useRef, useState } from 'react';
import { getViz } from '../core/registry';
import { stage } from '../core/stage';
import { useStore } from '../core/store';
import type { Layer } from '../core/types';
import { IconCopy, IconCube, IconEdit, IconEye, IconEyeOff, IconMore, IconPlus, IconReset, IconTrash, IconWarn } from './icons';
import { Menu, type Anchor, type MenuItem } from './Popover';
import { MOD_KEY } from './Tooltip';
import { useUi } from './uiStore';
import { LeftTabs } from './HistoryPanel';

const ROW = 50; // row height + gap, px

interface DragState {
  id: string;
  from: number;
  startY: number;
  dy: number;
  to: number;
  active: boolean;
}

export function LayersPanel() {
  const layers = useStore((s) => s.layers);
  const selectedId = useStore((s) => s.selectedId);
  const display = [...layers].reverse();
  const thumbs = useRef(new Map<string, HTMLCanvasElement>());
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [menu, setMenu] = useState<{ id: string; anchor: Anchor } | null>(null);
  const renamingId = useUi((s) => s.renamingId);

  // live thumbnails
  useEffect(() => {
    const id = setInterval(() => {
      for (const [lid, c] of thumbs.current) {
        const src = stage.layerCanvas(lid);
        const g = c.getContext('2d');
        if (!g) continue;
        g.clearRect(0, 0, c.width, c.height);
        if (!src || !src.width || !src.height) continue;
        const s = Math.min(c.width / src.width, c.height / src.height);
        const w = src.width * s;
        const h = src.height * s;
        try {
          g.drawImage(src, (c.width - w) / 2, (c.height - h) / 2, w, h);
        } catch {
          /* webgl canvas not ready */
        }
      }
    }, 250);
    return () => clearInterval(id);
  }, []);

  const onRowDown = (layer: Layer, idx: number) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button, input')) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const d = { id: layer.id, from: idx, startY: e.clientY, dy: 0, to: idx, active: false };
    dragRef.current = d;
    useStore.getState().select(layer.id);
  };
  const onRowMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dy = e.clientY - d.startY;
    if (!d.active && Math.abs(dy) < 4) return;
    const to = Math.max(0, Math.min(display.length - 1, Math.round(d.from + dy / ROW)));
    const next = { ...d, dy, to, active: true };
    dragRef.current = next;
    setDrag(next);
  };
  const onRowUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (d?.active && d.to !== d.from) {
      useStore.getState().moveLayer(d.id, display.length - 1 - d.to);
    }
  };

  const shiftFor = (i: number) => {
    if (!drag?.active) return 0;
    if (i === drag.from) return drag.dy;
    if (drag.from < drag.to && i > drag.from && i <= drag.to) return -ROW;
    if (drag.from > drag.to && i >= drag.to && i < drag.from) return ROW;
    return 0;
  };

  const menuLayer = menu ? layers.find((l) => l.id === menu.id) : undefined;
  const menuItems = (l: Layer): (MenuItem | 'sep')[] => {
    const s = useStore.getState();
    const idx = layers.findIndex((x) => x.id === l.id);
    return [
      { label: 'Rename', icon: <IconEdit size={14} />, onSelect: () => useUi.getState().setRenaming(l.id) },
      { label: 'Duplicate', icon: <IconCopy size={14} />, kbd: `${MOD_KEY}D`, onSelect: () => s.duplicateLayer(l.id) },
      { label: l.visible ? 'Hide' : 'Show', icon: l.visible ? <IconEyeOff size={14} /> : <IconEye size={14} />, kbd: 'H', onSelect: () => s.updateLayer(l.id, { visible: !l.visible }) },
      { label: 'Reset parameters', icon: <IconReset size={14} />, onSelect: () => s.resetLayerParams(l.id) },
      'sep',
      { label: 'Bring forward', icon: <span className="menu__glyph">↑</span>, disabled: idx >= layers.length - 1, onSelect: () => s.moveLayer(l.id, idx + 1) },
      { label: 'Send backward', icon: <span className="menu__glyph">↓</span>, disabled: idx <= 0, onSelect: () => s.moveLayer(l.id, idx - 1) },
      'sep',
      { label: 'Delete', icon: <IconTrash size={14} />, kbd: '⌫', danger: true, onSelect: () => s.removeLayer(l.id) },
    ];
  };

  return (
    <div className="layers">
      <div className="panel-head">
        <LeftTabs layerCount={layers.length} />
        <span className="grow" />
        <button className="icon-btn" onClick={() => useUi.getState().setPickerOpen(true)} data-tip="Add layer" data-tip-kbd="A" aria-label="Add layer">
          <IconPlus size={15} />
        </button>
      </div>
      <div className="panel-scroll layers__scroll">
        <div className={`layers__list ${drag?.active ? 'is-dragging' : ''}`} style={{ height: display.length * ROW }}>
          {display.map((l, i) => (
            <LayerRow
              key={l.id}
              layer={l}
              selected={l.id === selectedId}
              dragging={drag?.active === true && drag.id === l.id}
              shift={shiftFor(i)}
              top={i * ROW}
              renaming={renamingId === l.id}
              thumbRef={(c) => {
                if (c) thumbs.current.set(l.id, c);
                else thumbs.current.delete(l.id);
              }}
              onPointerDown={onRowDown(l, i)}
              onPointerMove={onRowMove}
              onPointerUp={onRowUp}
              onContextMenu={(e) => {
                e.preventDefault();
                useStore.getState().select(l.id);
                setMenu({ id: l.id, anchor: { x: e.clientX, y: e.clientY } });
              }}
              onMore={(el) => setMenu({ id: l.id, anchor: { current: el } })}
            />
          ))}
        </div>
        {layers.length === 0 ? (
          <div className="layers__empty">
            <p>No layers yet.</p>
            <p className="muted">Layers stack like in an image editor. Each one is a visualization with its own parameters.</p>
          </div>
        ) : null}
        <button className="layers__add" onClick={() => useUi.getState().setPickerOpen(true)} data-tip="Pick a visualization to stack on top" data-tip-kbd="A">
          <IconPlus size={14} />
          <span>Add layer</span>
        </button>
      </div>
      {menuLayer && menu && <Menu open anchor={menu.anchor} onClose={() => setMenu(null)} items={menuItems(menuLayer)} placement="bottom-start" />}
    </div>
  );
}

interface RowProps {
  layer: Layer;
  selected: boolean;
  dragging: boolean;
  shift: number;
  top: number;
  renaming: boolean;
  thumbRef(c: HTMLCanvasElement | null): void;
  onPointerDown(e: React.PointerEvent): void;
  onPointerMove(e: React.PointerEvent): void;
  onPointerUp(e: React.PointerEvent): void;
  onContextMenu(e: React.MouseEvent): void;
  onMore(el: HTMLElement): void;
}

function LayerRow(p: RowProps) {
  const { layer } = p;
  const def = getViz(layer.vizId);
  const modCount = Object.keys(layer.modulations).length;
  const errRef = useRef<HTMLSpanElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const id = setInterval(() => {
      if (errRef.current) errRef.current.hidden = !stage.layerError(layer.id);
    }, 600);
    return () => clearInterval(id);
  }, [layer.id]);

  return (
    <div
      className={`layer-row ${p.selected ? 'is-sel' : ''} ${layer.visible ? '' : 'is-hidden'} ${p.dragging ? 'is-drag' : ''}`}
      style={{ top: p.top, transform: `translateY(${p.shift}px)` }}
      onPointerDown={p.onPointerDown}
      onPointerMove={p.onPointerMove}
      onPointerUp={p.onPointerUp}
      onPointerCancel={p.onPointerUp}
      onContextMenu={p.onContextMenu}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest('.layer-row__name')) useUi.getState().setRenaming(layer.id);
      }}
      aria-selected={p.selected}
      role="option"
    >
      <div className="layer-row__thumb">
        <canvas ref={p.thumbRef} width={88} height={56} />
        {def?.space === '3d' && (
          <span className="layer-row__badge3d">
            <IconCube size={9} />
          </span>
        )}
      </div>
      <div className="layer-row__main">
        {p.renaming ? (
          <RenameInput layer={layer} />
        ) : (
          <div className="layer-row__name" title="Double-click to rename">
            {layer.name}
          </div>
        )}
        <div className="layer-row__meta">
          <span>{def?.name ?? layer.vizId}</span>
          {modCount > 0 && (
            <span className="layer-row__mods" title={`${modCount} modulated parameter${modCount > 1 ? 's' : ''}`}>
              ⦿ {modCount}
            </span>
          )}
          {layer.opacity < 1 && <span className="num">{Math.round(layer.opacity * 100)}%</span>}
        </div>
      </div>
      <span className="layer-row__err" ref={errRef} hidden data-tip="This layer threw an error, see the inspector">
        <IconWarn size={14} />
      </span>
      <button
        ref={moreRef}
        className="icon-btn icon-btn--sm layer-row__more"
        onClick={() => moreRef.current && p.onMore(moreRef.current)}
        aria-label="Layer actions"
        data-tip="Layer actions: rename, duplicate, reorder, delete"
      >
        <IconMore size={14} />
      </button>
      <button
        className={`icon-btn icon-btn--sm layer-row__eye ${layer.visible ? '' : 'is-off'}`}
        onClick={() => useStore.getState().updateLayer(layer.id, { visible: !layer.visible })}
        aria-label={layer.visible ? 'Hide layer' : 'Show layer'}
        data-tip={layer.visible ? 'Hide' : 'Show'}
        data-tip-kbd="H"
      >
        {layer.visible ? <IconEye size={14} /> : <IconEyeOff size={14} />}
      </button>
    </div>
  );
}

function RenameInput({ layer }: { layer: Layer }) {
  const [v, setV] = useState(layer.name);
  const done = (save: boolean) => {
    if (save && v.trim() && v !== layer.name) useStore.getState().updateLayer(layer.id, { name: v.trim() });
    useUi.getState().setRenaming(null);
  };
  return (
    <input
      className="text-input layer-row__rename"
      autoFocus
      value={v}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => done(true)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') done(true);
        if (e.key === 'Escape') done(false);
      }}
    />
  );
}
