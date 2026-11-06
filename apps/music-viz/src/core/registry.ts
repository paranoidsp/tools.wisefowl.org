/**
 * Visualization + scene registries.
 *
 * Auto-discovers modules so contributors never edit a shared list:
 *   src/viz/<id>/index.ts   → `export default` a VizDefinition
 *   src/scenes/*.ts         → `export default` a Scene or Scene[]
 */
import type { Scene, VizDefinition } from './types';

const vizModules = import.meta.glob<{ default: VizDefinition }>('../viz/*/index.ts', { eager: true });
const sceneModules = import.meta.glob<{ default: Scene | Scene[] }>('../scenes/*.ts', { eager: true });

export const VIZ_LIST: VizDefinition[] = Object.values(vizModules)
  .map((m) => m.default)
  .filter(Boolean)
  .sort((a, b) => a.name.localeCompare(b.name));

export const VIZ: Record<string, VizDefinition> = Object.fromEntries(VIZ_LIST.map((v) => [v.id, v]));

export const SCENES: Scene[] = Object.entries(sceneModules)
  .sort(([a], [b]) => a.localeCompare(b))
  .flatMap(([, m]) => (Array.isArray(m.default) ? m.default : [m.default]))
  .filter(Boolean);

export function getViz(id: string): VizDefinition | undefined {
  return VIZ[id];
}
