/** Bottom transport: source, play/seek with a timbre-coloured overview, live spectrum, volume, loop. */
import { useEffect, useRef, useState } from 'react';
import { engine } from '../audio/engine';
import { createColorMapper } from '../color';
import type { TrackOverview } from '../core/engine-api';
import { useStore } from '../core/store';
import type { ColorMapper } from '../core/types';
import { loadDemo, openAudioDialog, startMic, togglePlay } from './actions';
import { IconChevron, IconFolder, IconLoop, IconMic, IconMusic, IconMute, IconPause, IconPlay, IconVolume } from './icons';
import { getLatestFeatures } from './liveFeatures';
import { Popover } from './Popover';
import { fmtTime, refreshEngineState, useEngineState } from './useEngine';

export function Transport() {
  const st = useEngineState();
  const color = useStore((s) => s.color);
  const mapperRef = useRef<ColorMapper>(createColorMapper(color));
  useEffect(() => {
    mapperRef.current = createColorMapper(color);
  }, [color]);

  const timeRef = useRef<HTMLSpanElement>(null);
  const specRef = useRef<HTMLCanvasElement>(null);
  const ovRef = useRef<OverviewHandle | null>(null);

  // one rAF for time text, overview playhead and spectrum strip
  useEffect(() => {
    let raf = 0;
    let lastPoll = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - lastPoll > 500) {
        lastPoll = now;
        refreshEngineState();
      }
      const t = engine.currentTime();
      if (timeRef.current) {
        const txt = fmtTime(t);
        if (timeRef.current.textContent !== txt) timeRef.current.textContent = txt;
      }
      ovRef.current?.draw(t);
      drawSpectrum(specRef.current, mapperRef.current);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const hasTrack = st.kind === 'file' || st.kind === 'demo';
  const kindLabel = st.kind === 'demo' ? 'Demo' : st.kind === 'file' ? 'File' : st.kind === 'mic' ? 'Live' : '';

  return (
    <footer className="transport">
      <div className="transport__source">
        <div className="transport__track">
          {st.kind === 'none' ? (
            <span className="transport__trackname muted">No audio loaded</span>
          ) : (
            <>
              <span className={`kind-chip kind-chip--${st.kind}`}>{kindLabel}</span>
              <span className="transport__trackname" title={st.name}>
                {st.loading ? 'Loading…' : st.name || 'Untitled'}
              </span>
            </>
          )}
        </div>
        <div className="transport__btns">
          <button className="btn btn--sm" onClick={() => openAudioDialog()} data-tip="Open an audio file (or drop one anywhere)" data-tip-kbd="O">
            <IconFolder size={14} /> <span className="btn__label">Open</span>
          </button>
          <DemoMenu />
          <button className={`btn btn--sm btn--icon ${st.kind === 'mic' ? 'is-on' : ''}`} onClick={() => startMic()} data-tip="Use microphone" aria-label="Use microphone">
            <IconMic size={14} />
          </button>
        </div>
      </div>

      <div className="transport__main">
        <button
          className={`play-btn ${st.playing ? 'is-playing' : ''}`}
          onClick={() => togglePlay()}
          disabled={st.loading}
          data-tip={st.playing ? 'Pause' : 'Play'}
          data-tip-kbd="Space"
          aria-label={st.playing ? 'Pause' : 'Play'}
        >
          {st.loading ? <span className="spinner" /> : st.playing ? <IconPause size={18} /> : <IconPlay size={18} />}
        </button>
        <div className="transport__time num">
          <span ref={timeRef}>0:00</span>
          <span className="transport__dur">{hasTrack ? ` / ${fmtTime(st.duration)}` : st.kind === 'mic' ? '' : ' / 0:00'}</span>
        </div>
        <div className="transport__seek">
          {hasTrack && st.overview ? (
            <Overview overview={st.overview} duration={st.duration} mapper={mapperRef} handleRef={ovRef} color={color} />
          ) : hasTrack || st.loading ? (
            <div className="seek-empty">
              <span className="seek-empty__line" />
              {st.loading && <span className="seek-empty__msg">Decoding…</span>}
            </div>
          ) : st.kind === 'mic' ? (
            <div className="seek-empty seek-empty--live">
              <span className="live-dot" /> Live microphone input. Nothing to seek; audio never leaves your browser.
            </div>
          ) : (
            <div className="seek-empty seek-empty--prompt">
              <span>Drop an audio file anywhere, or</span>
              <button className="link-btn" onClick={() => openAudioDialog()}>
                open audio
              </button>
              <span>·</span>
              <button className="link-btn" onClick={() => (engine.demos[0] ? loadDemo(engine.demos[0].id) : openAudioDialog())}>
                try a demo
              </button>
            </div>
          )}
          {st.error && <div className="seek-error">{st.error}</div>}
        </div>
      </div>

      <div className="transport__right">
        <canvas className="spectrum-strip" ref={specRef} aria-hidden="true" />
        <div className="transport__mix">
          <Volume volume={st.volume} />
          <button
            className={`icon-btn ${st.loop ? 'is-on' : ''}`}
            onClick={() => engine.setLoop(!st.loop)}
            data-tip={st.loop ? 'Loop on' : 'Loop off'}
            data-tip-kbd="L"
            aria-pressed={st.loop}
            aria-label="Loop"
          >
            <IconLoop size={15} />
          </button>
        </div>
      </div>
    </footer>
  );
}

function DemoMenu() {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const demos = engine.demos;
  return (
    <>
      <button ref={btn} className={`btn btn--sm ${open ? 'is-open' : ''}`} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" data-tip="Synthesized demo tracks">
        <IconMusic size={14} /> <span className="btn__label">Demos</span> <IconChevron size={12} className="btn__chev" />
      </button>
      <Popover anchor={btn} open={open} onClose={() => setOpen(false)} placement="top-start" className="menu demo-menu">
        <div className="menu__heading">Demo tracks · synthesized in your browser</div>
        {demos.length === 0 && <div className="menu__empty">No demo tracks available yet.</div>}
        {demos.map((d) => (
          <button
            key={d.id}
            className="menu__item menu__item--tall"
            onClick={() => {
              setOpen(false);
              loadDemo(d.id);
            }}
          >
            <span className="menu__icon">
              <IconMusic size={14} />
            </span>
            <span className="menu__label">
              <span>{d.name}</span>
              <span className="menu__sub">{d.description}</span>
            </span>
          </button>
        ))}
      </Popover>
    </>
  );
}

function Volume({ volume }: { volume: number }) {
  const prev = useRef(0.8);
  const track = useRef<HTMLDivElement>(null);
  const set = (x: number) => {
    const r = track.current!.getBoundingClientRect();
    engine.setVolume(Math.max(0, Math.min(1, (x - r.left) / r.width)));
  };
  return (
    <div className="volume">
      <button
        className="icon-btn"
        onClick={() => {
          if (volume > 0) {
            prev.current = volume;
            engine.setVolume(0);
          } else engine.setVolume(prev.current || 0.8);
        }}
        data-tip={volume > 0 ? 'Mute' : 'Unmute'}
        data-tip-kbd="M"
        aria-label={volume > 0 ? 'Mute' : 'Unmute'}
      >
        {volume > 0 ? <IconVolume size={15} /> : <IconMute size={15} />}
      </button>
      <div
        ref={track}
        className="mini-slider"
        role="slider"
        tabIndex={0}
        aria-label="Volume"
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={volume}
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          set(e.clientX);
        }}
        onPointerMove={(e) => e.buttons & 1 && set(e.clientX)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') engine.setVolume(Math.min(1, volume + 0.05));
          else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') engine.setVolume(Math.max(0, volume - 0.05));
          else return;
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <div className="mini-slider__rail">
          <div className="mini-slider__fill" style={{ width: `${volume * 100}%` }} />
        </div>
        <div className="mini-slider__thumb" style={{ left: `${volume * 100}%` }} />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────── spectrum ──

function drawSpectrum(c: HTMLCanvasElement | null, mapper: ColorMapper) {
  if (!c) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = c.clientWidth;
  const h = c.clientHeight;
  if (!w || !h) return;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
  }
  const g = c.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const f = getLatestFeatures();
  const bands = f?.bands;
  const n = bands?.length ?? 0;
  const cols = Math.max(8, Math.min(64, Math.floor(w / 4)));
  const slot = w / cols;
  for (let i = 0; i < cols; i++) {
    let v = 0;
    let hz = 0;
    if (n && bands && f) {
      const a = Math.floor((i / cols) * n);
      const b = Math.max(a + 1, Math.floor(((i + 1) / cols) * n));
      for (let k = a; k < b; k++) v = Math.max(v, bands[k]);
      hz = f.bandFreqs[Math.min(n - 1, a)] || 0;
    }
    const bh = Math.max(2, v * (h - 2));
    g.fillStyle = hz > 0 && v > 0.01 ? mapper.css(mapper.freq(hz, 0.6 + v * 0.4), 0.95) : 'rgba(255,255,255,0.1)';
    g.beginPath();
    g.roundRect(i * slot + 0.5, h - bh, Math.max(1, slot - 1.5), bh, 1);
    g.fill();
  }
}

// ──────────────────────────────────────────────────────────── overview ──

interface OverviewHandle {
  draw(t: number): void;
}

function Overview({
  overview,
  duration,
  mapper,
  handleRef,
  color,
}: {
  overview: TrackOverview;
  duration: number;
  mapper: React.RefObject<ColorMapper>;
  handleRef: React.RefObject<OverviewHandle | null>;
  color: unknown;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const hoverX = useRef<number | null>(null);
  const bright = useRef<HTMLCanvasElement | null>(null);
  const dim = useRef<HTMLCanvasElement | null>(null);
  const size = useRef({ w: 0, h: 0, dpr: 1 });
  const dirty = useRef(true);

  useEffect(() => {
    dirty.current = true;
  }, [overview, color]);

  useEffect(() => {
    const c = canvas.current!;
    const ro = new ResizeObserver(() => (dirty.current = true));
    ro.observe(c);

    const build = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = c.clientWidth;
      const h = c.clientHeight;
      size.current = { w, h, dpr };
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      const mk = (alpha: number, desat: boolean) => {
        const off = document.createElement('canvas');
        off.width = c.width;
        off.height = c.height;
        const g = off.getContext('2d')!;
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        const bar = 2;
        const gap = 1;
        const cols = Math.floor(w / (bar + gap));
        const N = overview.columns || overview.peaks.length;
        const mid = h / 2;
        for (let i = 0; i < cols; i++) {
          const a = Math.floor((i / cols) * N);
          const b = Math.max(a + 1, Math.floor(((i + 1) / cols) * N));
          let pk = 0;
          let rm = 0;
          let ce = 0;
          for (let k = a; k < b; k++) {
            pk = Math.max(pk, overview.peaks[k] ?? 0);
            rm += overview.rms[k] ?? 0;
            ce += overview.centroid[k] ?? 0;
          }
          rm /= b - a;
          ce /= b - a;
          const rgb = mapper.current.freq(Math.max(40, ce), 1);
          const x = i * (bar + gap);
          const ph = Math.max(1, pk * (h - 4) * 0.5);
          const rh = Math.max(1, Math.min(ph, rm * 1.6 * (h - 4) * 0.5));
          const col = desat ? `rgba(${[0, 1, 2].map((j) => Math.round((rgb[j] * 0.35 + 0.42 * 0.65) * 255)).join(',')},` : `rgba(${rgb.map((v) => Math.round(v * 255)).join(',')},`;
          g.fillStyle = `${col}${alpha * 0.45})`;
          g.fillRect(x, mid - ph, bar, ph * 2);
          g.fillStyle = `${col}${alpha})`;
          g.fillRect(x, mid - rh, bar, rh * 2);
        }
        return off;
      };
      bright.current = mk(1, false);
      dim.current = mk(0.5, true);
      dirty.current = false;
    };

    handleRef.current = {
      draw(t: number) {
        if (dirty.current) build();
        const { w, h, dpr } = size.current;
        if (!w) return;
        const g = c.getContext('2d')!;
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, c.width, c.height);
        const px = duration > 0 ? Math.min(1, t / duration) * c.width : 0;
        if (dim.current) g.drawImage(dim.current, 0, 0);
        if (bright.current && px > 0) g.drawImage(bright.current, 0, 0, px, c.height, 0, 0, px, c.height);
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        const hx = hoverX.current;
        if (hx != null) {
          g.fillStyle = 'rgba(255,255,255,0.35)';
          g.fillRect(hx - 0.5, 0, 1, h);
        }
        g.fillStyle = '#ffffff';
        g.fillRect(px / dpr - 1, 0, 2, h);
        g.beginPath();
        g.arc(px / dpr, 2, 2.5, 0, Math.PI * 2);
        g.fill();
      },
    };
    return () => {
      ro.disconnect();
      handleRef.current = null;
    };
  }, [overview, duration, handleRef, mapper]);

  const timeAt = (x: number) => {
    const r = canvas.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (x - r.left) / r.width)) * duration;
  };
  const showTip = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    const x = Math.max(0, Math.min(r.width, e.clientX - r.left));
    hoverX.current = x;
    if (tip.current) {
      tip.current.style.opacity = '1';
      tip.current.style.left = `${x}px`;
      tip.current.textContent = fmtTime(timeAt(e.clientX));
    }
  };

  return (
    <div className="overview">
      <canvas
        ref={canvas}
        className="overview__canvas"
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={duration}
        tabIndex={0}
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          engine.seek(timeAt(e.clientX));
        }}
        onPointerMove={(e) => {
          showTip(e);
          if (e.buttons & 1) engine.seek(timeAt(e.clientX));
        }}
        onPointerLeave={() => {
          hoverX.current = null;
          if (tip.current) tip.current.style.opacity = '0';
        }}
      />
      <div className="overview__tip num" ref={tip} />
    </div>
  );
}
