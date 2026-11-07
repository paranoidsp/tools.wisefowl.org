/**
 * Visualization history + autosave (localStorage).
 *
 * Model
 * - The visualization you're working on is the *current* entry. It is
 *   auto-saved every few seconds while you edit (doc + a small thumbnail).
 * - It becomes a frozen *checkpoint* when:
 *     · you replace it (random roll, Gallery scene, import, new, restore),
 *     · you press Save checkpoint (⌘S),
 *     · or every few minutes of continued editing.
 *   A fresh current entry then carries on from the same visualization.
 * - Checkpoints can be renamed, starred (kept forever), restored or deleted.
 *   Unstarred, unrenamed checkpoints beyond a cap are pruned oldest-first so
 *   storage stays bounded.
 */
import { create } from 'zustand';
import { engine } from '../audio/engine';
import { uid } from './defaults';
import { stage } from './stage';
import { useStore, type DocOrigin } from './store';
import type { ProjectFile } from './types';

export interface HistoryEntry {
  id: string;
  name: string;
  /** user gave it a name (kept from pruning, and not auto-renamed) */
  named: boolean;
  starred: boolean;
  /** still being auto-saved (exactly one entry at a time) */
  current: boolean;
  origin: DocOrigin | 'checkpoint';
  createdAt: number;
  updatedAt: number;
  layerCount: number;
  /** small webp/jpeg data URL, or '' if not captured yet */
  thumb: string;
  doc: ProjectFile;
}

const KEY = 'music-viz-studio:history:v1';
/** keep at most this many unprotected checkpoints */
const MAX_UNPROTECTED = 60;
const AUTOSAVE_MS = 3000;
/** while editing continuously, freeze a checkpoint this often */
const CHECKPOINT_EVERY_MS = 4 * 60 * 1000;
const THUMB_W = 192;
const THUMB_H = 120;

interface HistoryState {
  entries: HistoryEntry[];
  /** last time the current entry was written */
  savedAt: number;
  /** id of an entry whose name field should open in rename mode */
  renamingId: string | null;
  setRenaming(id: string | null): void;
  rename(id: string, name: string): void;
  toggleStar(id: string): void;
  remove(id: string): void;
  restore(id: string): void;
  /** freeze the current visualization as a checkpoint now; returns its id */
  checkpoint(name?: string): string | null;
  clearUnprotected(): void;
}

function load(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as HistoryEntry[];
    return Array.isArray(arr) ? arr.filter((e) => e && e.doc && e.id) : [];
  } catch {
    return [];
  }
}

let writeTimer: ReturnType<typeof setTimeout> | undefined;
function persistSoon() {
  clearTimeout(writeTimer);
  writeTimer = setTimeout(persistNow, 250);
}
function persistNow() {
  let entries = useHistory.getState().entries;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      localStorage.setItem(KEY, JSON.stringify(entries));
      return;
    } catch {
      // Quota: drop the oldest unprotected checkpoints (then their thumbnails) and retry.
      const victims = entries.filter((e) => !e.current && !e.starred && !e.named);
      if (victims.length) {
        const drop = new Set(victims.slice(-Math.max(1, Math.ceil(victims.length / 4))).map((e) => e.id));
        entries = entries.filter((e) => !drop.has(e.id));
      } else entries = entries.map((e, i) => (i > 10 ? { ...e, thumb: '' } : e));
      useHistory.setState({ entries });
    }
  }
}

function prune(entries: HistoryEntry[]): HistoryEntry[] {
  let unprotected = 0;
  return entries.filter((e) => {
    if (e.current || e.starred || e.named) return true;
    unprotected++;
    return unprotected <= MAX_UNPROTECTED;
  });
}

const thumbCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
/** Small thumbnail of the stage as it looks right now. */
function captureThumb(): string {
  const src = stage.canvas;
  if (!thumbCanvas || !src.width || !src.height) return '';
  thumbCanvas.width = THUMB_W;
  thumbCanvas.height = THUMB_H;
  const g = thumbCanvas.getContext('2d')!;
  // cover-crop the stage into 16:10
  const sa = src.width / src.height;
  const ta = THUMB_W / THUMB_H;
  let sw = src.width, sh = src.height, sx = 0, sy = 0;
  if (sa > ta) { sw = src.height * ta; sx = (src.width - sw) / 2; } else { sh = src.width / ta; sy = (src.height - sh) / 2; }
  try {
    g.drawImage(src, sx, sy, sw, sh, 0, 0, THUMB_W, THUMB_H);
    const url = thumbCanvas.toDataURL('image/webp', 0.72);
    return url.startsWith('data:image/webp') ? url : thumbCanvas.toDataURL('image/jpeg', 0.72);
  } catch {
    return '';
  }
}

/** Is the frame interesting enough to keep as a thumbnail (not a black screen)? */
function thumbHasContent(): boolean {
  if (!thumbCanvas) return false;
  const d = thumbCanvas.getContext('2d')!.getImageData(0, 0, THUMB_W, THUMB_H).data;
  let lit = 0;
  for (let i = 0; i < d.length; i += 4 * 7) if (d[i] + d[i + 1] + d[i + 2] > 60) lit++;
  return lit > 20;
}

function docNow(): ProjectFile {
  return useStore.getState().exportProject();
}

function fresh(origin: HistoryEntry['origin'], doc = docNow()): HistoryEntry {
  const now = Date.now();
  return { id: uid('h'), name: doc.name, named: false, starred: false, current: true, origin, createdAt: now, updatedAt: now, layerCount: doc.layers.length, thumb: '', doc };
}

export const useHistory = create<HistoryState>()((set, get) => ({
  entries: load(),
  savedAt: 0,
  renamingId: null,
  setRenaming: (renamingId) => set({ renamingId }),

  rename: (id, name) => {
    const n = name.trim();
    if (!n) return;
    set({ entries: get().entries.map((e) => (e.id === id ? { ...e, name: n, named: true, doc: { ...e.doc, name: n } } : e)) });
    // Renaming the live visualization (or the checkpoint just taken from it)
    // renames the project too, so the work you carry on with keeps the name.
    const isLive = get().entries.find((e) => e.id === id)?.current || id === lastFrozenId;
    if (isLive && useStore.getState().name !== n) {
      renameEcho = true; // this name change isn't an edit of the visualization
      useStore.getState().setName(n);
    }
    persistSoon();
  },
  toggleStar: (id) => {
    set({ entries: get().entries.map((e) => (e.id === id ? { ...e, starred: !e.starred } : e)) });
    persistSoon();
  },
  remove: (id) => {
    const e = get().entries.find((x) => x.id === id);
    if (!e || e.current) return;
    set({ entries: get().entries.filter((x) => x.id !== id) });
    persistSoon();
  },
  restore: (id) => {
    const e = get().entries.find((x) => x.id === id);
    if (!e || e.current) return;
    useStore.getState().loadProject(structuredClone(e.doc), 'restore');
  },
  checkpoint: (name) => {
    const cur = get().entries.find((e) => e.current);
    if (!cur) return null;
    saveCurrent(true);
    const frozenId = freezeCurrent(name);
    lastFrozenId = frozenId;
    // carry on editing the same visualization in a new current entry
    const next = fresh('checkpoint');
    next.name = useStore.getState().name;
    next.thumb = get().entries.find((e) => e.id === frozenId)?.thumb ?? '';
    set({ entries: prune([next, ...get().entries]) });
    lastCheckpoint = Date.now();
    persistSoon();
    return frozenId;
  },
  clearUnprotected: () => {
    set({ entries: get().entries.filter((e) => e.current || e.starred || e.named) });
    persistSoon();
  },
}));

let dirty = false;
let renameEcho = false;
/** checkpoint most recently frozen from the live visualization by checkpoint() */
let lastFrozenId: string | null = null;
let lastCheckpoint = Date.now();
/** changes since the last frozen checkpoint (so idle visualizations don't spawn duplicates) */
let editedSinceCheckpoint = false;

/** Write the live document (and a fresh thumbnail) into the current entry. */
function saveCurrent(withThumb: boolean) {
  const st = useHistory.getState();
  const cur = st.entries.find((e) => e.current);
  if (!cur) return;
  const doc = docNow();
  let thumb = cur.thumb;
  if (withThumb) {
    const t = captureThumb();
    if (t && (thumbHasContent() || !cur.thumb)) thumb = t;
  }
  const entries = st.entries.map((e) =>
    e.id === cur.id ? { ...e, doc, name: doc.name, layerCount: doc.layers.length, updatedAt: Date.now(), thumb } : e,
  );
  useHistory.setState({ entries, savedAt: Date.now() });
  dirty = false;
  persistSoon();
}

/** Turn the current entry into a checkpoint. Returns its id. */
function freezeCurrent(name?: string): string | null {
  const st = useHistory.getState();
  const cur = st.entries.find((e) => e.current);
  if (!cur) return null;
  const entries = st.entries.map((e) =>
    e.id === cur.id ? { ...e, current: false, ...(name ? { name, named: true, doc: { ...e.doc, name } } : {}) } : e,
  );
  useHistory.setState({ entries });
  editedSinceCheckpoint = false;
  return cur.id;
}

let started = false;
/** Wire history to the document store. Call once at startup. */
export function startHistory() {
  if (started) return;
  started = true;
  const st = useHistory.getState();
  // resume: if there is no current entry (first run), start one for the restored session
  if (!st.entries.some((e) => e.current)) {
    const o = useStore.getState().docOrigin;
    useHistory.setState({ entries: prune([fresh(o === 'session' ? 'session' : o), ...st.entries]) });
  }

  useStore.subscribe((s, prev) => {
    if (s.docEpoch !== prev.docEpoch) {
      // The whole visualization was replaced: freeze the old one (if it was
      // ever worth keeping) and start a new current entry.
      lastFrozenId = null;
      // The canvas still shows the outgoing visualization this instant
      // (the compositor draws the new one next frame): thumbnail it now.
      const outgoing = captureThumb();
      if (outgoing && thumbHasContent()) {
        const h0 = useHistory.getState();
        useHistory.setState({ entries: h0.entries.map((e) => (e.current ? { ...e, thumb: outgoing } : e)) });
      }
      // Edits made since the last autosave tick are only in `prev` now
      // (the store already holds the new document): save them first.
      if (dirty) {
        const prevDoc: ProjectFile = structuredClone({
          app: 'music-viz-studio', version: 1, name: prev.name, layers: prev.layers, color: prev.color, analysis: prev.analysis, post: prev.post,
        });
        const h1 = useHistory.getState();
        useHistory.setState({
          entries: h1.entries.map((e) => (e.current ? { ...e, doc: prevDoc, name: prevDoc.name, layerCount: prevDoc.layers.length, updatedAt: Date.now() } : e)),
        });
        dirty = false;
      }
      const h = useHistory.getState();
      const cur = h.entries.find((e) => e.current);
      if (cur) {
        const empty = cur.doc.layers.length === 0;
        const untouched = !editedSinceCheckpoint && cur.origin === 'checkpoint';
        const dud = discardCurrent && !editedSinceCheckpoint;
        discardCurrent = false;
        if (empty || untouched || dud) useHistory.setState({ entries: h.entries.filter((e) => e.id !== cur.id) });
        else freezeCurrent();
      }
      const next = fresh(s.docOrigin);
      useHistory.setState({ entries: prune([next, ...useHistory.getState().entries]) });
      lastCheckpoint = Date.now();
      persistSoon();
      // Give the new visualization a moment to draw before thumbnailing it.
      // Some build up over seconds (scrolling history, trails), so look again later.
      const epoch = s.docEpoch;
      for (const ms of [1200, 4000, 10000])
        setTimeout(() => useStore.getState().docEpoch === epoch && saveCurrent(true), ms);
      return;
    }
    const changed = s.layers !== prev.layers || s.color !== prev.color || s.analysis !== prev.analysis || s.post !== prev.post || s.name !== prev.name;
    if (!changed) return;
    dirty = true;
    // renaming in the top bar counts as naming it (protects it from pruning)
    if (s.name !== prev.name) {
      const h = useHistory.getState();
      useHistory.setState({ entries: h.entries.map((e) => (e.current ? { ...e, name: s.name, named: true } : e)) });
    }
    if (renameEcho) renameEcho = false; // a checkpoint rename echoing into the project isn't an edit
    else editedSinceCheckpoint = true;
  });

  // autosave tick
  setInterval(() => {
    if (dirty) saveCurrent(true);
    else if (useHistory.getState().entries.find((e) => e.current)?.thumb === '') saveCurrent(true);
    // periodic checkpoint while editing
    if (editedSinceCheckpoint && Date.now() - lastCheckpoint > CHECKPOINT_EVERY_MS) {
      const id = useHistory.getState().checkpoint();
      if (id) onAutoCheckpoint?.(id);
    }
  }, AUTOSAVE_MS);
  // paused visuals are dim: retake the thumbnail once music has been playing a moment
  let wasPlaying = engine.state.playing;
  engine.subscribe((es) => {
    if (es.playing && !wasPlaying) setTimeout(() => engine.state.playing && saveCurrent(true), 3500);
    wasPlaying = es.playing;
  });
  // refresh the current thumbnail now and then while music plays (visuals change even when settings don't)
  setInterval(() => {
    if (document.visibilityState === 'visible') saveCurrent(true);
  }, 30_000);
  const flush = () => {
    if (dirty) saveCurrent(false);
    clearTimeout(writeTimer);
    persistNow();
  };
  window.addEventListener('pagehide', flush);
  window.addEventListener('beforeunload', flush);
  setTimeout(() => saveCurrent(true), 1500);
}

let discardCurrent = false;
/** Drop (rather than keep) the current visualization when it's next replaced, unless it gets edited first. */
export function discardCurrentOnReplace() {
  discardCurrent = true;
}

/** UI hook: called when an automatic (timed) checkpoint is taken. */
export let onAutoCheckpoint: ((id: string) => void) | undefined;
export function setOnAutoCheckpoint(fn: (id: string) => void) {
  onAutoCheckpoint = fn;
}
