/**
 * Mapping Lab — an explanatory playground for the colour mappings.
 *
 * Everything here reads and writes the *global* colour settings, so whatever
 * you set in the Lab restyles the Studio too.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  COLOR_MODES,
  FREQ_MAX,
  FREQ_MIN,
  GRADIENT_PRESETS,
  LIGHT_MAX_THZ,
  LIGHT_MIN_THZ,
  MODE_INFO,
  NOTE_NAMES,
  SPEED_OF_LIGHT,
  createColorMapper,
  freqToLightWavelength,
  gradientCss,
  hzFromMidi,
  midiFromHz,
  midiName,
  noteName,
  rgbToHex,
  wavelengthToRGB,
} from '../../color';
import { DEFAULT_COLOR } from '../../core/defaults';
import { useStore } from '../../core/store';
import type { ColorMapper, ColorMode, ColorSettings, RGB } from '../../core/types';
import { getLatestFeatures, latestFeaturesAt } from '../../ui/liveFeatures';
import './lab.css';

const MIDI_LO = 21; // A0
const MIDI_HI = 108; // C8
const BLACK = new Set([1, 3, 6, 8, 10]);

function lum(c: RGB) {
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const fmtHz = (hz: number) => (hz >= 1000 ? `${(hz / 1000).toFixed(hz >= 10000 ? 1 : 2)} kHz` : `${hz.toFixed(hz < 100 ? 2 : 1)} Hz`);

// ───────────────────────────────────────────────────────────── controls ──

function Slider({ label, value, min, max, step = 0.01, onChange, format, hint }: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; format?: (v: number) => string; hint?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="lab-slider" title={hint}>
      <span className="lab-slider__label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ ['--pct' as string]: `${pct}%` }}
      />
      <span className="lab-slider__val">{format ? format(value) : value.toFixed(2)}</span>
    </label>
  );
}

function Card({ title, sub, children, className = '', actions }: { title: string; sub?: ReactNode; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={`lab-card ${className}`}>
      <header className="lab-card__head">
        <div>
          <h2 className="lab-card__title">{title}</h2>
          {sub && <p className="lab-card__sub">{sub}</p>}
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}

// ───────────────────────────────────────────────────────────── sections ──

function ModePanel({ color, setColor }: { color: ColorSettings; setColor: (p: Partial<ColorSettings>) => void }) {
  const info = MODE_INFO[color.mode];
  const hueUsed = color.mode !== 'gradient';
  return (
    <Card title="Mapping" sub="Pick how sound becomes colour. These settings are global, so they change the Studio too." className="lab-mode">
      <div className="lab-seg" role="tablist">
        {COLOR_MODES.map((m) => (
          <button key={m} role="tab" aria-selected={color.mode === m} className={`lab-seg__btn${color.mode === m ? ' is-on' : ''}`} onClick={() => setColor({ mode: m })}>
            {MODE_INFO[m].label}
          </button>
        ))}
      </div>
      <div className="lab-explain">
        <div className="lab-explain__short">{info.short}</div>
        <p>{info.explanation}</p>
      </div>
      <div className="lab-controls">
        {hueUsed && (
          <Slider
            label={color.mode === 'light-octave' ? 'Fold shift' : 'Hue offset'}
            value={color.hueOffset}
            min={0}
            max={360}
            step={1}
            onChange={(v) => setColor({ hueOffset: v })}
            format={(v) => (color.mode === 'light-octave' ? `${((v / 360) * 12).toFixed(1)} st` : `${Math.round(v)}°`)}
            hint={info.hueOffsetMeaning}
          />
        )}
        {color.mode === 'spectral' && (
          <>
            <Slider label="Start hue" value={color.hueStart} min={0} max={360} step={1} onChange={(v) => setColor({ hueStart: v })} format={(v) => `${Math.round(v)}°`} />
            <Slider label="End hue" value={color.hueEnd} min={0} max={360} step={1} onChange={(v) => setColor({ hueEnd: v })} format={(v) => `${Math.round(v)}°`} />
          </>
        )}
        <Slider label="Saturation" value={color.saturation} min={0} max={1} onChange={(v) => setColor({ saturation: v })} />
        <Slider label="Lightness" value={color.lightness} min={0} max={1} onChange={(v) => setColor({ lightness: v })} hint="0.5 = the mode’s native colour; lower darkens, higher tints toward white" />
        <Slider label="Intensity → brightness" value={color.intensityToBrightness} min={0} max={1} onChange={(v) => setColor({ intensityToBrightness: v })} hint="How much loudness dims or brightens a colour" />
        <Slider label="Gamma" value={color.gamma} min={0.25} max={4} onChange={(v) => setColor({ gamma: v })} hint="Bends palette position (gradient / spectral / norm)" />
        <Slider label="A4 tuning" value={color.a4} min={415} max={466} step={0.5} onChange={(v) => setColor({ a4: v })} format={(v) => `${v.toFixed(1)} Hz`} />
      </div>
      {color.mode === 'gradient' && (
        <div className="lab-presets">
          {GRADIENT_PRESETS.map((g) => (
            <button key={g.id} className="lab-gpreset" onClick={() => setColor({ gradient: g.stops.map((s) => ({ ...s })) })} title={g.name}>
              <span className="lab-gpreset__sw" style={{ background: gradientCss(g.stops) }} />
              <span>{g.name}</span>
            </button>
          ))}
        </div>
      )}
      <div className="lab-mode__foot">
        <span className="lab-muted">{info.hueOffsetMeaning}</span>
        <button className="lab-linkbtn" onClick={() => setColor({ ...DEFAULT_COLOR, mode: color.mode })}>Reset settings</button>
      </div>
    </Card>
  );
}

function PitchWheel({ mapper, highlight }: { mapper: ColorMapper; highlight: number | null }) {
  const R = 100, r0 = 52;
  const wedges = [];
  for (let i = 0; i < 12; i++) {
    const a0 = ((i - 0.5) / 12) * Math.PI * 2 - Math.PI / 2;
    const a1 = ((i + 0.5) / 12) * Math.PI * 2 - Math.PI / 2;
    const p = (rad: number, a: number) => `${(Math.cos(a) * rad).toFixed(2)} ${(Math.sin(a) * rad).toFixed(2)}`;
    const d = `M ${p(r0, a0)} L ${p(R, a0)} A ${R} ${R} 0 0 1 ${p(R, a1)} L ${p(r0, a1)} A ${r0} ${r0} 0 0 0 ${p(r0, a0)} Z`;
    const c = mapper.pitchClass(i);
    const am = (i / 12) * Math.PI * 2 - Math.PI / 2;
    wedges.push(
      <g key={i} className={highlight === i ? 'is-hl' : ''}>
        <path d={d} fill={rgbToHex(c)} stroke="#0a0b0e" strokeWidth={1.5} />
        <text x={Math.cos(am) * 76} y={Math.sin(am) * 76} textAnchor="middle" dominantBaseline="central" fill={lum(c) > 0.45 ? '#0a0b0e' : '#fff'} fontSize={11} fontWeight={600}>
          {NOTE_NAMES[i]}
        </text>
      </g>,
    );
  }
  // continuous inner ring
  const fine = [];
  const N = 120;
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2 - Math.PI / 2 - Math.PI / 12 / 2;
    const a1 = ((i + 1.2) / N) * Math.PI * 2 - Math.PI / 2 - Math.PI / 12 / 2;
    const rr = 44, rr0 = 36;
    const p = (rad: number, a: number) => `${(Math.cos(a) * rad).toFixed(2)} ${(Math.sin(a) * rad).toFixed(2)}`;
    fine.push(<path key={i} d={`M ${p(rr0, a0)} L ${p(rr, a0)} L ${p(rr, a1)} L ${p(rr0, a1)} Z`} fill={rgbToHex(mapper.pitchClass(((i / N) * 12 - 0.5 + 12) % 12))} />);
  }
  return (
    <svg className="lab-wheel" viewBox="-108 -108 216 216" role="img" aria-label="Pitch-class colour wheel">
      {wedges}
      {fine}
      <text x={0} y={-3} textAnchor="middle" fill="#8a8f9c" fontSize={8.5}>pitch</text>
      <text x={0} y={8} textAnchor="middle" fill="#8a8f9c" fontSize={8.5}>class</text>
    </svg>
  );
}

function Piano({ mapper, a4, hover, setHover, fundamental, setFundamental }: {
  mapper: ColorMapper; a4: number; hover: number | null; setHover: (m: number | null) => void; fundamental: number; setFundamental: (m: number) => void;
}) {
  const whites: number[] = [];
  for (let m = MIDI_LO; m <= MIDI_HI; m++) if (!BLACK.has(m % 12)) whites.push(m);
  const ww = 100 / whites.length;
  const whiteIndex = new Map(whites.map((m, i) => [m, i]));
  const keys = [];
  for (let m = MIDI_LO; m <= MIDI_HI; m++) {
    const black = BLACK.has(m % 12);
    const c = mapper.freq(hzFromMidi(m, a4));
    const left = black ? (whiteIndex.get(m - 1)! + 1) * ww - ww * 0.32 : whiteIndex.get(m)! * ww;
    const style = { left: `${left}%`, width: `${black ? ww * 0.64 : ww}%`, background: rgbToHex(c) };
    keys.push(
      <div
        key={m}
        className={`lab-key ${black ? 'lab-key--black' : 'lab-key--white'}${hover === m ? ' is-hover' : ''}${fundamental === m ? ' is-fund' : ''}`}
        style={style}
        onPointerEnter={() => setHover(m)}
        onClick={() => setFundamental(m)}
      >
        {!black && m % 12 === 0 && <span className="lab-key__lbl" style={{ color: lum(c) > 0.45 ? 'rgba(0,0,0,.65)' : 'rgba(255,255,255,.8)' }}>{midiName(m)}</span>}
        {fundamental === m && <span className="lab-key__dot" />}
      </div>,
    );
  }
  return (
    <div className="lab-piano" onPointerLeave={() => setHover(null)}>
      {keys}
    </div>
  );
}

function NoteReadout({ midi, mapper, color }: { midi: number; mapper: ColorMapper; color: ColorSettings }) {
  const hz = hzFromMidi(midi, color.a4);
  const c = mapper.freq(hz);
  const fold = freqToLightWavelength(hz, color.mode === 'light-octave' ? color.hueOffset / 360 : 0);
  return (
    <div className="lab-readout">
      <span className="lab-readout__sw" style={{ background: rgbToHex(c) }} />
      <span className="lab-readout__note">{midiName(midi)}</span>
      <span className="lab-kv"><b>{fmtHz(hz)}</b></span>
      <span className="lab-kv">pitch class <b>{NOTE_NAMES[midi % 12]}</b></span>
      <span className="lab-kv">colour <b className="lab-mono">{rgbToHex(c)}</b></span>
      <span className={`lab-kv${color.mode === 'light-octave' ? '' : ' lab-dim'}`}>
        light: ×2<sup>{fold.octaves}</sup> → <b>{fold.thz.toFixed(1)} THz</b> · <b>{fold.nm.toFixed(1)} nm</b>
        <span className="lab-readout__wl" style={{ background: rgbToHex(wavelengthToRGB(fold.nm)) }} />
      </span>
    </div>
  );
}

function OctaveFold({ mapper, color, midi }: { mapper: ColorMapper; color: ColorSettings; midi: number }) {
  const W = 1000, padX = 24;
  const yS = 62, yL = 206, bandH = 16;
  const shift = color.mode === 'light-octave' ? color.hueOffset / 360 : 0;
  const lmin = Math.log2(FREQ_MIN), lmax = Math.log2(FREQ_MAX);
  const xS = (hz: number) => padX + ((Math.log2(hz) - lmin) / (lmax - lmin)) * (W - 2 * padX);
  const xL = (thz: number) => padX + (Math.log2(thz / LIGHT_MIN_THZ) / Math.log2(LIGHT_MAX_THZ / LIGHT_MIN_THZ)) * (W - 2 * padX);

  const hz = hzFromMidi(midi, color.a4);
  const fold = freqToLightWavelength(hz, shift);
  // octave windows of sound that map onto the full light band: [395 THz / 2^k, 790 THz / 2^k) (with the shift)
  const spans: { a: number; b: number; k: number }[] = [];
  for (let k = 35; k <= 46; k++) {
    const a = (LIGHT_MIN_THZ * 1e12) / Math.pow(2, k) / Math.pow(2, shift);
    const b = a * 2;
    if (b < FREQ_MIN || a > FREQ_MAX) continue;
    spans.push({ a: Math.max(a, FREQ_MIN), b: Math.min(b, FREQ_MAX), k });
  }
  const copies: number[] = [];
  for (let m = midi % 12; m < 140; m += 12) {
    const f = hzFromMidi(m, color.a4);
    if (f >= FREQ_MIN && f <= FREQ_MAX) copies.push(m);
  }
  const soundSegs = [];
  const SEG = 240;
  for (let i = 0; i < SEG; i++) {
    const f = FREQ_MIN * Math.pow(FREQ_MAX / FREQ_MIN, (i + 0.5) / SEG);
    soundSegs.push(<rect key={i} x={padX + (i / SEG) * (W - 2 * padX)} y={yS} width={(W - 2 * padX) / SEG + 0.6} height={bandH} fill={rgbToHex(mapper.freq(f))} />);
  }
  const lightSegs = [];
  for (let i = 0; i < SEG; i++) {
    const thz = LIGHT_MIN_THZ * Math.pow(2, (i + 0.5) / SEG);
    lightSegs.push(<rect key={i} x={padX + (i / SEG) * (W - 2 * padX)} y={yL} width={(W - 2 * padX) / SEG + 0.6} height={bandH} fill={rgbToHex(wavelengthToRGB((SPEED_OF_LIGHT / (thz * 1e12)) * 1e9))} />);
  }
  const hzTicks = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
  const nmTicks = [750, 700, 650, 600, 550, 500, 450, 400];
  const thzOf = (nm: number) => SPEED_OF_LIGHT / (nm * 1e-9) / 1e12;
  const xFold = xL(fold.thz);
  return (
    <svg className="lab-fold" viewBox={`0 0 ${W} 262`} role="img" aria-label="Octave folding from sound into visible light">
      {/* funnels: every octave of sound covers the whole visible band */}
      {spans.map((s, i) => {
        const on = hz >= s.a && hz < s.b;
        return (
          <polygon
            key={s.k}
            points={`${xS(s.a)},${yS + bandH} ${xS(s.b)},${yS + bandH} ${W - padX},${yL} ${padX},${yL}`}
            fill={on ? 'rgba(124,156,255,0.13)' : i % 2 ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.045)'}
            stroke={on ? 'rgba(124,156,255,0.5)' : 'rgba(255,255,255,0.06)'}
            strokeWidth={on ? 1 : 0.6}
          />
        );
      })}
      {spans.map((s) => (
        <text key={`k${s.k}`} x={(xS(s.a) + xS(s.b)) / 2} y={yS - 24} textAnchor="middle" className="lab-fold__k">
          ×2<tspan dy={-4} fontSize={8}>{s.k}</tspan>
        </text>
      ))}
      {soundSegs}
      {hzTicks.map((f) => (
        <g key={f}>
          <line x1={xS(f)} x2={xS(f)} y1={yS - 4} y2={yS} stroke="#5b606c" />
          <text x={xS(f)} y={yS - 8} textAnchor="middle" className="lab-fold__tick">{f >= 1000 ? `${f / 1000}k` : f}</text>
        </g>
      ))}
      <text x={padX} y={12} className="lab-fold__axis">SOUND · log frequency, Hz · each band ×2ᵏ lands in light</text>
      {/* lines from every octave copy to the same point in light */}
      {copies.map((m) => {
        const f = hzFromMidi(m, color.a4);
        const cur = m === midi;
        return (
          <g key={m}>
            <path
              d={`M ${xS(f)} ${yS + bandH} C ${xS(f)} ${(yS + yL) / 2}, ${xFold} ${(yS + yL) / 2}, ${xFold} ${yL}`}
              fill="none"
              stroke={cur ? '#fff' : 'rgba(255,255,255,0.35)'}
              strokeWidth={cur ? 1.6 : 0.8}
              strokeDasharray={cur ? undefined : '3 3'}
            />
            <circle cx={xS(f)} cy={yS + bandH / 2} r={cur ? 4.5 : 3} fill={rgbToHex(mapper.freq(f))} stroke={cur ? '#fff' : '#0a0b0e'} strokeWidth={1.2} />
          </g>
        );
      })}
      {lightSegs}
      <circle cx={xFold} cy={yL + bandH / 2} r={5} fill="none" stroke="#fff" strokeWidth={1.6} />
      {nmTicks.map((nm) => {
        const t = thzOf(nm);
        if (t < LIGHT_MIN_THZ || t > LIGHT_MAX_THZ) return null;
        return (
          <g key={nm}>
            <line x1={xL(t)} x2={xL(t)} y1={yL + bandH} y2={yL + bandH + 4} stroke="#5b606c" />
            <text x={xL(t)} y={yL + bandH + 15} textAnchor="middle" className="lab-fold__tick">{nm} nm</text>
          </g>
        );
      })}
      <text x={padX} y={yL + bandH + 32} className="lab-fold__axis">LIGHT · {LIGHT_MIN_THZ}–{LIGHT_MAX_THZ} THz (exactly one octave)</text>
      <text x={W - padX} y={yL + bandH + 32} textAnchor="end" className="lab-fold__axis lab-fold__axis--hl">
        {midiName(midi)} → {fold.thz.toFixed(1)} THz · {fold.nm.toFixed(1)} nm
      </text>
    </svg>
  );
}

function Harmonics({ mapper, color, midi }: { mapper: ColorMapper; color: ColorSettings; midi: number }) {
  const f0 = hzFromMidi(midi, color.a4);
  const K = 16;
  const parts = Array.from({ length: K }, (_, i) => {
    const k = i + 1;
    const f = k * f0;
    const amp = 1 / Math.pow(k, 0.7);
    return { k, f, amp, c: mapper.freq(f, amp), cFull: mapper.freq(f) };
  });
  const rings = parts.slice(1).reverse();
  return (
    <div className="lab-harm">
      <svg className="lab-harm__rings" viewBox="-130 -130 260 260" role="img" aria-label="Harmonic rings">
        <defs>
          <radialGradient id="lab-blob">
            <stop offset="0%" stopColor={rgbToHex(parts[0].cFull)} stopOpacity={1} />
            <stop offset="70%" stopColor={rgbToHex(parts[0].cFull)} stopOpacity={0.9} />
            <stop offset="100%" stopColor={rgbToHex(parts[0].cFull)} stopOpacity={0} />
          </radialGradient>
          <filter id="lab-soft" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="0.7" />
          </filter>
          <filter id="lab-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>
        {rings.map((p) => {
          const r = 26 + (Math.log2(p.k) / Math.log2(K)) * 96;
          const w = Math.max(2, 11 * p.amp);
          return (
            <g key={p.k}>
              <circle r={r} fill="none" stroke={rgbToHex(p.cFull)} strokeWidth={w * 2.4} opacity={0.18 + 0.2 * p.amp} filter="url(#lab-glow)" />
              <circle r={r} fill="none" stroke={rgbToHex(p.cFull)} strokeWidth={w} opacity={0.45 + 0.55 * p.amp} filter="url(#lab-soft)" />
            </g>
          );
        })}
        <circle r={34} fill="url(#lab-blob)" opacity={0.5} filter="url(#lab-glow)" />
        <circle r={22} fill="url(#lab-blob)" />
      </svg>
      <div className="lab-harm__list">
        {parts.map((p) => {
          const m = midiFromHz(p.f, color.a4);
          const cents = Math.round((m - Math.round(m)) * 100);
          const pcSame = Math.round(m) % 12 === midi % 12;
          return (
            <div key={p.k} className="lab-partial" title={`${noteName(p.f, color.a4, true)} · ${fmtHz(p.f)}`}>
              <span className="lab-partial__k">{p.k}</span>
              <span className="lab-partial__sw" style={{ background: rgbToHex(p.cFull) }} />
              <span className="lab-partial__note">{p.f <= FREQ_MAX ? midiName(m) : '—'}</span>
              <span className={`lab-partial__c${Math.abs(cents) > 10 ? ' is-off' : ''}`}>{cents === 0 ? '' : `${cents > 0 ? '+' : '−'}${Math.abs(cents)}¢`}</span>
              <span className="lab-partial__hz">{fmtHz(p.f)}</span>
              {pcSame && <span className="lab-partial__oct" title="Same pitch class as the fundamental">≡</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ModeStrip({ settings, a4, active, onPick }: { settings: ColorSettings; a4: number; active: boolean; onPick: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const mapper = useMemo(() => createColorMapper(settings), [settings]);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const w = 880, h = 28;
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d')!;
    const f0 = hzFromMidi(MIDI_LO, a4), f1 = hzFromMidi(MIDI_HI, a4);
    for (let x = 0; x < w; x++) {
      const f = f0 * Math.pow(f1 / f0, (x + 0.5) / w);
      ctx.fillStyle = mapper.css(mapper.freq(f));
      ctx.fillRect(x, 0, 1, h);
    }
    // octave ticks at each C
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    for (let m = 24; m <= MIDI_HI; m += 12) {
      const x = (Math.log2(hzFromMidi(m, a4) / f0) / Math.log2(f1 / f0)) * w;
      ctx.fillRect(Math.round(x), h - 7, 1, 7);
    }
  }, [mapper, a4]);
  const info = MODE_INFO[settings.mode];
  return (
    <button className={`lab-mrow${active ? ' is-on' : ''}`} onClick={onPick}>
      <span className="lab-mrow__name">
        {info.label}
        <span className="lab-mrow__short">{info.short}</span>
      </span>
      <canvas ref={ref} className="lab-mrow__strip" />
      <span className="lab-mrow__pc">
        {Array.from({ length: 12 }, (_, i) => (
          <span key={i} style={{ background: rgbToHex(mapper.pitchClass(i)) }} title={NOTE_NAMES[i]} />
        ))}
      </span>
    </button>
  );
}

function LiveStrip({ mapper }: { mapper: ColorMapper }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const mref = useRef(mapper);
  mref.current = mapper;
  const [active, setActive] = useState(false);
  useEffect(() => {
    let raf = 0;
    let wasActive = false;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const cv = ref.current;
      if (!cv) return;
      const f = getLatestFeatures();
      const on = !!f && f.playing && performance.now() - latestFeaturesAt() < 300;
      if (on !== wasActive) {
        wasActive = on;
        setActive(on);
      }
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = cv.clientWidth, H = cv.clientHeight;
      if (cv.width !== Math.round(W * dpr)) cv.width = Math.round(W * dpr);
      if (cv.height !== Math.round(H * dpr)) cv.height = Math.round(H * dpr);
      const ctx = cv.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      if (!on || !f) return;
      const m = mref.current;
      // chroma: 12 cells
      const cw = Math.min(46, (W * 0.36) / 12);
      for (let i = 0; i < 12; i++) {
        const v = f.chroma[i] ?? 0;
        ctx.fillStyle = m.css(m.pitchClass(i, v));
        const hh = 8 + v * (H - 26);
        ctx.beginPath();
        ctx.roundRect(i * cw + 2, H - 16 - hh, cw - 4, hh, 3);
        ctx.fill();
        ctx.fillStyle = '#8a8f9c';
        ctx.font = '10px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(NOTE_NAMES[i], i * cw + cw / 2, H - 3);
      }
      // spectrum peaks on a log axis
      const x0 = 12 * cw + 24, x1 = W - 8;
      const lmin = Math.log2(30), lmax = Math.log2(12000);
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fillRect(x0, 4, x1 - x0, H - 20);
      const bands = f.bands, bf = f.bandFreqs;
      for (let i = 0; i < bands.length; i++) {
        const fr = bf[i];
        if (!(fr > 0)) continue;
        const x = x0 + ((Math.log2(fr) - lmin) / (lmax - lmin)) * (x1 - x0);
        const v = bands[i];
        ctx.fillStyle = m.css(m.freq(fr, v), 0.85);
        const hh = v * (H - 22);
        ctx.fillRect(x - 2, H - 16 - hh, 4, hh);
      }
      for (const p of f.peaks.slice(0, 6)) {
        if (!(p.freq > 0)) continue;
        const x = x0 + ((Math.log2(p.freq) - lmin) / (lmax - lmin)) * (x1 - x0);
        ctx.fillStyle = m.css(m.freq(p.freq));
        ctx.beginPath();
        ctx.arc(x, 10, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      if (f.pitch.freq > 0 && f.pitch.clarity > 0.3) {
        ctx.fillStyle = '#e8e9ed';
        ctx.font = '11px Inter, system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`${noteName(f.pitch.freq, m.settings.a4, true)} · ${fmtHz(f.pitch.freq)}`, x1, H - 3);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="lab-live">
      <canvas ref={ref} className="lab-live__cv" />
      {!active && <div className="lab-live__idle">Play some audio (transport below) to see its chroma and spectrum coloured live by the current mapping.</div>}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────── view ──

export function LabView() {
  const color = useStore((s) => s.color);
  const setColor = useStore((s) => s.setColor);
  const mapper = useMemo(() => createColorMapper(color), [color]);
  const [hover, setHover] = useState<number | null>(null);
  const [fundamental, setFundamental] = useState(45); // A2, 110 Hz
  const shown = hover ?? fundamental;
  const compare = useMemo(() => COLOR_MODES.map((m) => ({ ...color, mode: m as ColorMode })), [color]);

  return (
    <div className="lab-root">
      <div className="lab-inner">
        <header className="lab-header">
          <h1 className="lab-h1">Mapping Lab</h1>
          <p className="lab-sub">
            How should a sound look? Explore the ways a pitch can become a colour, from the physics of folding sound up into light to Scriabin’s synaesthesia. Hover the keyboard, click a key to set a fundamental, and compare the mappings side by side.
          </p>
        </header>

        <div className="lab-top">
          <ModePanel color={color} setColor={setColor} />
          <Card title="Pitch-class wheel" sub="The twelve notes of the octave, as the current mapping colours them.">
            <PitchWheel mapper={mapper} highlight={shown % 12} />
          </Card>
        </div>

        <Card title="Keyboard" sub="All 88 piano keys (A0–C8) coloured by the current mapping. Hover a key to inspect it, click to set the fundamental below.">
          <Piano mapper={mapper} a4={color.a4} hover={hover} setHover={setHover} fundamental={fundamental} setFundamental={setFundamental} />
          <NoteReadout midi={shown} mapper={mapper} color={color} />
        </Card>

        <Card
          title="Octave folding"
          sub={
            <>
              The light-octave idea. Each band of sound one octave wide, about 40 octaves below light, stretches across the whole visible spectrum, so every copy of a note lands on the same wavelength. Hue then encodes pitch class, and which octave the note was in is lost.
              {color.mode !== 'light-octave' && (
                <>
                  {' '}
                  <button className="lab-linkbtn" onClick={() => setColor({ mode: 'light-octave' })}>Use light-octave</button>
                </>
              )}
            </>
          }
        >
          <OctaveFold mapper={mapper} color={color} midi={shown} />
        </Card>

        <div className="lab-two">
          <Card title={`Harmonic series of ${midiName(fundamental)}`} sub="A sound is a fundamental, the central blob, plus partials at 2×, 3×, 4×… its frequency, shown as rings spaced by octave with thickness for typical amplitude. Rings marked ≡ share the fundamental’s pitch class; the 3rd and 5th partials bring the fifth and the major third.">
            <Harmonics mapper={mapper} color={color} midi={fundamental} />
          </Card>
          <Card title="Live" sub="Chroma (left) and spectrum bands (right) of whatever is playing, with the strongest peaks as dots.">
            <LiveStrip mapper={mapper} />
          </Card>
        </div>

        <Card title="Compare all mappings" sub="Each mapping across the piano range (ticks at every C), with its twelve pitch-class colours. Click one to use it.">
          <div className="lab-compare">
            {compare.map((s) => (
              <ModeStrip key={s.mode} settings={s} a4={color.a4} active={s.mode === color.mode} onPick={() => setColor({ mode: s.mode })} />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

export default LabView;
