/**
 * Numeric parameter: label (scrubbable) · slider track · scrubbable value
 * field · optional trailing slot (modulation button).
 *
 * Scrub: drag horizontally on the label or value. Shift = fine, Alt/⌘ = coarse.
 * Click the value to type; Enter commits, Esc cancels. Arrow keys step
 * (Shift = ×10). Double-click the label or track to reset to default.
 * A live (modulated) value is drawn as an amber ghost marker via useLive().
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLive } from './live';
import { Description, tipAttrs } from './basic';

export interface NumberControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  defaultValue?: number;
  unit?: string;
  curve?: 'linear' | 'log';
  hint?: string;
  onChange(v: number): void;
  /** key for the live bus (ghost marker) */
  liveKey?: string;
  modulated?: boolean;
  /** fill from the centre (for −1..1 amounts) */
  bipolar?: boolean;
  trailing?: ReactNode;
  format?(v: number): string;
  /** hide the label column */
  noLabel?: boolean;
}

function decimalsOf(step: number) {
  if (step >= 1) return 0;
  const s = step.toString();
  if (s.includes('e-')) return Number(s.split('e-')[1]);
  return Math.min(6, (s.split('.')[1] ?? '').length);
}

export function defaultStep(min: number, max: number) {
  const r = (max - min) / 200;
  const p = Math.pow(10, Math.floor(Math.log10(r || 1)));
  return p;
}

export function makeScale(min: number, max: number, curve?: 'linear' | 'log') {
  const isLog = curve === 'log';
  const expo = isLog && min > 0;
  const toT = (v: number) => {
    const c = Math.min(max, Math.max(min, v));
    if (expo) return Math.log(c / min) / Math.log(max / min);
    const lin = (c - min) / (max - min || 1);
    return isLog ? Math.pow(lin, 1 / 2.5) : lin;
  };
  const fromT = (t: number) => {
    const u = Math.min(1, Math.max(0, t));
    if (expo) return min * Math.pow(max / min, u);
    return min + (max - min) * (isLog ? Math.pow(u, 2.5) : u);
  };
  return { toT, fromT };
}

/** "Range 0–1 · default 0.5 · drag label to scrub, double-click to reset" */
function numberMeta(p: NumberControlProps): string {
  const dec = decimalsOf(p.step ?? (p.max - p.min) / 100);
  const f = (v: number) => formatNumber(v, dec, p.unit);
  const parts = [`Range ${f(p.min)} – ${f(p.max)}`];
  if (p.defaultValue != null) parts.push(`default ${f(p.defaultValue)}`);
  if (p.trailing) parts.push('⦿ binds it to the music');
  return parts.join(' · ');
}

export function formatNumber(v: number, decimals: number, unit?: string) {
  let s: string;
  if ((unit === 'Hz' || unit === 'hz') && Math.abs(v) >= 1000) {
    s = `${(v / 1000).toFixed(Math.abs(v) >= 10000 ? 1 : 2)}k`;
  } else {
    s = v.toFixed(decimals);
  }
  if (s === '-0' || /^-0\.0*$/.test(s)) s = s.slice(1);
  if (!unit) return s;
  if (unit === '°' || unit === '%' || unit === 'x' || unit === '×') return s + unit;
  return `${s} ${unit}`;
}

export function NumberControl(p: NumberControlProps) {
  const { min, max, value, curve, unit, onChange, liveKey } = p;
  const step = p.step ?? defaultStep(min, max);
  const dec = decimalsOf(step);
  const { toT, fromT } = makeScale(min, max, curve);
  const t = toT(value);

  const quant = useCallback(
    (v: number) => {
      const c = Math.min(max, Math.max(min, v));
      const q = Math.round(c / step) * step;
      return Number(Math.min(max, Math.max(min, q)).toFixed(dec));
    },
    [min, max, step, dec],
  );

  const fmt = p.format ?? ((v: number) => formatNumber(v, dec, unit));

  // ── live ghost marker
  const ghost = useRef<HTMLDivElement>(null);
  const span = useRef<HTMLDivElement>(null);
  const baseT = useRef(t);
  baseT.current = t;
  useLive(liveKey, (v) => {
    const g = ghost.current;
    const sp = span.current;
    if (!g || !sp) return;
    if (v == null || !p.modulated) {
      g.style.opacity = '0';
      sp.style.opacity = '0';
      return;
    }
    const lt = toT(v);
    g.style.opacity = '1';
    g.style.left = `${lt * 100}%`;
    const a = Math.min(lt, baseT.current);
    const b = Math.max(lt, baseT.current);
    sp.style.opacity = '1';
    sp.style.left = `${a * 100}%`;
    sp.style.width = `${(b - a) * 100}%`;
  });
  useEffect(() => {
    if (!p.modulated) {
      if (ghost.current) ghost.current.style.opacity = '0';
      if (span.current) span.current.style.opacity = '0';
    }
  }, [p.modulated]);

  // ── slider dragging
  const track = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const setFromClientX = (x: number) => {
    const r = track.current!.getBoundingClientRect();
    onChange(quant(fromT((x - r.left) / r.width)));
  };
  const onTrackDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    (e.currentTarget as HTMLElement).focus();
    setDragging(true);
    setFromClientX(e.clientX);
  };
  const onTrackMove = (e: React.PointerEvent) => {
    if (dragging) setFromClientX(e.clientX);
  };
  const onTrackUp = () => setDragging(false);

  // ── scrubbing (label + value)
  const scrub = useRef<{ x: number; t: number; moved: boolean; id: number; fromValue: boolean } | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [scrubbing, setScrubbing] = useState(false);

  const onScrubDown = (fromValue: boolean) => (e: React.PointerEvent) => {
    if (e.button !== 0 || editing) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    scrub.current = { x: e.clientX, t, moved: false, id: e.pointerId, fromValue };
  };
  const onScrubMove = (e: React.PointerEvent) => {
    const s = scrub.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    if (!s.moved && Math.abs(dx) < 3) return;
    if (!s.moved) {
      s.moved = true;
      setScrubbing(true);
      document.body.classList.add('is-scrubbing');
    }
    const factor = e.shiftKey ? 0.1 : e.altKey || e.metaKey ? 4 : 1;
    // 260px of travel ≈ full range at normal speed
    const nt = s.t + (dx / 260) * factor;
    onChange(quant(fromT(nt)));
    // re-anchor when modifier changes speed mid-drag
    s.x = e.clientX;
    s.t = Math.min(1, Math.max(0, nt));
  };
  const onScrubUp = (e: React.PointerEvent) => {
    const s = scrub.current;
    scrub.current = null;
    document.body.classList.remove('is-scrubbing');
    setScrubbing(false);
    if (s && !s.moved && s.fromValue) {
      setDraft(String(Number(value.toFixed(Math.max(dec, 0)))));
      setEditing(true);
    }
    void e;
  };

  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commitDraft = () => {
    const raw = draft.trim().toLowerCase();
    let v = Number(raw.replace(/k$/, '')) * (raw.endsWith('k') ? 1000 : 1);
    if (raw !== '' && Number.isFinite(v)) {
      // allow typing out-of-step values, still clamped to range
      v = Math.min(max, Math.max(min, v));
      onChange(Number(v.toFixed(Math.max(dec, 3))));
    }
    setEditing(false);
  };

  const onKey = (e: React.KeyboardEvent) => {
    let d = 0;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') d = 1;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') d = -1;
    else if (e.key === 'Home') return onChange(min);
    else if (e.key === 'End') return onChange(max);
    else if (e.key === 'Enter' && e.currentTarget.classList.contains('num-field')) {
      e.preventDefault();
      setDraft(String(value));
      setEditing(true);
      return;
    } else return;
    e.preventDefault();
    e.stopPropagation();
    const mult = e.shiftKey ? 10 : 1;
    if (curve === 'log') onChange(quant(fromT(t + d * 0.01 * mult)));
    else onChange(quant(value + d * step * mult));
  };

  const reset = () => p.defaultValue != null && onChange(p.defaultValue);

  const fill = p.bipolar
    ? { left: `${Math.min(t, 0.5) * 100}%`, width: `${Math.abs(t - 0.5) * 100}%` }
    : { left: 0, width: `${t * 100}%` };

  return (
    <div className={`ctl ctl-num ${p.modulated ? 'is-mod' : ''} ${dragging || scrubbing ? 'is-active' : ''} ${p.noLabel ? 'ctl--nolabel' : ''}`}>
      {!p.noLabel && (
        <div
          className="ctl__label ctl__label--scrub"
          {...tipAttrs(p.label, p.hint, numberMeta(p))}
          onPointerDown={onScrubDown(false)}
          onPointerMove={onScrubMove}
          onPointerUp={onScrubUp}
          onDoubleClick={reset}
        >
          {p.label}
        </div>
      )}
      <div
        ref={track}
        className="slider"
        role="slider"
        tabIndex={0}
        aria-label={p.label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={fmt(value)}
        onPointerDown={onTrackDown}
        onPointerMove={onTrackMove}
        onPointerUp={onTrackUp}
        onPointerCancel={onTrackUp}
        onDoubleClick={reset}
        onKeyDown={onKey}
      >
        <div className="slider__rail">
          <div className="slider__fill" style={fill} />
          {p.bipolar && <div className="slider__center" />}
          <div className="slider__modspan" ref={span} />
        </div>
        <div className="slider__ghost" ref={ghost} />
        <div className="slider__thumb" style={{ left: `${t * 100}%` }} />
      </div>
      {editing ? (
        <input
          ref={inputRef}
          className="num-field num-field--edit num"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') commitDraft();
            else if (e.key === 'Escape') setEditing(false);
          }}
          aria-label={`${p.label} value`}
        />
      ) : (
        <div
          className="num-field num"
          tabIndex={0}
          role="spinbutton"
          aria-label={`${p.label} value`}
          aria-valuenow={value}
          onPointerDown={onScrubDown(true)}
          onPointerMove={onScrubMove}
          onPointerUp={onScrubUp}
          onKeyDown={onKey}
        >
          {fmt(value)}
        </div>
      )}
      {p.trailing ?? <span className="ctl__trail-spacer" />}
      <Description hint={p.hint} />
    </div>
  );
}
