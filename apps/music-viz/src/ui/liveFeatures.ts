/**
 * Shares the stage's per-frame AudioFeatures with UI meters without calling
 * engine.analyze twice per frame: we wrap engine.analyze once at module init
 * and remember its last result. Import this module before the stage starts.
 */
import { engine } from '../audio/engine';
import type { AudioFeatures } from '../core/types';

let latest: AudioFeatures | null = null;
let latestAt = 0;

const orig = engine.analyze.bind(engine);
(engine as { analyze: typeof engine.analyze }).analyze = (settings) => {
  latest = orig(settings);
  latestAt = performance.now();
  return latest;
};

/** Features from the most recent stage frame (null before the first frame). */
export function getLatestFeatures(): AudioFeatures | null {
  return latest;
}

/** ms timestamp of the most recent analysis. */
export function latestFeaturesAt(): number {
  return latestAt;
}

/** Time base matching the compositor's LFO clock closely enough for meters. */
export const uiClockStart = performance.now();
