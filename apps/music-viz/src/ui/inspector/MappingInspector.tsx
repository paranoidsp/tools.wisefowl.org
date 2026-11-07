import { useEffect, useRef } from 'react';
import { createColorMapper, GRADIENT_PRESETS, gradientCss, MODE_INFO } from '../../color';
import { DEFAULT_ANALYSIS, DEFAULT_COLOR } from '../../core/defaults';
import { useStore } from '../../core/store';
import type { AnalysisSettings, ColorMode, ColorSettings, FreqScale } from '../../core/types';
import { Row, Section, Segmented } from '../controls/basic';
import { GradientEditor } from '../controls/GradientEditor';
import { NumberControl } from '../controls/NumberControl';
import { IconReset } from '../icons';
import { getLatestFeatures } from '../liveFeatures';
import { Dropdown } from '../Popover';

export const COLOR_MODES: { value: ColorMode; label: string; hint: string }[] = [
  { value: 'light-octave', label: 'Light octave', hint: 'Fold each frequency up by octaves into visible light (≈400–790 THz) and use that wavelength’s colour.' },
  { value: 'pitch-hue', label: 'Pitch → hue', hint: 'The 12 pitch classes go around the colour wheel in chromatic order.' },
  { value: 'fifths-hue', label: 'Circle of fifths', hint: 'Pitch classes ordered by fifths, so related keys get neighbouring hues.' },
  { value: 'scriabin', label: 'Scriabin', hint: 'Alexander Scriabin’s synesthetic key colours (Prometheus, 1910).' },
  { value: 'newton', label: 'Newton', hint: 'Newton’s seven spectral colours mapped onto the diatonic scale.' },
  { value: 'spectral', label: 'Spectral range', hint: 'Low → high frequency sweeps a hue range you choose, without octave folding.' },
  { value: 'gradient', label: 'Custom gradient', hint: 'Low → high frequency runs through your own gradient.' },
];

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export function noteName(hz: number, a4 = 440): string {
  if (!(hz > 0)) return '—';
  const midi = Math.round(69 + 12 * Math.log2(hz / a4));
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

const BLACK = new Set([1, 3, 6, 8, 10]);

/** Piano range A0–C8 coloured by the current mapping. */
export function PianoStrip({ color }: { color: ColorSettings }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (!w) return;
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      const g = c.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const m = createColorMapper(color);
      const keys = 88;
      const kw = w / keys;
      const colH = h - 17;
      for (let i = 0; i < keys; i++) {
        const midi = 21 + i;
        const hz = color.a4 * Math.pow(2, (midi - 69) / 12);
        g.fillStyle = m.css(m.freq(hz, 1));
        g.fillRect(i * kw, 0, Math.ceil(kw) + 0.5, colH);
      }
      // keyboard row
      for (let i = 0; i < keys; i++) {
        const pc = (21 + i) % 12;
        g.fillStyle = BLACK.has(pc) ? '#1a1d24' : '#3a3f4b';
        g.fillRect(i * kw, colH + 2, Math.max(1, kw - 0.6), 4);
      }
      g.font = '500 9px Inter, ui-sans-serif, system-ui, sans-serif';
      g.fillStyle = '#6b707c';
      g.textBaseline = 'top';
      for (let i = 0; i < keys; i++) {
        const midi = 21 + i;
        if (midi % 12 === 0) {
          const x = i * kw;
          g.fillStyle = '#8a8f9c';
          g.fillRect(x, colH + 2, 1, 6);
          g.fillStyle = '#6b707c';
          g.fillText(`C${midi / 12 - 1}`, x + 3, colH + 8);
        }
      }
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(c);
    return () => ro.disconnect();
  }, [color]);
  return <canvas ref={ref} className="piano-strip" aria-label="Colour mapping across the piano range A0 to C8" />;
}

function AnalysisReadout() {
  const bpm = useRef<HTMLSpanElement>(null);
  const pitch = useRef<HTMLSpanElement>(null);
  const loud = useRef<HTMLDivElement>(null);
  const beat = useRef<HTMLSpanElement>(null);
  const a4 = useStore((s) => s.color.a4);
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const f = getLatestFeatures();
      if (!f) return;
      if (loud.current) loud.current.style.transform = `scaleX(${Math.min(1, f.loudness)})`;
      if (beat.current) beat.current.style.opacity = String(0.15 + 0.85 * f.beatPulse);
      if (now - last < 120) return;
      last = now;
      if (bpm.current) bpm.current.textContent = f.bpm ? String(Math.round(f.bpm)) : '—';
      if (pitch.current) pitch.current.textContent = f.pitch.clarity > 0.3 ? noteName(f.pitch.freq, a4) : '—';
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [a4]);
  return (
    <div className="readout">
      <div className="readout__cell">
        <span className="readout__label">
          Tempo <span className="beat-dot" ref={beat} />
        </span>
        <span className="readout__value num">
          <span ref={bpm}>—</span>
          <small> BPM</small>
        </span>
      </div>
      <div className="readout__cell">
        <span className="readout__label">Pitch</span>
        <span className="readout__value num" ref={pitch}>
          —
        </span>
      </div>
      <div className="readout__cell readout__cell--wide">
        <span className="readout__label">Loudness</span>
        <div className="meter meter--lg">
          <div className="meter__fill" ref={loud} />
        </div>
      </div>
    </div>
  );
}

const FFT: AnalysisSettings['fftSize'][] = [1024, 2048, 4096, 8192, 16384];

export function MappingInspector() {
  const color = useStore((s) => s.color);
  const analysis = useStore((s) => s.analysis);
  const { setColor, setAnalysis } = useStore.getState();
  const mode = COLOR_MODES.find((m) => m.value === color.mode);
  const hueBased = color.mode === 'pitch-hue' || color.mode === 'fifths-hue' || color.mode === 'spectral' || color.mode === 'light-octave';

  return (
    <>
      <Section
        title="Colour mapping"
        storageKey="map-color"
        actions={
          <button className="icon-btn icon-btn--xs" onClick={() => setColor({ ...DEFAULT_COLOR })} data-tip="Reset colour mapping" aria-label="Reset colour mapping">
            <IconReset size={12} />
          </button>
        }
      >
        <Row label="Mode">
          <Dropdown<ColorMode> value={color.mode} options={COLOR_MODES} onChange={(mode) => setColor({ mode })} ariaLabel="Colour mode" wide />
        </Row>
        <p className="insp-explain" data-tip={MODE_INFO[color.mode]?.explanation}>
          <strong>{MODE_INFO[color.mode]?.short ?? mode?.hint}.</strong> {MODE_INFO[color.mode]?.short ? mode?.hint : null}
        </p>
        <PianoStrip color={color} />
        {hueBased && <NumberControl label={color.mode === 'light-octave' ? 'Fold shift' : 'Hue offset'} hint={MODE_INFO[color.mode]?.hueOffsetMeaning} value={color.hueOffset} min={-180} max={180} step={1} unit="°" bipolar defaultValue={0} onChange={(hueOffset) => setColor({ hueOffset })} />}
        {color.mode === 'spectral' && (
          <>
            <NumberControl label="Hue start" value={color.hueStart} min={0} max={360} step={1} unit="°" defaultValue={DEFAULT_COLOR.hueStart} onChange={(hueStart) => setColor({ hueStart })} />
            <NumberControl label="Hue end" value={color.hueEnd} min={0} max={360} step={1} unit="°" defaultValue={DEFAULT_COLOR.hueEnd} onChange={(hueEnd) => setColor({ hueEnd })} />
          </>
        )}
        {color.mode === 'gradient' && (
          <div className="ctl ctl--stack">
            <div className="ctl__label">Gradient</div>
            <GradientEditor value={color.gradient} onChange={(gradient) => setColor({ gradient })} />
            <div className="grad-presets">
              {GRADIENT_PRESETS.map((g) => (
                <button
                  key={g.id}
                  className="grad-presets__swatch"
                  style={{ background: gradientCss(g.stops) }}
                  onClick={() => setColor({ gradient: structuredClone(g.stops) })}
                  data-tip={g.name}
                  aria-label={`Gradient preset ${g.name}`}
                />
              ))}
            </div>
          </div>
        )}
        <NumberControl label="Saturation" value={color.saturation} min={0} max={1} step={0.01} defaultValue={DEFAULT_COLOR.saturation} onChange={(saturation) => setColor({ saturation })} />
        <NumberControl label="Lightness" value={color.lightness} min={0} max={1} step={0.01} defaultValue={DEFAULT_COLOR.lightness} onChange={(lightness) => setColor({ lightness })} />
        <NumberControl
          label="Level → light"
          hint="How much loudness drives brightness"
          value={color.intensityToBrightness}
          min={0}
          max={1}
          step={0.01}
          defaultValue={DEFAULT_COLOR.intensityToBrightness}
          onChange={(intensityToBrightness) => setColor({ intensityToBrightness })}
        />
        <NumberControl label="Gamma" value={color.gamma} min={0.2} max={3} step={0.01} curve="log" defaultValue={1} onChange={(gamma) => setColor({ gamma })} />
        <NumberControl label="A4 tuning" value={color.a4} min={415} max={466} step={0.5} unit="Hz" defaultValue={440} onChange={(a4) => setColor({ a4 })} />
      </Section>

      <Section
        title="Analysis"
        storageKey="map-analysis"
        actions={
          <button className="icon-btn icon-btn--xs" onClick={() => setAnalysis({ ...DEFAULT_ANALYSIS })} data-tip="Reset analysis" aria-label="Reset analysis">
            <IconReset size={12} />
          </button>
        }
      >
        <AnalysisReadout />
        <Row label="FFT size" hint="Bigger = finer frequency detail, slower response">
          <Dropdown<number>
            value={analysis.fftSize}
            options={FFT.map((n) => ({ value: n, label: n.toLocaleString('en'), hint: n <= 2048 ? 'Fast, coarse' : n >= 8192 ? 'Detailed, laggy' : 'Balanced' }))}
            onChange={(v) => setAnalysis({ fftSize: v as AnalysisSettings['fftSize'] })}
            ariaLabel="FFT size"
          />
        </Row>
        <Row label="Freq scale">
          <Segmented<FreqScale>
            value={analysis.freqScale}
            options={[
              { value: 'log', label: 'Log' },
              { value: 'mel', label: 'Mel' },
              { value: 'bark', label: 'Bark' },
              { value: 'linear', label: 'Lin' },
            ]}
            onChange={(freqScale) => setAnalysis({ freqScale })}
            ariaLabel="Frequency scale"
          />
        </Row>
        <NumberControl label="Bands" value={analysis.bandCount} min={8} max={256} step={1} defaultValue={64} onChange={(bandCount) => setAnalysis({ bandCount })} />
        <NumberControl label="Min freq" value={analysis.minFreq} min={20} max={2000} step={1} curve="log" unit="Hz" defaultValue={DEFAULT_ANALYSIS.minFreq} onChange={(minFreq) => setAnalysis({ minFreq })} />
        <NumberControl label="Max freq" value={analysis.maxFreq} min={1000} max={22050} step={10} curve="log" unit="Hz" defaultValue={DEFAULT_ANALYSIS.maxFreq} onChange={(maxFreq) => setAnalysis({ maxFreq })} />
        <NumberControl label="Smoothing" value={analysis.smoothing} min={0} max={0.99} step={0.01} defaultValue={DEFAULT_ANALYSIS.smoothing} onChange={(smoothing) => setAnalysis({ smoothing })} />
        <NumberControl label="Floor" value={analysis.minDb} min={-140} max={-40} step={1} unit="dB" defaultValue={DEFAULT_ANALYSIS.minDb} onChange={(minDb) => setAnalysis({ minDb: Math.min(minDb, analysis.maxDb - 10) })} />
        <NumberControl label="Ceiling" value={analysis.maxDb} min={-60} max={0} step={1} unit="dB" defaultValue={DEFAULT_ANALYSIS.maxDb} onChange={(maxDb) => setAnalysis({ maxDb: Math.max(maxDb, analysis.minDb + 10) })} />
        <NumberControl label="Gain" value={analysis.gain} min={0.1} max={4} step={0.01} curve="log" unit="×" defaultValue={1} onChange={(gain) => setAnalysis({ gain })} />
        <NumberControl label="Beat sens." hint="Onset detection sensitivity: higher = more beats" value={analysis.beatSensitivity} min={0} max={1} step={0.01} defaultValue={DEFAULT_ANALYSIS.beatSensitivity} onChange={(beatSensitivity) => setAnalysis({ beatSensitivity })} />
        <NumberControl label="Beat decay" value={analysis.beatDecay} min={0.05} max={2} step={0.01} unit="s" curve="log" defaultValue={DEFAULT_ANALYSIS.beatDecay} onChange={(beatDecay) => setAnalysis({ beatDecay })} />
        <NumberControl label="Feature smooth" hint="Extra smoothing on loudness, bass, etc." value={analysis.featureSmoothing} min={0} max={0.99} step={0.01} defaultValue={DEFAULT_ANALYSIS.featureSmoothing} onChange={(featureSmoothing) => setAnalysis({ featureSmoothing })} />
      </Section>
    </>
  );
}
