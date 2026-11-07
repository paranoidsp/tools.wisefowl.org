/**
 * Gradient editor: click the bar to add a stop, drag stops to move, drag a
 * stop down/away (or press Delete) to remove, pick each stop's colour below.
 */
import { useRef, useState } from 'react';
import type { GradientStop } from '../../core/types';
import { IconTrash } from '../icons';
import { ColorField } from './basic';

function hexToRgb(h: string): [number, number, number] {
  const m = h.replace('#', '');
  const n = parseInt(m.length === 3 ? m.split('').map((c) => c + c).join('') : m, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex([r, g, b]: [number, number, number]) {
  return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}

export function sampleGradient(stops: GradientStop[], t: number): string {
  const s = [...stops].sort((a, b) => a.pos - b.pos);
  if (!s.length) return '#000000';
  if (t <= s[0].pos) return s[0].color;
  if (t >= s[s.length - 1].pos) return s[s.length - 1].color;
  for (let i = 0; i < s.length - 1; i++) {
    const a = s[i];
    const b = s[i + 1];
    if (t >= a.pos && t <= b.pos) {
      const k = (t - a.pos) / (b.pos - a.pos || 1);
      const ca = hexToRgb(a.color);
      const cb = hexToRgb(b.color);
      return rgbToHex([ca[0] + (cb[0] - ca[0]) * k, ca[1] + (cb[1] - ca[1]) * k, ca[2] + (cb[2] - ca[2]) * k]);
    }
  }
  return s[0].color;
}

export function gradientCss(stops: GradientStop[]) {
  const s = [...stops].sort((a, b) => a.pos - b.pos);
  if (s.length === 1) return s[0].color;
  return `linear-gradient(90deg, ${s.map((x) => `${x.color} ${(x.pos * 100).toFixed(1)}%`).join(', ')})`;
}

export function GradientEditor({ value, onChange }: { value: GradientStop[]; onChange(v: GradientStop[]): void }) {
  const stops = value;
  const [sel, setSel] = useState(0);
  const [removing, setRemoving] = useState(false);
  const bar = useRef<HTMLDivElement>(null);
  const drag = useRef<{ idx: number; moved: boolean; y: number } | null>(null);
  const selIdx = Math.min(sel, stops.length - 1);

  const posFromX = (x: number) => {
    const r = bar.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (x - r.left) / r.width));
  };

  const emit = (next: GradientStop[], focusObj?: GradientStop) => {
    const sorted = [...next].sort((a, b) => a.pos - b.pos);
    onChange(sorted);
    if (focusObj) {
      const i = sorted.indexOf(focusObj);
      if (i >= 0) setSel(i);
    }
  };

  const addAt = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.grad__stop')) return;
    const pos = Number(posFromX(e.clientX).toFixed(3));
    const stop = { pos, color: sampleGradient(stops, pos) };
    emit([...stops, stop], stop);
  };

  const onStopDown = (i: number) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    (e.currentTarget as HTMLElement).focus();
    setSel(i);
    drag.current = { idx: i, moved: false, y: e.clientY };
  };
  const onStopMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    d.moved = true;
    const away = Math.abs(e.clientY - d.y) > 28 && stops.length > 2;
    setRemoving(away);
    const pos = Number(posFromX(e.clientX).toFixed(3));
    const cur = stops[d.idx];
    if (!cur || cur.pos === pos) return;
    const moved = { ...cur, pos };
    const next = stops.map((s, j) => (j === d.idx ? moved : s));
    const sorted = [...next].sort((a, b) => a.pos - b.pos);
    d.idx = sorted.indexOf(moved);
    setSel(d.idx);
    onChange(sorted);
  };
  const onStopUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d && removing && stops.length > 2) {
      remove(d.idx);
    }
    setRemoving(false);
  };

  const remove = (i: number) => {
    if (stops.length <= 2) return;
    onChange(stops.filter((_, j) => j !== i));
    setSel(Math.max(0, i - 1));
  };

  const onStopKey = (i: number) => (e: React.KeyboardEvent) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      e.stopPropagation();
      remove(i);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      const d = (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 0.05 : 0.01);
      const moved = { ...stops[i], pos: Number(Math.min(1, Math.max(0, stops[i].pos + d)).toFixed(3)) };
      emit(stops.map((s, j) => (j === i ? moved : s)), moved);
    }
  };

  const cur = stops[selIdx];
  return (
    <div className="grad">
      <div className="grad__barwrap">
        <div ref={bar} className="grad__bar" onPointerDown={addAt} data-tip="Click to add a stop" data-tip-pos="top">
          <div className="grad__fill" style={{ background: gradientCss(stops) }} />
        </div>
        <div className="grad__stops">
          {stops.map((s, i) => (
            <button
              key={i}
              className={`grad__stop ${i === selIdx ? 'is-sel' : ''} ${i === selIdx && removing ? 'is-removing' : ''}`}
              style={{ left: `${s.pos * 100}%`, ['--c' as string]: s.color }}
              onPointerDown={onStopDown(i)}
              onPointerMove={onStopMove}
              onPointerUp={onStopUp}
              onPointerCancel={onStopUp}
              onKeyDown={onStopKey(i)}
              aria-label={`Stop ${i + 1} at ${Math.round(s.pos * 100)}%`}
            />
          ))}
        </div>
      </div>
      {cur && (
        <div className="grad__detail">
          <ColorField value={cur.color} onChange={(c) => onChange(stops.map((s, j) => (j === selIdx ? { ...s, color: c } : s)))} label="Stop colour" />
          <span className="grad__pos num">{Math.round(cur.pos * 100)}%</span>
          <button
            className="icon-btn icon-btn--sm"
            disabled={stops.length <= 2}
            onClick={() => remove(selIdx)}
            data-tip="Remove stop"
            data-tip-kbd="Del"
            aria-label="Remove stop"
          >
            <IconTrash size={14} />
          </button>
          <button
            className="text-btn"
            onClick={() => onChange(stops.map((s) => ({ ...s, pos: Number((1 - s.pos).toFixed(3)) })).sort((a, b) => a.pos - b.pos))}
            data-tip="Reverse gradient"
          >
            Reverse
          </button>
        </div>
      )}
    </div>
  );
}
