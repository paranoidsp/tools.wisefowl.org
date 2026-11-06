/**
 * Live-value bus: the inspector polls stage.effectiveParams in one rAF and
 * pushes modulated values straight to registered DOM setters (no React state).
 */
import { createContext, useContext, useEffect, useRef } from 'react';

export type LiveSetter = (v: number | null) => void;

export class LiveBus {
  private subs = new Map<string, Set<LiveSetter>>();
  register(key: string, fn: LiveSetter) {
    let s = this.subs.get(key);
    if (!s) this.subs.set(key, (s = new Set()));
    s.add(fn);
    return () => {
      s!.delete(fn);
    };
  }
  keys() {
    return this.subs.keys();
  }
  emit(key: string, v: number | null) {
    const s = this.subs.get(key);
    if (s) for (const fn of s) fn(v);
  }
}

export const LiveContext = createContext<LiveBus | null>(null);

/** Register a setter for live values of `key` (if inside a LiveContext). */
export function useLive(key: string | undefined, fn: LiveSetter) {
  const bus = useContext(LiveContext);
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!bus || !key) return;
    return bus.register(key, (v) => ref.current(v));
  }, [bus, key]);
}
