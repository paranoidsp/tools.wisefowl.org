/**
 * Contract for the audio engine (implemented in src/audio/engine.ts).
 * UI and compositor only use this surface.
 */
import type { AnalysisSettings, AudioFeatures } from './types';

export type SourceKind = 'none' | 'file' | 'demo' | 'mic';

export interface TrackOverview {
  /** number of columns */
  columns: number;
  /** per column: peak amplitude 0..1 */
  peaks: Float32Array;
  /** per column: RMS 0..1 */
  rms: Float32Array;
  /** per column: spectral centroid in Hz (for colouring the overview by timbre) */
  centroid: Float32Array;
}

export interface EngineState {
  kind: SourceKind;
  name: string;
  duration: number;
  playing: boolean;
  loading: boolean;
  error: string | null;
  volume: number;
  loop: boolean;
  /** available once a file/demo has been decoded */
  overview: TrackOverview | null;
}

export interface DemoTrack {
  id: string;
  name: string;
  description: string;
}

export interface AudioEngineApi {
  readonly state: EngineState;
  /** subscribe to EngineState changes (not per-frame time); returns unsubscribe */
  subscribe(fn: (s: EngineState) => void): () => void;

  /** current playhead, seconds (cheap; call from rAF) */
  currentTime(): number;

  loadFile(file: File): Promise<void>;
  /** procedurally synthesized demo tracks, so the tool works with no file */
  readonly demos: DemoTrack[];
  loadDemo(id: string): Promise<void>;
  useMicrophone(): Promise<void>;

  play(): Promise<void>;
  pause(): void;
  toggle(): Promise<void>;
  seek(seconds: number): void;
  setVolume(v: number): void;
  setLoop(on: boolean): void;

  /** audio output as a MediaStream (for recording video+audio); null if nothing loaded */
  captureStream(): MediaStream | null;

  /** compute features for this frame; called once per rAF by the compositor */
  analyze(settings: AnalysisSettings): AudioFeatures;
}
