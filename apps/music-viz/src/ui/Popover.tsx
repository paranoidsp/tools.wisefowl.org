/**
 * Anchored floating surfaces: Popover (arbitrary content), Menu (actions),
 * Dropdown (select replacement with keyboard navigation).
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { IconCheck, IconChevron } from './icons';

export type Anchor = RefObject<HTMLElement | null> | { x: number; y: number };

interface PopoverProps {
  anchor: Anchor;
  open: boolean;
  onClose(): void;
  children: ReactNode;
  placement?: 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end' | 'left-start' | 'right-start';
  className?: string;
  /** match anchor width */
  matchWidth?: boolean;
  offset?: number;
}

export function Popover({ anchor, open, onClose, children, placement = 'bottom-start', className = '', matchWidth, offset = 6 }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; minWidth?: number } | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const place = () => {
      const el = ref.current;
      if (!el) return;
      let r: { left: number; top: number; right: number; bottom: number; width: number; height: number };
      if ('current' in anchor) {
        const a = anchor.current;
        if (!a) return;
        r = a.getBoundingClientRect();
      } else {
        r = { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y, width: 0, height: 0 };
      }
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let left = 0;
      let top = 0;
      const [side, align] = placement.split('-') as ['bottom' | 'top' | 'left' | 'right', 'start' | 'end'];
      if (side === 'bottom' || side === 'top') {
        left = align === 'end' ? r.right - w : r.left;
        top = side === 'bottom' ? r.bottom + offset : r.top - h - offset;
        if (side === 'bottom' && top + h > vh - 8 && r.top - h - offset > 8) top = r.top - h - offset;
        if (side === 'top' && top < 8) top = r.bottom + offset;
      } else {
        top = r.top;
        left = side === 'left' ? r.left - w - offset : r.right + offset;
        if (side === 'left' && left < 8) left = r.right + offset;
        if (side === 'right' && left + w > vw - 8) left = r.left - w - offset;
      }
      left = Math.max(8, Math.min(vw - w - 8, left));
      top = Math.max(8, Math.min(vh - h - 8, top));
      setPos({ left, top, minWidth: matchWidth ? r.width : undefined });
    };
    place();
    const raf = requestAnimationFrame(place);
    window.addEventListener('resize', place);
    // re-place when the content changes size (e.g. a section appears)
    const ro = new ResizeObserver(() => place());
    if (ref.current) ro.observe(ref.current);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', place);
    };
  }, [open, anchor, placement, matchWidth, offset]);

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if ('current' in anchor && anchor.current?.contains(t)) return;
      // nested popovers (portalled) mark themselves
      if ((t as Element).closest?.('.popover')) return;
      onCloseRef.current();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('keydown', key, true);
    };
  }, [open, anchor]);

  if (!open) return null;
  return createPortal(
    <div
      ref={ref}
      className={`popover ${pos ? 'popover--in' : ''} ${className}`}
      style={pos ? { left: pos.left, top: pos.top, minWidth: pos.minWidth } : { left: -9999, top: -9999 }}
    >
      {children}
    </div>,
    document.body,
  );
}

// ───────────────────────────────────────────────────────────────── menu ──

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  kbd?: string;
  danger?: boolean;
  disabled?: boolean;
  onSelect(): void;
}

export function Menu({ items, anchor, open, onClose, placement }: { items: (MenuItem | 'sep')[] } & Omit<PopoverProps, 'children'>) {
  return (
    <Popover anchor={anchor} open={open} onClose={onClose} placement={placement} className="menu">
      {items.map((it, i) =>
        it === 'sep' ? (
          <div key={i} className="menu__sep" />
        ) : (
          <button
            key={i}
            className={`menu__item ${it.danger ? 'menu__item--danger' : ''}`}
            disabled={it.disabled}
            onClick={() => {
              onClose();
              it.onSelect();
            }}
            autoFocus={i === 0}
          >
            <span className="menu__icon">{it.icon}</span>
            <span className="menu__label">{it.label}</span>
            {it.kbd && <span className="menu__kbd">{it.kbd}</span>}
          </button>
        ),
      )}
    </Popover>
  );
}

// ───────────────────────────────────────────────────────────── dropdown ──

export interface DropdownOption<T extends string | number> {
  value: T;
  label: string;
  hint?: string;
  group?: string;
}

interface DropdownProps<T extends string | number> {
  value: T;
  options: DropdownOption<T>[];
  onChange(v: T): void;
  placeholder?: string;
  className?: string;
  /** render the trigger label differently */
  renderValue?(o: DropdownOption<T> | undefined): ReactNode;
  ariaLabel?: string;
  icon?: ReactNode;
  wide?: boolean;
}

export function Dropdown<T extends string | number>({ value, options, onChange, placeholder, className = '', renderValue, ariaLabel, icon, wide }: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const sel = options.find((o) => o.value === value);
  const [hi, setHi] = useState(0);

  useEffect(() => {
    if (open) {
      const i = Math.max(0, options.findIndex((o) => o.value === value));
      setHi(i);
      requestAnimationFrame(() => {
        const el = list.current?.querySelector<HTMLElement>(`[data-i="${i}"]`);
        el?.scrollIntoView({ block: 'nearest' });
        list.current?.focus();
      });
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (i: number) => {
    const o = options[i];
    if (!o) return;
    onChange(o.value);
    setOpen(false);
    btn.current?.focus();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHi((h) => Math.min(options.length - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHi((h) => Math.max(0, h - 1));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      choose(hi);
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${hi}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [hi]);

  let lastGroup: string | undefined;
  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`dropdown ${open ? 'is-open' : ''} ${className}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setOpen(true);
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        {icon && <span className="dropdown__icon">{icon}</span>}
        <span className="dropdown__value">{renderValue ? renderValue(sel) : (sel?.label ?? <span className="dropdown__ph">{placeholder ?? 'Select…'}</span>)}</span>
        <IconChevron className="dropdown__chev" size={14} />
      </button>
      <Popover anchor={btn} open={open} onClose={() => setOpen(false)} matchWidth className={`listbox-pop ${wide ? 'listbox-pop--wide' : ''}`}>
        <div className="listbox" role="listbox" tabIndex={-1} ref={list} onKeyDown={onKey}>
          {options.map((o, i) => {
            const header = o.group && o.group !== lastGroup ? o.group : null;
            lastGroup = o.group;
            return (
              <div key={String(o.value)}>
                {header && <div className="listbox__group">{header}</div>}
                <div
                  data-i={i}
                  role="option"
                  aria-selected={o.value === value}
                  className={`listbox__opt ${i === hi ? 'is-hi' : ''} ${o.value === value ? 'is-sel' : ''}`}
                  onPointerEnter={() => setHi(i)}
                  onClick={() => choose(i)}
                >
                  <span className="listbox__check">{o.value === value && <IconCheck size={13} />}</span>
                  <span className="listbox__text">
                    <span className="listbox__label">{o.label}</span>
                    {o.hint && <span className="listbox__hint">{o.hint}</span>}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </Popover>
    </>
  );
}
