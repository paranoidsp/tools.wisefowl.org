import { useEffect, useMemo, useRef } from 'react';
import { getViz } from '../../core/registry';
import { stage } from '../../core/stage';
import { selectedLayer, useStore } from '../../core/store';
import { BLEND_MODES, type BlendMode, type ParamSpec } from '../../core/types';
import { Section } from '../controls/basic';
import { LiveBus, LiveContext } from '../controls/live';
import { NumberControl } from '../controls/NumberControl';
import { ParamControl } from '../controls/ParamControl';
import { IconCube, IconDice, IconLayers, IconPlus, IconReset, IconSquare, IconWarn } from '../icons';
import { shuffleSelectedLayer } from '../actions';
import { Dropdown } from '../Popover';
import { useUi } from '../uiStore';
import { Row } from '../controls/basic';
import { LAYER_HELP, TRANSFORM_HELP } from '../help';

export function LayerInspector() {
  const layer = useStore(selectedLayer);
  const hasLayers = useStore((st) => st.layers.length > 0);
  const s = useStore.getState();
  const def = layer ? getViz(layer.vizId) : undefined;

  const bus = useMemo(() => new LiveBus(), []);
  const layerId = layer?.id;
  useEffect(() => {
    if (!layerId) return;
    let raf = 0;
    const tick = () => {
      const eff = stage.effectiveParams(layerId);
      for (const k of bus.keys()) {
        const v = eff?.[k];
        bus.emit(k, typeof v === 'number' ? v : null);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [layerId, bus]);

  const groups = useMemo(() => {
    const out: { name: string; specs: ParamSpec[] }[] = [];
    for (const spec of def?.params ?? []) {
      const name = spec.group ?? 'Parameters';
      let g = out.find((x) => x.name === name);
      if (!g) out.push((g = { name, specs: [] }));
      g.specs.push(spec);
    }
    return out;
  }, [def]);

  const errRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!layerId) return;
    const id = setInterval(() => {
      const el = errRef.current;
      if (!el) return;
      const err = stage.layerError(layerId);
      el.hidden = !err;
      const msg = el.querySelector('.insp-error__msg');
      if (msg && err) msg.textContent = err;
    }, 500);
    return () => clearInterval(id);
  }, [layerId]);

  if (!layer || !def) {
    return (
      <div className="insp-empty">
        <div className="insp-empty__icon">
          <IconLayers size={22} />
        </div>
        <div className="insp-empty__title">{hasLayers ? 'No layer selected' : 'Nothing to inspect yet'}</div>
        <div className="insp-empty__text">
          {hasLayers ? 'Select a layer on the left to edit its parameters.' : 'Add a layer and its parameters show up here. The Mapping and Scene tabs work any time.'}
        </div>
        {hasLayers && (
          <button className="btn" onClick={() => useUi.getState().setPickerOpen(true)}>
            <IconPlus size={14} /> Add layer
          </button>
        )}
      </div>
    );
  }

  const id = layer.id;
  const tf = layer.transform;
  const presets = def.presets ?? [];

  return (
    <LiveContext.Provider value={bus}>
      <div className="insp-head">
        <div className="insp-head__eyebrow">
          {def.space === '3d' ? <IconCube size={12} /> : <IconSquare size={12} />}
          <span>{def.space === '3d' ? '3D' : '2D'}</span>
          <span className="dot-sep" />
          <span>{def.renderer === 'webgl' ? 'WebGL' : 'Canvas'}</span>
          {def.tags?.slice(0, 3).map((t) => (
            <span key={t} className="tag">
              {t}
            </span>
          ))}
        </div>
        <div className="insp-head__title">{def.name}</div>
        <p className="insp-head__desc">{def.description}</p>
        <div className="insp-head__row">
          {presets.length > 0 && (
            <div className="dropdown--grow" style={{ display: 'flex', minWidth: 0 }} data-tip={LAYER_HELP.presets}>
            <Dropdown<number>
              className="dropdown--grow"
              value={-1}
              options={presets.map((p, i) => ({ value: i, label: p.name, hint: p.description }))}
              onChange={(i) => s.applyPreset(id, i)}
              renderValue={() => <span className="dropdown__ph">Presets ({presets.length})</span>}
              ariaLabel="Apply preset"
              wide
            />
            </div>
          )}
          <button
            className="btn btn--ghost btn--sm btn--icon"
            onClick={() => shuffleSelectedLayer()}
            data-tip="Shuffle: vary this layer’s settings around where they are now (undo with ⌘Z if you don’t like it)"
            data-tip-kbd="⇧G"
            aria-label="Shuffle settings"
          >
            <IconDice size={14} />
          </button>
          <button className="btn btn--ghost btn--sm" onClick={() => s.resetLayerParams(id)} data-tip={LAYER_HELP.reset}>
            <IconReset size={13} /> Reset
          </button>
        </div>
        <div className="insp-error" ref={errRef} hidden>
          <IconWarn size={14} />
          <span className="insp-error__msg" />
        </div>
      </div>

      <Section title="Layer" storageKey="layer">
        <Row label="Blend" hint={LAYER_HELP.blend}>
          <Dropdown<BlendMode> value={layer.blend} options={BLEND_MODES} onChange={(blend) => s.updateLayer(id, { blend })} ariaLabel="Blend mode" />
        </Row>
        <NumberControl label="Opacity" hint={LAYER_HELP.opacity} value={layer.opacity} min={0} max={1} step={0.01} defaultValue={1} onChange={(opacity) => s.updateLayer(id, { opacity })} format={(v) => `${Math.round(v * 100)}%`} />
        {def.renderer === 'canvas2d' && (
          <NumberControl
            label="Trails"
            hint={LAYER_HELP.trails}
            value={layer.feedback}
            min={0}
            max={0.99}
            step={0.01}
            defaultValue={0}
            onChange={(feedback) => s.updateLayer(id, { feedback })}
          />
        )}
      </Section>

      <Section title="Transform" storageKey="transform" defaultOpen={false}>
        <NumberControl label="X" hint={TRANSFORM_HELP.x} value={tf.x} min={-1} max={1} step={0.01} defaultValue={0} bipolar onChange={(x) => s.updateLayer(id, { transform: { ...tf, x } })} />
        <NumberControl label="Y" hint={TRANSFORM_HELP.y} value={tf.y} min={-1} max={1} step={0.01} defaultValue={0} bipolar onChange={(y) => s.updateLayer(id, { transform: { ...tf, y } })} />
        <NumberControl label="Scale" hint={TRANSFORM_HELP.scale} value={tf.scale} min={0.1} max={4} step={0.01} curve="log" defaultValue={1} unit="×" onChange={(scale) => s.updateLayer(id, { transform: { ...tf, scale } })} />
        <NumberControl label="Rotation" hint={TRANSFORM_HELP.rotation} value={tf.rotation} min={-180} max={180} step={1} defaultValue={0} unit="°" bipolar onChange={(rotation) => s.updateLayer(id, { transform: { ...tf, rotation } })} />
      </Section>

      {groups.map((g) => (
        <Section key={g.name} title={g.name} storageKey={`p:${def.id}:${g.name}`}>
          {g.specs.map((spec) => (
            <ParamControl
              key={spec.key}
              spec={spec}
              value={layer.params[spec.key]}
              onChange={(v) => s.setParam(id, spec.key, v)}
              mod={spec.type === 'number' ? layer.modulations[spec.key] : undefined}
              onMod={spec.type === 'number' ? (m) => s.setModulation(id, spec.key, m) : undefined}
            />
          ))}
        </Section>
      ))}
      {groups.length === 0 && <div className="insp-note">This visualization has no parameters.</div>}
    </LiveContext.Provider>
  );
}
