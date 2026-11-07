import { useStore, type InspectorTab } from '../../core/store';
import { Segmented } from '../controls/basic';
import { LayerInspector } from './LayerInspector';
import { MappingInspector } from './MappingInspector';
import { SceneInspector } from './SceneInspector';

export function Inspector() {
  const tab = useStore((s) => s.inspectorTab);
  const setTab = useStore((s) => s.setInspectorTab);
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
      </div>
      <div className="panel-scroll" key={tab}>
        {tab === 'layer' && <LayerInspector />}
        {tab === 'mapping' && <MappingInspector />}
        {tab === 'scene' && <SceneInspector />}
      </div>
    </div>
  );
}
