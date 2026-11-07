/** Centre stage: hosts the global compositor canvas (mounted once, never disposed). */
import { useEffect, useRef } from 'react';
import { engine } from '../audio/engine';
import { stage } from '../core/stage';
import { useStore } from '../core/store';
import { loadDemo, openAudioDialog } from './actions';
import { IconFolder, IconLayers, IconMusic, IconPanels, IconPlus, IconSparkle } from './icons';
import { useUi } from './uiStore';
import { useEngineState } from './useEngine';

let started = false;

export function Stage() {
  const host = useRef<HTMLDivElement>(null);
  const empty = useStore((s) => s.layers.length === 0);
  const focus = useStore((s) => s.focusMode);
  const st = useEngineState();

  useEffect(() => {
    stage.mount(host.current!);
    if (!started) {
      started = true;
      stage.start();
    }
    return () => stage.unmount();
  }, []);

  const noAudio = st.kind === 'none' && !st.loading;

  return (
    <div className="stage">
      <div className="stage__host" ref={host} />
      {empty && (
        <div className="stage-hint">
          <div className="stage-hint__card">
            <div className="stage-hint__icon">
              <IconSparkle size={20} />
            </div>
            <h2>Start with a layer</h2>
            <p>Add a visualization layer, or pick a ready-made scene from the Gallery. Every parameter can be bound to the music.</p>
            <div className="stage-hint__actions">
              <button className="btn btn--primary" onClick={() => useUi.getState().setPickerOpen(true)}>
                <IconPlus size={14} /> Add layer
              </button>
              <button className="btn" onClick={() => useStore.getState().setTab('gallery')}>
                <IconLayers size={14} /> Browse gallery
              </button>
            </div>
          </div>
        </div>
      )}
      {!empty && noAudio && !focus && (
        <div className="stage-audio-hint">
          <span>No audio yet:</span>
          <button className="chip chip--solid" onClick={() => (engine.demos[0] ? loadDemo(engine.demos[0].id) : openAudioDialog())}>
            <IconMusic size={12} /> Play a demo
          </button>
          <button className="chip chip--solid" onClick={() => openAudioDialog()}>
            <IconFolder size={12} /> Open file
          </button>
        </div>
      )}
      <div className="stage__drawer-btns">
        <button className="icon-btn icon-btn--float" onClick={() => useUi.getState().setDrawer('left')} aria-label="Show layers">
          <IconLayers size={16} />
        </button>
        <button className="icon-btn icon-btn--float" onClick={() => useUi.getState().setDrawer('right')} aria-label="Show inspector">
          <IconPanels size={16} />
        </button>
      </div>
    </div>
  );
}
