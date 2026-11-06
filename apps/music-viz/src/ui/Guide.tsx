import { useStore } from '../core/store';
import { IconLayers, IconLock, IconMod, IconSparkle, IconWave } from './icons';
import { SHORTCUTS } from './shortcuts';

function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="keys">
      {keys.map((k, i) => (k === '–' ? <span key={i} className="keys__sep">–</span> : <kbd key={i}>{k}</kbd>))}
    </span>
  );
}

export function Guide() {
  const setTab = useStore((s) => s.setTab);
  const groups = [...new Set(SHORTCUTS.map((s) => s.group))];
  return (
    <div className="guide">
      <div className="guide__inner">
        <header className="guide__hero">
          <div className="guide__eyebrow">Guide</div>
          <h1>What does music look like?</h1>
          <p className="guide__lede">
            Music Viz Studio is an editor for exploring that question. It doesn't give you one fixed visualizer. It gives you a stack of layers where every
            mapping from sound to colour, shape and space is a knob you can turn.
          </p>
        </header>

        <section className="guide__section">
          <h2>Three ideas to start from</h2>
          <div className="guide__cards">
            <div className="guide-card">
              <div className="guide-card__swatch guide-card__swatch--light" />
              <h3>Frequency → colour</h3>
              <p>
                Sound and light are both waves. Double a frequency enough times (about 40 octaves) and a note lands in the visible band, roughly 400–790 THz. So
                every pitch has a colour, and its octaves share it. Pitch-class wheels, the circle of fifths and historical schemes such as Scriabin's and
                Newton's are other answers.
              </p>
            </div>
            <div className="guide-card">
              <div className="guide-card__swatch guide-card__swatch--rings" />
              <h3>Harmonics → rings and area</h3>
              <p>
                A note is a fundamental plus overtones. Draw the fundamental as a core of colour and each harmonic as a ring of its own colour around it.
                Loudness becomes size, and timbre becomes the balance of rings.
              </p>
            </div>
            <div className="guide-card">
              <div className="guide-card__swatch guide-card__swatch--beat" />
              <h3>Beats → pulse, shape, place</h3>
              <p>Rhythm lives in time rather than colour. Onsets can make shapes pulse, jump to new positions, spawn particles or change form on each beat.</p>
            </div>
          </div>
        </section>

        <section className="guide__section">
          <h2>How the editor works</h2>
          <div className="guide__model">
            <div className="guide-step">
              <span className="guide-step__icon">
                <IconLayers size={16} />
              </span>
              <div>
                <h3>Layers</h3>
                <p>
                  The Studio stacks visualizations like an image editor. The top of the list draws on top. Each layer has a blend mode, opacity, transform and
                  its own parameters. Drag rows to reorder them, double-click a name to rename it, and right-click for more actions.
                </p>
              </div>
            </div>
            <div className="guide-step">
              <span className="guide-step__icon guide-step__icon--mod">
                <IconMod size={16} />
              </span>
              <div>
                <h3>Modulation</h3>
                <p>
                  Every numeric parameter has a <span className="mod-inline">⦿</span> button. It binds that parameter to an audio feature: loudness, bass,
                  beat, brightness, pitch, or a free-running LFO. The live value is
                  <code>base + amount × range × source</code>. Modulated parameters turn <span className="mod-text">amber</span>, and a ghost marker shows
                  where the value is right now.
                </p>
              </div>
            </div>
            <div className="guide-step">
              <span className="guide-step__icon">
                <IconWave size={16} />
              </span>
              <div>
                <h3>Mapping</h3>
                <p>
                  The Mapping tab of the inspector holds the global colour mapping and the analysis settings. Every layer takes its colours from it, so one
                  change re-colours the whole scene. Use the Mapping Lab to see each scheme on a keyboard and the harmonic series.
                </p>
              </div>
            </div>
            <div className="guide-step">
              <span className="guide-step__icon">
                <IconSparkle size={16} />
              </span>
              <div>
                <h3>Scene</h3>
                <p>The Scene tab sets the background, whole-stage trails, glow, vignette, grain, aspect ratio and render scale.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="guide__section guide__two">
          <div>
            <h2>Tips</h2>
            <ul className="guide__tips">
              <li>
                <b>Scrub any number.</b> Drag sideways on a label or value. Hold <kbd>Shift</kbd> for fine control or <kbd>Alt</kbd> for coarse steps.
                Click the value to type it, and double-click a label to reset it.
              </li>
              <li>
                <b>Start from the Gallery.</b> A scene loads a whole layer stack with its mapping, so you can take it apart.
              </li>
              <li>
                <b>Blend modes matter.</b> <i>Add</i> and <i>Screen</i> make glowing light. <i>Difference</i> makes interference patterns.
              </li>
              <li>
                <b>Small amounts.</b> Modulation amounts of 10–30% usually read better than 100%.
              </li>
              <li>
                <b>Recording.</b> Recordings capture the stage at 60 fps with the audio. Use focus mode (<kbd>F</kbd>) and a fixed aspect ratio for clean
                exports.
              </li>
            </ul>
          </div>
          <div>
            <h2>Keyboard shortcuts</h2>
            <div className="shortcuts">
              {groups.map((g) => (
                <div key={g} className="shortcuts__group">
                  <div className="shortcuts__title">{g}</div>
                  {SHORTCUTS.filter((s) => s.group === g).map((s) => (
                    <div key={s.label} className="shortcuts__row">
                      <span>{s.label}</span>
                      <Keys keys={s.keys} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="guide__privacy">
          <div className="guide__lock"><IconLock size={18} /></div>
          <div>
            <h3>Your audio never leaves your browser</h3>
            <p>
              Files, microphone input and analysis all stay on your device. Nothing is uploaded. Your project autosaves to this browser's local storage. Export
              it as JSON to keep or share it.
            </p>
          </div>
          <button className="btn btn--primary" onClick={() => setTab('studio')}>
            Open the Studio
          </button>
        </section>
      </div>
    </div>
  );
}
