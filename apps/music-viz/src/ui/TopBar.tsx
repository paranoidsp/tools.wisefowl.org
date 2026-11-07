import { useEffect, useRef, useState } from 'react';
import { stage } from '../core/stage';
import { useStore, type TabId } from '../core/store';
import { exportProject, getWildness, openProjectDialog, rollRandom, setWildness, shuffleSelectedLayer, snapshot, toggleFullscreen, toggleRecording, type Wildness } from './actions';
import { Popover } from './Popover';
import { useHistory } from '../core/history';
import { IconArrowLeft, IconCheck, IconChevron, IconDice, IconCamera, IconDownload, IconFocus, IconFullscreen, IconMark, IconRecord, IconRedo, IconStop, IconUndo, IconUpload } from './icons';
import { MOD_KEY, SHIFT_KEY } from './Tooltip';
import { useUi } from './uiStore';
import { fmtTime } from './useEngine';

const TABS: { id: TabId; label: string; key: string }[] = [
  { id: 'studio', label: 'Studio', key: '1' },
  { id: 'gallery', label: 'Gallery', key: '2' },
  { id: 'lab', label: 'Mapping Lab', key: '3' },
  { id: 'guide', label: 'Guide', key: '4' },
];

/** "Saved" indicator next to the project name: autosave is otherwise invisible. */
function SaveState() {
  const savedAt = useHistory((s) => s.savedAt);
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 10_000);
    return () => clearInterval(id);
  }, []);
  if (!savedAt) return null;
  const s = Math.round((Date.now() - savedAt) / 1000);
  const when = s < 10 ? 'just now' : s < 60 ? `${s}s ago` : `${Math.round(s / 60)} min ago`;
  return (
    <button className="save-state" onClick={() => useUi.getState().setLeftView('history')} data-tip={`Auto-saved in this browser ${when}. Open History to see checkpoints.`}>
      Saved
    </button>
  );
}

const WILD_OPTS: { id: Wildness; label: string; hint: string }[] = [
  { id: 'mild', label: 'Mild', hint: 'Stays close to the presets: polished, a little predictable' },
  { id: 'medium', label: 'Medium', hint: 'Varies settings noticeably around the presets' },
  { id: 'wild', label: 'Wild', hint: 'Strays far: odd blends, extreme settings, surprises (and some duds)' },
];

/** 🎲 Random visualization, plus a menu for how wild and for shuffling one layer. */
function RandomButton() {
  const [open, setOpen] = useState(false);
  const [wild, setWild] = useState<Wildness>(getWildness());
  const caret = useRef<HTMLButtonElement>(null);
  return (
    <div className="split-btn">
      <button
        className="btn btn--sm split-btn__main"
        onClick={() => rollRandom(wild)}
        data-tip="Try a random visualization: a few random layers built from presets, with settings varied around them. The one you leave stays in History."
        data-tip-kbd="G"
      >
        <IconDice size={14} /> <span className="btn__label">Random</span>
      </button>
      <button ref={caret} className={`btn btn--sm split-btn__caret ${open ? 'is-open' : ''}`} onClick={() => setOpen((o) => !o)} aria-label="Random options" data-tip="Random options">
        <IconChevron size={12} />
      </button>
      <Popover anchor={caret} open={open} onClose={() => setOpen(false)} className="menu random-menu">
        <div className="menu__heading">How far from the presets</div>
        {WILD_OPTS.map((o) => (
          <button
            key={o.id}
            className="menu__item menu__item--tall"
            onClick={() => {
              setWild(o.id);
              setWildness(o.id);
              setOpen(false);
              rollRandom(o.id);
            }}
          >
            <span className="menu__icon">{wild === o.id ? <IconCheck size={13} /> : null}</span>
            <span className="menu__label">
              <span>{o.label}</span>
              <span className="menu__sub">{o.hint}</span>
            </span>
          </button>
        ))}
        <div className="menu__sep" />
        <button
          className="menu__item"
          onClick={() => {
            setOpen(false);
            shuffleSelectedLayer();
          }}
        >
          <span className="menu__icon">
            <IconDice size={13} />
          </span>
          <span className="menu__label">Shuffle the selected layer’s settings</span>
          <span className="menu__kbd">⇧G</span>
        </button>
      </Popover>
    </div>
  );
}

function ProjectName() {
  const name = useStore((s) => s.name);
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);
  const commit = () => {
    const v = draft.trim() || 'Untitled';
    if (v !== name) useStore.getState().setName(v);
    else setDraft(name);
  };
  return (
    <input
      className="project-name"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setDraft(name);
          setTimeout(() => (e.target as HTMLInputElement).blur());
        }
      }}
      aria-label="Project name"
      spellCheck={false}
      style={{ width: `${Math.max(8, Math.min(30, draft.length + 3))}ch` }}
    />
  );
}

function Fps() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const id = setInterval(() => {
      const el = ref.current;
      if (!el) return;
      const fps = stage.stats.fps;
      el.textContent = String(fps || '—');
      el.parentElement!.dataset.level = fps >= 50 ? 'good' : fps >= 30 ? 'ok' : 'bad';
    }, 500);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="fps num" data-tip="Stage frame rate" data-level="good">
      <span ref={ref}>—</span>
      <small>fps</small>
    </div>
  );
}

function RecordButton() {
  const recording = useUi((s) => s.recording);
  const startedAt = useUi((s) => s.recordStartedAt);
  const [, force] = useState(0);
  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => force((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [recording]);
  if (recording) {
    return (
      <button className="rec-btn is-rec" onClick={toggleRecording} data-tip="Stop recording" data-tip-kbd="R" aria-label="Stop recording">
        <span className="rec-dot" />
        <span className="num">{fmtTime((performance.now() - startedAt) / 1000)}</span>
        <IconStop size={12} />
      </button>
    );
  }
  return (
    <button className="icon-btn" onClick={toggleRecording} data-tip="Record WebM (video + audio)" data-tip-kbd="R" aria-label="Record video">
      <IconRecord size={16} />
    </button>
  );
}

export function TopBar() {
  const tab = useStore((s) => s.tab);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const focusMode = useStore((s) => s.focusMode);
  const s = useStore.getState();

  return (
    <header className="topbar">
      <div className="topbar__left">
        <a className="brand" href="/" data-tip="Back to Wisefowl Tools">
          <IconMark size={20} />
          <span className="brand__name">Music Viz Studio</span>
        </a>
        <a className="back-link" href="/">
          <IconArrowLeft size={12} /> Tools
        </a>
        <span className="topbar__sep" />
        <ProjectName />
        <SaveState />
        <RandomButton />
      </div>

      <nav className="tabs" role="tablist" aria-label="Views">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`tabs__tab ${tab === t.id ? 'is-on' : ''}`}
            onClick={() => s.setTab(t.id)}
            data-tip={t.label}
            data-tip-kbd={t.key}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="topbar__right">
        <div className="btn-group">
          <button className="icon-btn" disabled={!canUndo} onClick={s.undo} data-tip="Undo" data-tip-kbd={`${MOD_KEY}Z`} aria-label="Undo">
            <IconUndo size={16} />
          </button>
          <button className="icon-btn" disabled={!canRedo} onClick={s.redo} data-tip="Redo" data-tip-kbd={`${SHIFT_KEY}${MOD_KEY}Z`} aria-label="Redo">
            <IconRedo size={16} />
          </button>
        </div>
        <span className="topbar__sep" />
        <div className="btn-group">
          <button className="icon-btn" onClick={snapshot} data-tip="Snapshot PNG" data-tip-kbd="P" aria-label="Snapshot PNG">
            <IconCamera size={16} />
          </button>
          <RecordButton />
        </div>
        <span className="topbar__sep" />
        <div className="btn-group">
          <button className="icon-btn" onClick={openProjectDialog} data-tip="Import project (.json)" aria-label="Import project">
            <IconUpload size={16} />
          </button>
          <button className="icon-btn" onClick={exportProject} data-tip="Export project (.json)" data-tip-kbd={`${MOD_KEY}S`} aria-label="Export project">
            <IconDownload size={16} />
          </button>
        </div>
        <span className="topbar__sep" />
        <div className="btn-group">
          <button className={`icon-btn ${focusMode ? 'is-on' : ''}`} onClick={() => s.setFocusMode(!focusMode)} data-tip={focusMode ? 'Show panels' : 'Focus mode (hide panels)'} data-tip-kbd="F" aria-pressed={focusMode} aria-label="Focus mode">
            <IconFocus size={16} />
          </button>
          <button className="icon-btn" onClick={toggleFullscreen} data-tip="Fullscreen stage" data-tip-kbd={`${SHIFT_KEY}F`} aria-label="Fullscreen stage">
            <IconFullscreen size={16} />
          </button>
        </div>
        <Fps />
      </div>
    </header>
  );
}
