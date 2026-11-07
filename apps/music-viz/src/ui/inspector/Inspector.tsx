import { useStore, type InspectorTab } from '../../core/store';
import { Segmented } from '../controls/basic';
import { IconInfo } from '../icons';
import { useUi } from '../uiStore';
import { LayerInspector } from './LayerInspector';
import { MappingInspector } from './MappingInspector';
import { SceneInspector } from './SceneInspector';

export function Inspector() {
  const tab = useStore((s) => s.inspectorTab);
  const setTab = useStore((s) => s.setInspectorTab);
  const describe = useUi((s) => s.showDescriptions);
  const setDescribe = useUi((s) => s.setShowDescriptions);
  return (
    <div className="inspector">
      <div className="panel-head panel-head--tabs">
        <Segmented<InspectorTab>
          value={tab}
          onChange={setTab}
          ariaLabel="Inspector"
          options={[
            { value: 'layer', label: 'Layer' },
            { value: 'mapping', label: 'Mapping' },
            { value: 'scene', label: 'Scene' },
          ]}
        />
        <button
          className={`icon-btn icon-btn--sm insp-describe ${describe ? 'is-on' : ''}`}
          onClick={() => setDescribe(!describe)}
          aria-pressed={describe}
          aria-label="Describe settings"
          data-tip={describe ? 'Hide setting descriptions' : 'Describe settings: show what each one does under it (or hover any label)'}
          data-tip-kbd="I"
        >
          <IconInfo size={15} />
        </button>
      </div>
      <div className="panel-scroll" key={tab}>
        {tab === 'layer' && <LayerInspector />}
        {tab === 'mapping' && <MappingInspector />}
        {tab === 'scene' && <SceneInspector />}
      </div>
    </div>
  );
}
