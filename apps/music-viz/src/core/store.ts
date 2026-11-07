/**
 * App state (zustand). Holds the *document* (layers + mapping + post) with
 * undo/redo, plus light UI state. Audio playback state lives in the audio
 * engine, not here, so 60fps time updates never churn React.
 */
import { create } from 'zustand';
import { DEFAULT_ANALYSIS, DEFAULT_COLOR, DEFAULT_POST, makeLayer, uid } from './defaults';
import { getViz } from './registry';
import type {
  AnalysisSettings,
  ColorSettings,
  Layer,
  Modulation,
  ParamValue,
  PostSettings,
  ProjectFile,
  Scene,
} from './types';

export type TabId = 'studio' | 'gallery' | 'lab' | 'guide';
export type InspectorTab = 'layer' | 'mapping' | 'scene';

interface Doc {
  name: string;
  layers: Layer[];
  color: ColorSettings;
  analysis: AnalysisSettings;
  post: PostSettings;
}

export interface StoreState extends Doc {
  selectedId: string | null;
  tab: TabId;
  inspectorTab: InspectorTab;
  /** hide side panels for a clean stage */
  focusMode: boolean;
  past: Doc[];
  future: Doc[];

  // ui
  setTab(tab: TabId): void;
  setInspectorTab(tab: InspectorTab): void;
  setFocusMode(on: boolean): void;
  select(id: string | null): void;

  // layers
  addLayer(vizId: string, presetIndex?: number): string | null;
  removeLayer(id: string): void;
  duplicateLayer(id: string): void;
  moveLayer(id: string, toIndex: number): void;
  updateLayer(id: string, patch: Partial<Omit<Layer, 'id'>>): void;
  setParam(id: string, key: string, value: ParamValue): void;
  setModulation(id: string, key: string, mod: Modulation | null): void;
  applyPreset(id: string, presetIndex: number): void;
  resetLayerParams(id: string): void;

  // global
  setColor(patch: Partial<ColorSettings>): void;
  setAnalysis(patch: Partial<AnalysisSettings>): void;
  setPost(patch: Partial<PostSettings>): void;
  setName(name: string): void;

  // documents
  loadScene(scene: Scene): void;
  newProject(): void;
  exportProject(): ProjectFile;
  importProject(file: ProjectFile): void;

  // history
  undo(): void;
  redo(): void;
}

const STORAGE_KEY = 'music-viz-studio:project:v1';
const HISTORY_LIMIT = 100;
const HISTORY_COALESCE_MS = 450;

function docOf(s: Doc): Doc {
  return { name: s.name, layers: s.layers, color: s.color, analysis: s.analysis, post: s.post };
}

function loadSaved(): Doc | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as ProjectFile;
    if (p.app !== 'music-viz-studio') return null;
    return sanitize(p);
  } catch {
    return null;
  }
}

/** Fill in missing fields and drop layers whose viz no longer exists. */
function sanitize(p: Partial<ProjectFile>): Doc {
  const layers = (p.layers ?? [])
    .filter((l) => getViz(l.vizId))
    .map((l) => {
      const def = getViz(l.vizId)!;
      const base = makeLayer(def);
      return { ...base, ...l, params: { ...base.params, ...l.params }, transform: { ...base.transform, ...l.transform } };
    });
  return {
    name: p.name ?? 'Untitled',
    layers,
    color: { ...DEFAULT_COLOR, ...(p.color ?? {}) },
    analysis: { ...DEFAULT_ANALYSIS, ...(p.analysis ?? {}) },
    post: { ...DEFAULT_POST, ...(p.post ?? {}) },
  };
}

function sceneToDoc(scene: Scene): Doc {
  const layers: Layer[] = [];
  for (const sl of scene.layers) {
    const def = getViz(sl.vizId);
    if (def) layers.push(makeLayer(def, sl));
  }
  return {
    name: scene.name,
    layers,
    color: { ...DEFAULT_COLOR, ...(scene.color ?? {}) },
    analysis: { ...DEFAULT_ANALYSIS, ...(scene.analysis ?? {}) },
    post: { ...DEFAULT_POST, ...(scene.post ?? {}) },
  };
}

const emptyDoc = (): Doc => ({
  name: 'Untitled',
  layers: [],
  color: { ...DEFAULT_COLOR },
  analysis: { ...DEFAULT_ANALYSIS },
  post: { ...DEFAULT_POST },
});

/** Initial doc: last session, else the first curated scene (set in main.tsx), else empty. */
const initial: Doc = loadSaved() ?? emptyDoc();

let lastCommit = 0;
let lastCommitKey = '';

export const useStore = create<StoreState>()((set, get) => {
  /**
   * Apply a document change, recording history. Rapid changes with the same
   * key (e.g. a slider drag) coalesce into one undo step.
   */
  const commit = (key: string, fn: (s: StoreState) => Partial<Doc> & Partial<StoreState>) => {
    const s = get();
    const now = performance.now();
    const coalesce = key === lastCommitKey && now - lastCommit < HISTORY_COALESCE_MS;
    lastCommit = now;
    lastCommitKey = key;
    const patch = fn(s);
    set({
      ...patch,
      past: coalesce ? s.past : [...s.past, docOf(s)].slice(-HISTORY_LIMIT),
      future: [],
    });
  };

  const mapLayer = (id: string, f: (l: Layer) => Layer) => (s: StoreState) => ({
    layers: s.layers.map((l) => (l.id === id ? f(l) : l)),
  });

  return {
    ...initial,
    selectedId: initial.layers.at(-1)?.id ?? null,
    tab: 'studio',
    inspectorTab: 'layer',
    focusMode: false,
    past: [],
    future: [],

    setTab: (tab) => set({ tab }),
    setInspectorTab: (inspectorTab) => set({ inspectorTab }),
    setFocusMode: (focusMode) => set({ focusMode }),
    // Jump to the Layer tab only when a *different* layer is picked, so clicking
    // the current layer (or dragging it) doesn't yank you out of Mapping/Scene.
    select: (selectedId) =>
      set({ selectedId, inspectorTab: selectedId && selectedId !== get().selectedId ? 'layer' : get().inspectorTab }),

    addLayer: (vizId, presetIndex) => {
      const def = getViz(vizId);
      if (!def) return null;
      const layer = makeLayer(def, {}, presetIndex);
      commit('add', (s) => ({ layers: [...s.layers, layer], selectedId: layer.id, inspectorTab: 'layer' }));
      return layer.id;
    },
    removeLayer: (id) =>
      commit('remove', (s) => {
        const idx = s.layers.findIndex((l) => l.id === id);
        const layers = s.layers.filter((l) => l.id !== id);
        const next = layers[Math.min(idx, layers.length - 1)];
        return { layers, selectedId: s.selectedId === id ? (next?.id ?? null) : s.selectedId };
      }),
    duplicateLayer: (id) =>
      commit('dup', (s) => {
        const idx = s.layers.findIndex((l) => l.id === id);
        if (idx < 0) return {};
        const copy: Layer = { ...structuredClone(s.layers[idx]), id: uid(), name: `${s.layers[idx].name} copy` };
        const layers = [...s.layers];
        layers.splice(idx + 1, 0, copy);
        return { layers, selectedId: copy.id };
      }),
    moveLayer: (id, toIndex) =>
      commit('move', (s) => {
        const from = s.layers.findIndex((l) => l.id === id);
        if (from < 0) return {};
        const layers = [...s.layers];
        const [l] = layers.splice(from, 1);
        layers.splice(Math.max(0, Math.min(layers.length, toIndex)), 0, l);
        return { layers };
      }),
    updateLayer: (id, patch) =>
      commit(`layer:${id}:${Object.keys(patch).join(',')}`, mapLayer(id, (l) => ({ ...l, ...patch }))),
    setParam: (id, key, value) =>
      commit(`param:${id}:${key}`, mapLayer(id, (l) => ({ ...l, params: { ...l.params, [key]: value } }))),
    setModulation: (id, key, mod) =>
      commit(
        `mod:${id}:${key}`,
        mapLayer(id, (l) => {
          const modulations = { ...l.modulations };
          if (mod) modulations[key] = mod;
          else delete modulations[key];
          return { ...l, modulations };
        }),
      ),
    applyPreset: (id, presetIndex) =>
      commit(`preset:${id}`, (s) => {
        const layer = s.layers.find((l) => l.id === id);
        const def = layer && getViz(layer.vizId);
        if (!layer || !def) return {};
        const fresh = makeLayer(def, {}, presetIndex);
        return mapLayer(id, (l) => ({ ...l, name: fresh.name, params: fresh.params, modulations: fresh.modulations }))(s);
      }),
    resetLayerParams: (id) =>
      commit(`reset:${id}`, (s) => {
        const layer = s.layers.find((l) => l.id === id);
        const def = layer && getViz(layer.vizId);
        if (!layer || !def) return {};
        const fresh = makeLayer(def);
        return mapLayer(id, (l) => ({ ...l, params: fresh.params, modulations: {} }))(s);
      }),

    setColor: (patch) => commit(`color:${Object.keys(patch).join(',')}`, (s) => ({ color: { ...s.color, ...patch } })),
    setAnalysis: (patch) =>
      commit(`analysis:${Object.keys(patch).join(',')}`, (s) => ({ analysis: { ...s.analysis, ...patch } })),
    setPost: (patch) => commit(`post:${Object.keys(patch).join(',')}`, (s) => ({ post: { ...s.post, ...patch } })),
    setName: (name) => commit('name', () => ({ name })),

    loadScene: (scene) =>
      commit('scene', () => {
        const doc = sceneToDoc(scene);
        return { ...doc, selectedId: doc.layers.at(-1)?.id ?? null };
      }),
    newProject: () => commit('new', () => ({ ...emptyDoc(), selectedId: null })),
    exportProject: () => {
      const s = get();
      return { app: 'music-viz-studio', version: 1, ...structuredClone(docOf(s)) };
    },
    importProject: (file) =>
      commit('import', () => {
        const doc = sanitize(file);
        return { ...doc, selectedId: doc.layers.at(-1)?.id ?? null };
      }),

    undo: () => {
      const s = get();
      const prev = s.past.at(-1);
      if (!prev) return;
      lastCommitKey = '';
      set({ ...prev, past: s.past.slice(0, -1), future: [docOf(s), ...s.future] });
    },
    redo: () => {
      const s = get();
      const next = s.future[0];
      if (!next) return;
      lastCommitKey = '';
      set({ ...next, past: [...s.past, docOf(s)], future: s.future.slice(1) });
    },
  };
});

/** True if nothing was restored from localStorage (first visit). */
export const isFirstRun = initial.layers.length === 0 && !localStorage.getItem(STORAGE_KEY);

// Autosave the document (debounced).
let saveTimer: ReturnType<typeof setTimeout> | undefined;
useStore.subscribe((s, prev) => {
  if (s.layers === prev.layers && s.color === prev.color && s.analysis === prev.analysis && s.post === prev.post && s.name === prev.name)
    return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(useStore.getState().exportProject()));
    } catch {
      /* quota / private mode: ignore */
    }
  }, 400);
});

export function selectedLayer(s: StoreState): Layer | undefined {
  return s.layers.find((l) => l.id === s.selectedId);
}
