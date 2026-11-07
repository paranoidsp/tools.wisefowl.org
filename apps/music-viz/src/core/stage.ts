/** The main stage compositor, wired to the store and the audio engine. */
import { engine } from '../audio/engine';
import { Compositor } from './compositor';
import { useStore } from './store';

export const stage = new Compositor({
  doc: () => useStore.getState(),
  features: () => engine.analyze(useStore.getState().analysis),
});
