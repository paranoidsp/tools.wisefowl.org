/**
 * One global tooltip, driven by attributes so any element can opt in:
 *   data-tip="Undo"  data-tip-kbd="⌘Z"  data-tip-pos="top|bottom|left|right"
 * Rich (explanatory) tooltips for settings add a bold title and a muted meta line:
 *   data-tip-title="Ring spacing"  data-tip-meta="Range 0–1 · default 0.5"
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface TipState {
  text: string;
  title: string | null;
  meta: string | null;
  kbd: string | null;
  x: number;
  y: number;
  pos: 'top' | 'bottom' | 'left' | 'right';
}

export function TooltipLayer() {
  const [tip, setTip] = useState<TipState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const current = useRef<Element | null>(null);
  const warm = useRef(0);

  useEffect(() => {
    const hide = () => {
      clearTimeout(timer.current);
      if (current.current) warm.current = performance.now();
      current.current = null;
      setTip(null);
    };
    const show = (el: Element) => {
      const text = el.getAttribute('data-tip');
      if (!text) return;
      const r = el.getBoundingClientRect();
      let pos = (el.getAttribute('data-tip-pos') as TipState['pos']) || (r.top < 120 ? 'bottom' : 'top');
      let x = r.left + r.width / 2;
      let y = pos === 'bottom' ? r.bottom + 7 : r.top - 7;
      if (pos === 'left') {
        x = r.left - 7;
        y = r.top + r.height / 2;
      } else if (pos === 'right') {
        x = r.right + 7;
        y = r.top + r.height / 2;
      }
      setTip({ text, title: el.getAttribute('data-tip-title'), meta: el.getAttribute('data-tip-meta'), kbd: el.getAttribute('data-tip-kbd'), x, y, pos });
    };
    const over = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const el = (e.target as Element | null)?.closest?.('[data-tip]') ?? null;
      if (el === current.current) return;
      clearTimeout(timer.current);
      current.current = el;
      setTip(null);
      if (!el) return;
      // explanatory tooltips come up a little sooner: they're how people learn the tool
      const cold = el.hasAttribute('data-tip-title') ? 350 : 480;
      const delay = performance.now() - warm.current < 600 ? 60 : cold;
      timer.current = setTimeout(() => el.isConnected && current.current === el && show(el), delay);
    };
    const down = () => hide();
    window.addEventListener('pointerover', over);
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('wheel', down, { passive: true });
    window.addEventListener('keydown', down);
    return () => {
      window.removeEventListener('pointerover', over);
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('wheel', down);
      window.removeEventListener('keydown', down);
    };
  }, []);

  if (!tip) return null;
  if (tip.title)
    return createPortal(
      <div className={`tooltip tooltip--rich tooltip--${tip.pos}`} style={{ left: tip.x, top: tip.y }} role="tooltip">
        <div className="tooltip__title">{tip.title}</div>
        <div className="tooltip__body">{tip.text}</div>
        {tip.meta && <div className="tooltip__meta">{tip.meta}</div>}
      </div>,
      document.body,
    );
  return createPortal(
    <div className={`tooltip tooltip--${tip.pos}`} style={{ left: tip.x, top: tip.y }} role="tooltip">
      <span>{tip.text}</span>
      {tip.kbd && <span className="tooltip__kbd">{tip.kbd}</span>}
    </div>,
    document.body,
  );
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const MOD_KEY = isMac ? '⌘' : 'Ctrl+';
export const SHIFT_KEY = isMac ? '⇧' : 'Shift+';
