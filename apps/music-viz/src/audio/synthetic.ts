// STUB — replaced by the audio agent. Deterministic fake features for
// gallery thumbnails, tests and the "no audio loaded" idle state.
import type { AnalysisSettings, AudioFeatures } from '../core/types';
import { silent } from './engine';

export function syntheticFeatures(t: number, settings: AnalysisSettings): AudioFeatures {
  const f = silent(settings);
  f.time = t;
  f.loudness = 0.5 + 0.3 * Math.sin(t * 2);
  return f;
}
