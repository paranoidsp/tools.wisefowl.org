/** React binding for the audio engine's (non-per-frame) state. */
import { useSyncExternalStore } from 'react';
import { engine } from '../audio/engine';
import type { EngineState } from '../core/engine-api';

let snap: EngineState = { ...engine.state };
const listeners = new Set<() => void>();

engine.subscribe((s) => {
  snap = { ...s };
  for (const fn of listeners) fn();
});

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Re-read engine.state (for engines that mutate without notifying). */
export function refreshEngineState() {
  const s = engine.state;
  if (
    s.kind !== snap.kind ||
    s.name !== snap.name ||
    s.playing !== snap.playing ||
    s.loading !== snap.loading ||
    s.error !== snap.error ||
    s.duration !== snap.duration ||
    s.volume !== snap.volume ||
    s.loop !== snap.loop ||
    s.overview !== snap.overview
  ) {
    snap = { ...s };
    for (const fn of listeners) fn();
  }
}

export function useEngineState(): EngineState {
  return useSyncExternalStore(subscribe, () => snap);
}

export function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  if (m >= 60) return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
