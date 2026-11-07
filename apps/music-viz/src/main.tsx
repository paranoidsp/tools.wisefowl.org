import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// must run before the stage starts so UI meters can share its features
import './ui/liveFeatures';
import { SCENES, getViz } from './core/registry';
import { isFirstRun, useStore } from './core/store';
import { App } from './ui/App';
import { setOnAutoCheckpoint, startHistory } from './core/history';
import { renameCheckpointLater } from './ui/actions';
import { toast } from './ui/uiStore';
import './styles/index.css';

// First visit: start from the first curated scene, else a simple spectrum layer.
if (isFirstRun) {
  const s = useStore.getState();
  if (SCENES.length) s.loadScene(SCENES[0]);
  else if (getViz('spectrum-bars')) s.addLayer('spectrum-bars');
  // the starting point should not be an undo step
  useStore.setState({ past: [], future: [] });
}

// Auto-save + History. Timed checkpoints offer a rename right away.
startHistory();
setOnAutoCheckpoint((id) =>
  toast('Checkpoint saved to History', 'success', 6000, { label: 'Name it', run: () => renameCheckpointLater(id) }),
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
