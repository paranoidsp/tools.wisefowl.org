/** Global keyboard shortcuts (ignored while typing in inputs). */
import { engine } from '../audio/engine';
import { useStore, type TabId } from '../core/store';
import { exportProject, openAudioDialog, rollRandom, saveCheckpoint, shuffleSelectedLayer, snapshot, toggleFullscreen, togglePlay, toggleRecording } from './actions';
import { useUi } from './uiStore';

export interface Shortcut {
  keys: string[];
  label: string;
  group: string;
}

export const SHORTCUTS: Shortcut[] = [
  { group: 'Playback', keys: ['Space'], label: 'Play / pause' },
  { group: 'Playback', keys: ['←', '→'], label: 'Seek ±5 s (Shift: ±15 s)' },
  { group: 'Playback', keys: ['L'], label: 'Toggle loop' },
  { group: 'Playback', keys: ['M'], label: 'Mute / unmute' },
  { group: 'Playback', keys: ['O'], label: 'Open audio file' },
  { group: 'Layers', keys: ['A'], label: 'Add layer' },
  { group: 'Layers', keys: ['[', ']'], label: 'Select layer below / above' },
  { group: 'Layers', keys: ['H'], label: 'Hide / show selected layer' },
  { group: 'Layers', keys: ['⌘/Ctrl', 'D'], label: 'Duplicate layer' },
  { group: 'Layers', keys: ['Delete'], label: 'Delete layer' },
  { group: 'Edit', keys: ['⌘/Ctrl', 'Z'], label: 'Undo' },
  { group: 'Edit', keys: ['⇧', '⌘/Ctrl', 'Z'], label: 'Redo' },
  { group: 'Edit', keys: ['⌘/Ctrl', 'S'], label: 'Save a checkpoint (and name it)' },
  { group: 'Edit', keys: ['⇧', '⌘/Ctrl', 'S'], label: 'Export project JSON' },
  { group: 'Explore', keys: ['G'], label: 'Random visualization (the current one stays in History)' },
  { group: 'Explore', keys: ['⇧', 'G'], label: 'Shuffle the selected layer’s settings' },
  { group: 'Explore', keys: ['Y'], label: 'Show Layers / History' },
  { group: 'View', keys: ['1', '–', '4'], label: 'Studio · Gallery · Lab · Guide' },
  { group: 'View', keys: ['F'], label: 'Focus mode (hide panels)' },
  { group: 'View', keys: ['⇧', 'F'], label: 'Fullscreen stage' },
  { group: 'View', keys: ['P'], label: 'Snapshot PNG' },
  { group: 'View', keys: ['I'], label: 'Describe settings (show explanations inline)' },
  { group: 'View', keys: ['R'], label: 'Start / stop recording' },
  { group: 'View', keys: ['?'], label: 'Open this guide' },
];

const TABS: TabId[] = ['studio', 'gallery', 'lab', 'guide'];

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (t as HTMLInputElement).type;
    return !['checkbox', 'radio', 'range', 'button', 'color'].includes(type);
  }
  return false;
}

export function installShortcuts(): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.defaultPrevented || isTyping(e)) return;
    if (document.querySelector('.modal-backdrop')) return; // modal handles its own keys
    const s = useStore.getState();
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key;
    const sel = s.selectedId;
    const run = (fn: () => void) => {
      e.preventDefault();
      fn();
    };

    if (mod) {
      const lower = k.toLowerCase();
      if (lower === 'z' && !e.shiftKey) return run(s.undo);
      if ((lower === 'z' && e.shiftKey) || lower === 'y') return run(s.redo);
      if (lower === 'd' && sel) return run(() => s.duplicateLayer(sel));
      if (lower === 's' && e.shiftKey) return run(exportProject);
      if (lower === 's') return run(saveCheckpoint);
      return;
    }
    if (e.altKey) return;

    // focused widgets that use arrows/space themselves
    const t = e.target as HTMLElement;
    const widget = t.closest?.('[role="slider"], [role="spinbutton"], [role="listbox"], [role="radiogroup"], button, a');
    // Space is always play/pause (like a DAW), even with a button focused.
    if (widget && k === 'Enter') return;
    if (widget?.matches('[role="listbox"]') && k === ' ') return;
    if (widget?.matches('[role="slider"], [role="spinbutton"], [role="listbox"]') && k.startsWith('Arrow')) return;

    switch (k) {
      case ' ':
        return run(() => togglePlay());
      case 'ArrowLeft':
      case 'ArrowRight': {
        if (engine.state.kind !== 'file' && engine.state.kind !== 'demo') return;
        const d = (k === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 15 : 5);
        return run(() => engine.seek(Math.max(0, Math.min(engine.state.duration, engine.currentTime() + d))));
      }
      case 'Delete':
      case 'Backspace':
        if (sel && s.tab === 'studio') return run(() => s.removeLayer(sel));
        return;
      case 'h':
      case 'H': {
        const l = s.layers.find((x) => x.id === sel);
        if (l) return run(() => s.updateLayer(l.id, { visible: !l.visible }));
        return;
      }
      case 'f':
        return run(() => s.setFocusMode(!s.focusMode));
      case 'g':
        return run(() => rollRandom());
      case 'G':
        return run(shuffleSelectedLayer);
      case 'y':
      case 'Y': {
        const ui = useUi.getState();
        return run(() => ui.setLeftView(ui.leftView === 'history' ? 'layers' : 'history'));
      }
      case 'i':
      case 'I': {
        const ui = useUi.getState();
        return run(() => ui.setShowDescriptions(!ui.showDescriptions));
      }
      case 'F':
        return run(toggleFullscreen);
      case 'l':
      case 'L':
        return run(() => engine.setLoop(!engine.state.loop));
      case 'm':
      case 'M':
        return run(() => engine.setVolume(engine.state.volume > 0 ? 0 : 0.8));
      case 'o':
      case 'O':
        return run(() => void openAudioDialog());
      case 'a':
      case 'A':
        return run(() => {
          s.setTab('studio');
          useUi.getState().setPickerOpen(true);
        });
      case 'p':
      case 'P':
        return run(() => void snapshot());
      case 'r':
      case 'R':
        return run(toggleRecording);
      case '1':
      case '2':
      case '3':
      case '4':
        return run(() => s.setTab(TABS[Number(k) - 1]));
      case '?':
        return run(() => s.setTab('guide'));
      case '[':
      case ']': {
        if (!s.layers.length) return;
        const idx = s.layers.findIndex((l) => l.id === sel);
        // `]` = up the stack (towards the top layer)
        const next = idx < 0 ? s.layers.length - 1 : Math.max(0, Math.min(s.layers.length - 1, idx + (k === ']' ? 1 : -1)));
        return run(() => s.select(s.layers[next].id));
      }
      case 'Escape':
        if (s.focusMode) return run(() => s.setFocusMode(false));
        if (useUi.getState().drawer) return run(() => useUi.getState().setDrawer(null));
        return;
    }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
