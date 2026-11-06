/** Renders one ParamSpec as the right control. */
import type { GradientStop, Modulation, ParamSpec, ParamValue } from '../../core/types';
import { Choice, ColorField, Row, Toggle } from './basic';
import { GradientEditor } from './GradientEditor';
import { ModButton } from './ModButton';
import { NumberControl } from './NumberControl';

interface Props {
  spec: ParamSpec;
  value: ParamValue | undefined;
  onChange(v: ParamValue): void;
  /** omit to hide the modulation button */
  mod?: Modulation;
  onMod?(m: Modulation | null): void;
}

export function ParamControl({ spec, value, onChange, mod, onMod }: Props) {
  switch (spec.type) {
    case 'number': {
      const v = typeof value === 'number' ? value : spec.default;
      return (
        <NumberControl
          label={spec.label}
          hint={spec.hint}
          value={v}
          min={spec.min}
          max={spec.max}
          step={spec.step}
          unit={spec.unit}
          curve={spec.curve}
          defaultValue={spec.default}
          onChange={onChange}
          liveKey={onMod ? spec.key : undefined}
          modulated={!!mod}
          trailing={onMod ? <ModButton label={spec.label} mod={mod} onChange={onMod} /> : undefined}
        />
      );
    }
    case 'select':
      return (
        <Row label={spec.label} hint={spec.hint}>
          <Choice value={String(value ?? spec.default)} options={spec.options} onChange={onChange} label={spec.label} />
        </Row>
      );
    case 'boolean':
      return (
        <Row label={spec.label} hint={spec.hint} className="ctl--toggle">
          <Toggle checked={Boolean(value ?? spec.default)} onChange={onChange} label={spec.label} />
        </Row>
      );
    case 'color':
      return (
        <Row label={spec.label} hint={spec.hint}>
          <ColorField value={String(value ?? spec.default)} onChange={onChange} label={spec.label} />
        </Row>
      );
    case 'gradient':
      return (
        <div className="ctl ctl--stack">
          <div className="ctl__label" title={spec.hint}>
            {spec.label}
          </div>
          <GradientEditor value={Array.isArray(value) ? (value as GradientStop[]) : spec.default} onChange={onChange} />
        </div>
      );
  }
}
