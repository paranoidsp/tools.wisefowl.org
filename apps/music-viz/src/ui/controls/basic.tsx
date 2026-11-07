/** Small shared controls: Row, Section, Segmented, Toggle, Select, Color. */
import { useEffect, useState, type ReactNode } from 'react';
import { Dropdown, type DropdownOption } from '../Popover';
import { IconChevron } from '../icons';
import { useUi } from '../uiStore';

/**
 * Attributes that give a setting's label its explanatory tooltip.
 * Every control label goes through this so the whole inspector teaches the
 * same way: hover a label to learn what it does.
 */
export function tipAttrs(label: string, hint?: string, meta?: string) {
  if (!hint) return { 'data-tip': label.length > 14 ? label : undefined };
  return { 'data-tip': hint, 'data-tip-title': label, 'data-tip-meta': meta, 'data-tip-pos': 'left' as const };
}

/** The hint printed under a control when "Describe settings" is on. */
export function Description({ hint }: { hint?: string }) {
  const on = useUi((s) => s.showDescriptions);
  if (!on || !hint) return null;
  return <p className="ctl__desc">{hint}</p>;
}

export function Row({ label, hint, meta, children, className = '' }: { label: string; hint?: string; meta?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`ctl ${className}`}>
      <div className="ctl__label" {...tipAttrs(label, hint, meta)}>
        {label}
      </div>
      <div className="ctl__body">{children}</div>
      <Description hint={hint} />
    </div>
  );
}

export function Section({
  title,
  children,
  defaultOpen = true,
  storageKey,
  actions,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  storageKey?: string;
  actions?: ReactNode;
}) {
  const key = storageKey ? `mvs:section:${storageKey}` : null;
  const [open, setOpen] = useState(() => {
    if (!key) return defaultOpen;
    const v = localStorage.getItem(key);
    return v == null ? defaultOpen : v === '1';
  });
  useEffect(() => {
    if (key) localStorage.setItem(key, open ? '1' : '0');
  }, [key, open]);
  return (
    <section className={`section ${open ? 'is-open' : ''}`}>
      <div className="section__head">
        <button className="section__toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <IconChevron size={12} className="section__chev" />
          <span>{title}</span>
        </button>
        {actions && <div className="section__actions">{actions}</div>}
      </div>
      <div className="section__body">
        <div className="section__inner">{children}</div>
      </div>
    </section>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  size = 'md',
}: {
  value: T;
  options: { value: T; label: ReactNode; tip?: string }[];
  onChange(v: T): void;
  ariaLabel?: string;
  size?: 'sm' | 'md';
}) {
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div className={`segmented segmented--${size}`} role="radiogroup" aria-label={ariaLabel} style={{ ['--n' as string]: options.length, ['--i' as string]: idx }}>
      <div className="segmented__pill" />
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={o.value === value}
          className={`segmented__opt ${o.value === value ? 'is-on' : ''}`}
          onClick={() => onChange(o.value)}
          data-tip={o.tip}
          // longer explanations get the rich tooltip, titled with the option name
          data-tip-title={o.tip && o.tip.length > 48 && typeof o.label === 'string' ? o.label : undefined}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange(v: boolean): void; label?: string }) {
  return (
    <button role="switch" aria-checked={checked} aria-label={label} className={`toggle ${checked ? 'is-on' : ''}`} onClick={() => onChange(!checked)}>
      <span className="toggle__knob" />
    </button>
  );
}

/** Segmented if ≤ 4 short options, else a dropdown. */
export function Choice<T extends string>({ value, options, onChange, label }: { value: T; options: DropdownOption<T>[]; onChange(v: T): void; label?: string }) {
  const short = options.length <= 4 && options.reduce((n, o) => n + o.label.length, 0) <= 26;
  if (short) return <Segmented value={value} options={options.map((o) => ({ value: o.value, label: o.label, tip: o.hint }))} onChange={onChange} ariaLabel={label} />;
  return <Dropdown value={value} options={options} onChange={onChange} ariaLabel={label} />;
}

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
export function normHex(s: string): string | null {
  const m = s.trim().match(HEX);
  if (!m) return null;
  let h = m[1].toLowerCase();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return `#${h}`;
}

export function ColorField({ value, onChange, label }: { value: string; onChange(v: string): void; label?: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const h = normHex(draft);
    if (h) onChange(h);
    else setDraft(value);
  };
  return (
    <div className="colorfield">
      <label className="swatch" style={{ background: value }} data-tip="Pick colour">
        <input type="color" value={normHex(value) ?? '#000000'} onChange={(e) => onChange(e.target.value)} aria-label={label ?? 'Colour'} />
      </label>
      <input
        className="text-input text-input--hex num"
        value={draft.replace(/^#/, '').toUpperCase()}
        onChange={(e) => setDraft(`#${e.target.value.replace(/^#/, '')}`)}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setDraft(value);
            (e.target as HTMLInputElement).blur();
          }
        }}
        spellCheck={false}
        aria-label={`${label ?? 'Colour'} hex`}
        maxLength={7}
      />
    </div>
  );
}

/** Mini level meter (DOM-updated by caller via ref). */
export function Meter({ meterRef, className = '' }: { meterRef: React.Ref<HTMLDivElement>; className?: string }) {
  return (
    <div className={`meter ${className}`}>
      <div className="meter__fill" ref={meterRef} />
    </div>
  );
}
