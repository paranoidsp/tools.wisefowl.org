/** ⦿ modulation button + popover binding a numeric param to an audio feature. */
import { useEffect, useRef, useState } from 'react';
import { modSourceValue } from '../../core/compositor';
import { MOD_SOURCES, type ModSource, type Modulation } from '../../core/types';
import { IconMod, IconTrash } from '../icons';
import { stage } from '../../core/stage';
import { getLatestFeatures } from '../liveFeatures';
import { Popover } from '../Popover';
import { NumberControl } from './NumberControl';
import { MOD_HELP } from '../help';

interface Props {
  label: string;
  mod: Modulation | undefined;
  onChange(m: Modulation | null): void;
}

const SOURCE_GROUPS: { title: string; ids: ModSource[] }[] = [
  { title: 'Energy', ids: ['loudness', 'rms', 'bass', 'mid', 'treble'] },
  { title: 'Rhythm & timbre', ids: ['beatPulse', 'beatPhase', 'flux', 'centroidNorm', 'pitchNorm'] },
  { title: 'Free-running', ids: ['lfoSlow', 'lfoFast', 'random'] },
];
const BY_ID = Object.fromEntries(MOD_SOURCES.map((s) => [s.id, s]));

export function ModButton({ label, mod, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  // open beside the whole row (over the stage), not on top of the inspector
  const row = useRef<HTMLElement | null>(null);
  const src = mod ? BY_ID[mod.source] : null;
  return (
    <>
      <button
        ref={btn}
        className={`mod-btn ${mod ? 'is-on' : ''} ${open ? 'is-open' : ''}`}
        onClick={() => {
          row.current = btn.current?.closest('.ctl') ?? btn.current;
          setOpen((o) => !o);
        }}
        data-tip={mod ? `Modulated by ${src?.label} (${mod.amount > 0 ? '+' : ''}${Math.round(mod.amount * 100)}%)` : 'Modulate with audio'}
        aria-label={`Modulate ${label}`}
        aria-expanded={open}
      >
        <IconMod size={12} />
      </button>
      <Popover anchor={row} open={open} onClose={() => setOpen(false)} placement="left-start" className="modpop" offset={10}>
        <ModPanel label={label} mod={mod} onChange={onChange} onClose={() => setOpen(false)} />
      </Popover>
    </>
  );
}

function ModPanel({ label, mod, onChange, onClose }: Props & { onClose(): void }) {
  const meters = useRef<Partial<Record<ModSource, HTMLElement | null>>>({});
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const f = getLatestFeatures();
      if (f) {
        const t = stage.time();
        for (const s of MOD_SOURCES) {
          const el = meters.current[s.id];
          if (el) el.style.transform = `scaleX(${Math.max(0, Math.min(1, modSourceValue(s.id, f, t)))})`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const pick = (id: ModSource) => onChange(mod ? { ...mod, source: id } : { source: id, amount: 0.5, smooth: 0.3 });
  const hint = mod ? `${BY_ID[mod.source]?.label}: ${BY_ID[mod.source]?.hint}` : MOD_HELP.pick;

  return (
    <div className="modpanel">
      <div className="modpanel__head">
        <div>
          <div className="modpanel__eyebrow">Modulate</div>
          <div className="modpanel__title">{label}</div>
        </div>
        {mod && (
          <button
            className="icon-btn icon-btn--sm icon-btn--danger"
            onClick={() => {
              onChange(null);
              onClose();
            }}
            data-tip="Remove modulation"
            aria-label="Remove modulation"
          >
            <IconTrash size={14} />
          </button>
        )}
      </div>
      <div className="modpanel__hint">{MOD_HELP.header}</div>
      {SOURCE_GROUPS.map((g) => (
        <div key={g.title} className="modpanel__group">
          <div className="modpanel__glabel">{g.title}</div>
          <div className="modpanel__grid">
            {g.ids.map((id) => (
              <button key={id} className={`modsrc ${mod?.source === id ? 'is-on' : ''}`} onClick={() => pick(id)} data-tip={BY_ID[id]?.hint}>
                <span className="modsrc__label">{BY_ID[id]?.label}</span>
                <span className="modsrc__meter">
                  <span ref={(el) => void (meters.current[id] = el)} />
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="modpanel__hint">{hint}</div>
      {mod && (
        <div className="modpanel__controls">
          <NumberControl
            label="Amount"
            hint={MOD_HELP.amount}
            value={mod.amount}
            min={-1}
            max={1}
            step={0.01}
            defaultValue={0.5}
            bipolar
            onChange={(amount) => onChange({ ...mod, amount })}
            format={(v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`}
          />
          <NumberControl
            label="Smoothing"
            hint={MOD_HELP.smooth}
            value={mod.smooth}
            min={0}
            max={0.99}
            step={0.01}
            defaultValue={0.3}
            onChange={(smooth) => onChange({ ...mod, smooth })}
          />
        </div>
      )}
    </div>
  );
}
