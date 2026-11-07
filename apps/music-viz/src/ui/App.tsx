/** App shell: top bar · (layers | stage | inspector) or a full-width view · transport. */
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../core/store';
import { GalleryView } from '../features/gallery/GalleryView';
import { LabView } from '../features/lab/LabView';
import { handleFiles } from './actions';
import { AddLayerPicker } from './AddLayerPicker';
import { Guide } from './Guide';
import { IconCheck, IconClose, IconUpload, IconWarn } from './icons';
import { Inspector } from './inspector/Inspector';
import { LayersPanel } from './LayersPanel';
import { installShortcuts } from './shortcuts';
import { Stage } from './Stage';
import { TooltipLayer } from './Tooltip';
import { TopBar } from './TopBar';
import { Transport } from './Transport';
import { dismissToast, useUi } from './uiStore';
import { HistoryView } from './HistoryPanel';

const RIGHT_KEY = 'mvs:inspector-width';

export function App() {
  const tab = useStore((s) => s.tab);
  const focus = useStore((s) => s.focusMode);
  const drawer = useUi((s) => s.drawer);
  const leftView = useUi((s) => s.leftView);
  const [rightW, setRightW] = useState(() => Number(localStorage.getItem(RIGHT_KEY)) || 0);

  useEffect(() => installShortcuts(), []);
  useEffect(() => {
    if (rightW) localStorage.setItem(RIGHT_KEY, String(rightW));
  }, [rightW]);
  useEffect(() => {
    if (tab !== 'studio') useUi.getState().setDrawer(null);
  }, [tab]);

  return (
    <div
      className={`app ${focus ? 'is-focus' : ''} ${drawer ? `drawer-${drawer}` : ''}`}
      data-tab={tab}
      style={rightW ? ({ '--right-w': `${rightW}px` } as React.CSSProperties) : undefined}
    >
      <TopBar />
      <div className="workspace">
        <div className="studio" aria-hidden={tab !== 'studio'}>
          <aside className="panel panel--left" aria-label="Layers">
            <div className="panel__inner">
              {leftView === 'layers' ? <LayersPanel /> : <HistoryView />}
            </div>
          </aside>
          <main className="center">
            <Stage />
          </main>
          <aside className="panel panel--right" aria-label="Inspector">
            <ResizeHandle onResize={setRightW} />
            <div className="panel__inner">
              <Inspector />
            </div>
          </aside>
          <div className="drawer-backdrop" onClick={() => useUi.getState().setDrawer(null)} />
        </div>
        {tab === 'gallery' && (
          <div className="view view--feature">
            <GalleryView />
          </div>
        )}
        {tab === 'lab' && (
          <div className="view view--feature">
            <LabView />
          </div>
        )}
        {tab === 'guide' && (
          <div className="view">
            <Guide />
          </div>
        )}
      </div>
      <Transport />
      <div className="small-screen-note">Music Viz Studio works best on a desktop-sized screen.</div>
      <Toasts />
      <DropOverlay />
      <AddLayerPicker />
      <TooltipLayer />
    </div>
  );
}

function ResizeHandle({ onResize }: { onResize(w: number): void }) {
  const start = useRef<{ x: number; w: number } | null>(null);
  return (
    <div
      className="resize-handle"
      onPointerDown={(e) => {
        const panel = (e.currentTarget as HTMLElement).parentElement!;
        start.current = { x: e.clientX, w: panel.getBoundingClientRect().width };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        document.body.classList.add('is-resizing');
      }}
      onPointerMove={(e) => {
        const s = start.current;
        if (!s) return;
        onResize(Math.round(Math.max(260, Math.min(480, s.w - (e.clientX - s.x)))));
      }}
      onPointerUp={() => {
        start.current = null;
        document.body.classList.remove('is-resizing');
      }}
      onDoubleClick={() => {
        localStorage.removeItem(RIGHT_KEY);
        onResize(0);
      }}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize inspector"
    />
  );
}

function Toasts() {
  const toasts = useUi((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.kind}`}>
          <span className="toast__icon">{t.kind === 'error' ? <IconWarn size={14} /> : t.kind === 'success' ? <IconCheck size={14} /> : <span className="toast__dot" />}</span>
          <span className="toast__msg">{t.message}</span>
          {t.action && (
            <button
              className="toast__action"
              onClick={() => {
                t.action!.run();
                dismissToast(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button className="toast__x" onClick={() => dismissToast(t.id)} aria-label="Dismiss">
            <IconClose size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

function DropOverlay() {
  const [over, setOver] = useState(false);
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      setOver(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setOver(false);
    };
    const overFn = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'copy';
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setOver(false);
      if (e.dataTransfer?.files.length) void handleFiles(e.dataTransfer.files);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', overFn);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', overFn);
      window.removeEventListener('drop', drop);
    };
  }, []);
  return (
    <div className={`drop-overlay ${over ? 'is-on' : ''}`} aria-hidden={!over}>
      <div className="drop-overlay__card">
        <div className="drop-overlay__icon">
          <IconUpload size={24} />
        </div>
        <div className="drop-overlay__title">Drop to open</div>
        <div className="drop-overlay__sub">Audio files play and drive the visuals · a project .json opens the project</div>
        <div className="drop-overlay__note">Nothing is uploaded; it all stays in your browser</div>
      </div>
    </div>
  );
}
