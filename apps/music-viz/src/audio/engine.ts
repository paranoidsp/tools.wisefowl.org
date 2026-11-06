// STUB — replaced by the audio agent. Keeps the app compiling.
import type { AudioEngineApi, EngineState } from '../core/engine-api';
import type { AnalysisSettings, AudioFeatures } from '../core/types';

export function silent(s: AnalysisSettings): AudioFeatures {
  return {
    time: 0, duration: 0, playing: false, sampleRate: 48000, fftSize: s.fftSize,
    spectrum: new Float32Array(s.fftSize / 2), spectrumDb: new Float32Array(s.fftSize / 2).fill(-100),
    waveform: new Float32Array(s.fftSize), bands: new Float32Array(s.bandCount), bandFreqs: new Float32Array(s.bandCount),
    chroma: new Float32Array(12), rms: 0, loudness: 0, peak: 0, bass: 0, mid: 0, treble: 0,
    centroid: 0, centroidNorm: 0, flux: 0, beat: false, beatPulse: 0, bpm: null, beatPhase: 0, beatCount: 0,
    pitch: { freq: 0, clarity: 0, norm: 0 }, partials: [], peaks: [],
  };
}

class StubEngine implements AudioEngineApi {
  state: EngineState = { kind: 'none', name: '', duration: 0, playing: false, loading: false, error: null, volume: 0.8, loop: true, overview: null };
  demos = [];
  subscribe() { return () => {}; }
  currentTime() { return 0; }
  async loadFile() {}
  async loadDemo() {}
  async useMicrophone() {}
  async play() {}
  pause() {}
  async toggle() {}
  seek() {}
  setVolume() {}
  setLoop() {}
  captureStream() { return null; }
  analyze(s: AnalysisSettings) { return silent(s); }
}

export const engine: AudioEngineApi = new StubEngine();
