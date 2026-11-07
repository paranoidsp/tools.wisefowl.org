/** Dev-only harness: renders GalleryView / LabView in isolation. ?view=gallery|lab */
import { createRoot } from 'react-dom/client';
import '../../styles/tokens.css';
import * as color from '../../color';
import { useStore } from '../../core/store';
import * as registry from '../../core/registry';
import { GalleryView } from '../gallery/GalleryView';
import { LabView } from '../lab/LabView';

(window as unknown as Record<string, unknown>).__color = color;
(window as unknown as Record<string, unknown>).__store = useStore;
(window as unknown as Record<string, unknown>).__registry = registry;

const view = new URLSearchParams(location.search).get('view') ?? 'gallery';
function Harness() {
  const tab = useStore((s) => s.tab);
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>{view === 'lab' ? <LabView /> : <GalleryView />}</div>
      <div id="harness-tab" style={{ height: 24, color: '#5b606c', font: '11px system-ui', padding: '4px 10px' }}>store tab: {tab} · layers: {useStore.getState().layers.length}</div>
    </div>
  );
}
const w = window as unknown as { __harnessRoot?: ReturnType<typeof createRoot> };
w.__harnessRoot ??= createRoot(document.getElementById('root')!);
w.__harnessRoot.render(<Harness />);
