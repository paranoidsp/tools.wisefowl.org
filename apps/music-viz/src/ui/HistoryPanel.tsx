/**
 * History: every visualization you've had, newest first. The top entry is the
 * one you're working on (auto-saved); the rest are checkpoints you can
 * rename, star (keep forever), restore or delete.
 */
import { useEffect, useRef, useState } from 'react';
import { useHistory, type HistoryEntry } from '../core/history';
import { rollRandom, saveCheckpoint } from './actions';
import { IconDice, IconEdit, IconSave, IconStar, IconTrash } from './icons';
import { MOD_KEY } from './Tooltip';
import { useUi } from './uiStore';
import { useStore } from '../core/store';

const ORIGIN_LABEL: Record<HistoryEntry['origin'], string> = {
  scene: 'Gallery scene',
  random: 'Random',
  import: 'Imported',
  new: 'New',
  restore: 'Restored',
  session: 'Session',
  checkpoint: 'Edited',
};

function ago(t: number, now: number): string {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** re-render every few seconds so "2 min ago" stays true */
function useNow(ms = 5000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function HistoryPanel() {
  const entries = useHistory((s) => s.entries);
  const savedAt = useHistory((s) => s.savedAt);
  const [filter, setFilter] = useState<'all' | 'kept'>('all');
  const now = useNow();
  const shown = filter === 'all' ? entries : entries.filter((e) => e.current || e.starred || e.named);
  const unprotected = entries.filter((e) => !e.current && !e.starred && !e.named).length;

  return (
    <div className="history">
      <div className="history__actions">
        <button className="btn btn--sm" onClick={() => saveCheckpoint()} data-tip="Freeze what you have now as a named checkpoint" data-tip-kbd={`${MOD_KEY}S`}>
          <IconSave size={14} /> <span>Save checkpoint</span>
        </button>
        <button className="btn btn--sm btn--icon" onClick={() => rollRandom()} data-tip="Try a random visualization (this one stays in History)" data-tip-kbd="G" aria-label="Random visualization">
          <IconDice size={15} />
        </button>
      </div>
      <div className="history__filter">
        <button className={filter === 'all' ? 'is-on' : ''} onClick={() => setFilter('all')}>
          All <span className="num">{entries.length}</span>
        </button>
        <button className={filter === 'kept' ? 'is-on' : ''} onClick={() => setFilter('kept')} data-tip="Only starred or renamed ones: these are never pruned">
          Kept
        </button>
        <span className="history__saved" data-tip="Your current visualization is saved in this browser every few seconds">
          {savedAt ? `Autosaved ${ago(savedAt, now)}` : 'Autosave on'}
        </span>
      </div>
      <ul className="history__list">
        {shown.map((e) => (
          <HistoryRow key={e.id} entry={e} now={now} />
        ))}
        {shown.length === 0 && <li className="history__empty">Nothing kept yet. Star ★ or rename a checkpoint to keep it.</li>}
      </ul>
      <p className="history__foot">
        Saved in this browser only (localStorage). The newest {60} unnamed checkpoints are kept; star or rename one to keep it for good.
        {unprotected > 0 && (
          <>
            {' '}
            <button className="link-btn" onClick={() => confirm(`Delete ${unprotected} unnamed, unstarred checkpoint${unprotected === 1 ? '' : 's'}?`) && useHistory.getState().clearUnprotected()}>
              Clear {unprotected} unkept
            </button>
          </>
        )}
      </p>
    </div>
  );
}

function HistoryRow({ entry: e, now }: { entry: HistoryEntry; now: number }) {
  const renaming = useHistory((s) => s.renamingId === e.id);
  const h = useHistory.getState();
  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(e.name);
  const row = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (renaming) {
      setDraft(e.name);
      row.current?.scrollIntoView({ block: 'nearest' });
      requestAnimationFrame(() => {
        input.current?.focus();
        input.current?.select();
      });
    }
  }, [renaming]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = () => {
    if (draft.trim() && draft.trim() !== e.name) h.rename(e.id, draft);
    h.setRenaming(null);
  };

  return (
    <li
      ref={row}
      className={`history__row ${e.current ? 'is-current' : ''}`}
      onDoubleClick={() => !e.current && h.restore(e.id)}
      data-tip={e.current ? undefined : 'Double-click to open this one'}
      data-tip-pos="right"
    >
      <div className="history__thumb">{e.thumb ? <img src={e.thumb} alt="" draggable={false} /> : <span className="history__thumb-empty" />}</div>
      <div className="history__body">
        {renaming ? (
          <input
            ref={input}
            className="history__rename"
            value={draft}
            onChange={(ev) => setDraft(ev.target.value)}
            onBlur={commit}
            onKeyDown={(ev) => {
              ev.stopPropagation();
              if (ev.key === 'Enter') commit();
              if (ev.key === 'Escape') h.setRenaming(null);
            }}
            aria-label="Checkpoint name"
          />
        ) : (
          <div className="history__name" title={e.name} onDoubleClick={(ev) => (ev.stopPropagation(), h.setRenaming(e.id))}>
            {e.name}
          </div>
        )}
        <div className="history__meta">
          {e.current ? <span className="history__live">Current · autosaving</span> : <span>{ORIGIN_LABEL[e.origin]}</span>}
        </div>
        <div className="history__meta">
          {ago(e.updatedAt, now)} · {e.layerCount} layer{e.layerCount === 1 ? '' : 's'}
          {e.starred ? ' · kept' : e.named ? ' · named' : ''}
        </div>
        {!e.current && (
          <button className="history__open" onClick={() => h.restore(e.id)}>
            Open
          </button>
        )}
      </div>
      <div className="history__tools">
        <button
          className={`icon-btn icon-btn--xs ${e.starred ? 'is-star' : ''}`}
          onClick={() => h.toggleStar(e.id)}
          aria-pressed={e.starred}
          aria-label={e.starred ? 'Unstar' : 'Star'}
          data-tip={e.starred ? 'Starred: kept until you delete it' : 'Star to keep it for good'}
        >
          <IconStar size={13} filled={e.starred} />
        </button>
        <button className="icon-btn icon-btn--xs" onClick={() => h.setRenaming(e.id)} aria-label="Rename" data-tip="Rename">
          <IconEdit size={12} />
        </button>
        {!e.current && (
          <button className="icon-btn icon-btn--xs" onClick={() => h.remove(e.id)} aria-label="Delete" data-tip="Delete this checkpoint">
            <IconTrash size={12} />
          </button>
        )}
      </div>
    </li>
  );
}

/** Layers | History switch at the top of the left panel. */
export function LeftTabs({ layerCount }: { layerCount: number }) {
  const view = useUi((s) => s.leftView);
  const set = useUi((s) => s.setLeftView);
  const n = useHistory((s) => s.entries.length);
  return (
    <div className="left-tabs" role="tablist">
      <button role="tab" aria-selected={view === 'layers'} className={view === 'layers' ? 'is-on' : ''} onClick={() => set('layers')}>
        Layers <span className="num">{layerCount || ''}</span>
      </button>
      <button
        role="tab"
        aria-selected={view === 'history'}
        className={view === 'history' ? 'is-on' : ''}
        onClick={() => set('history')}
        data-tip="Every visualization you've made or tried, auto-saved in this browser"
        data-tip-kbd="Y"
      >
        History <span className="num">{n}</span>
      </button>
    </div>
  );
}

/** The left panel in History view. */
export function HistoryView() {
  const layerCount = useStore((s) => s.layers.length);
  return (
    <div className="layers">
      <div className="panel-head">
        <LeftTabs layerCount={layerCount} />
      </div>
      <HistoryPanel />
    </div>
  );
}
