---
created: 2026-11-06 18:04:41
updated: 2026-11-07 19:10:00
creators: [human, claude-opus-5-5]
type: plan
status: active
---

# Music Viz Studio — plan & build log

Working title. It lives at `tools.wisefowl.org/music-viz/` while we iterate and
moves to its own subdomain once we find a name.

## Why

This came out of a conversation with R (2026-11-06) about projecting the
dimensions of music into 2D/3D space:

- **frequency → colour.** Fold frequency up by octaves into the visible-light
  band (≈400–790 THz), or map pitch class onto a hue wheel.
- **harmonics / loudness → area and space.** A primary colour blob for the
  fundamental, with rings of harmonic colours around it.
- **beats → shape, location, pulsing.**

The goal is an *exploration tool*: a visualization editor in the spirit of
Photoshop or Affinity, where every mapping is a knob you can turn, rather than
a fixed visualizer.

## Product shape (v1)

```
┌───────────────────────────────────────────────────────────────────────┐
│ ◐ Music Viz Studio   [Studio] Gallery  Mapping Lab  Guide    ⎌ ⎌  ⤓ ⏺ ⛶ │
├────────────┬──────────────────────────────────────────┬───────────────┤
│ LAYERS     │                                          │ INSPECTOR     │
│ ▣ Bloom    │                                          │ Layer│Map│Scene│
│ ▣ Rings    │             STAGE (canvas)               │  params…      │
│ ▢ Bars     │                                          │  ⦿ modulate   │
│ + Add      │                                          │  blend/opacity│
├────────────┴──────────────────────────────────────────┴───────────────┤
│ ▶ ⏮  0:42 / 3:15  ▁▂▅▇▅▃▂▁▂▃▅▆▇█▇▅▃▂▁ (colour-by-timbre waveform)  🔊 ⟳ │
│ [Open audio…] [Demo tracks ▾] [Mic]          live spectrum strip ▁▃▅▂ │
└───────────────────────────────────────────────────────────────────────┘
```

- **Studio** has a layer stack on the left (add, reorder, hide, solo,
  duplicate, blend mode, opacity), the stage in the centre, and an inspector
  on the right with three tabs:
  - **Layer**: auto-generated controls for the visualization's params, plus a
    modulation button on every numeric param that binds it to an audio
    feature (bass, beat, pitch, brightness, an LFO…).
  - **Mapping**: global colour mapping (light-octave, pitch hue, circle of
    fifths, Scriabin, Newton, spectral, gradient) and analysis settings (FFT
    size, smoothing, frequency scale, dB range, beat sensitivity).
  - **Scene**: background, trails, glow, vignette, grain, aspect ratio,
    render scale.
- **Transport** (bottom): open a file, drag and drop, or pick a synthesized
  demo track or the mic. Play/pause, a seek bar drawn as a waveform coloured
  by timbre, a live spectrum strip, volume and loop.
- **Gallery**: curated scenes (full layer stacks) with live previews on
  hover. These are the "many examples to start from".
- **Mapping Lab**: an explanatory playground for the colour mappings. It shows
  the piano keyboard and frequency axis as each mapping colours them, the
  octave-folding into visible light, and harmonic series colours.
- **Guide**: short how-to and keyboard shortcuts.
- Export and import project JSON, PNG snapshot, record WebM (video + audio),
  autosave to localStorage, undo/redo.

## Architecture

- **Stack**: Vite + React 19 + TypeScript + zustand; Canvas2D for 2D
  visualizations; three.js for 3D visualizations.
- **Deploy**: the tools site now has a build step (approved 2026-11-06).
  `npm run build` at the repo root (`scripts/build.mjs`) builds every
  `apps/<name>/` with Vite into `/<name>/` (gitignored), then copies the site
  into `dist/`, leaving out dev-only files. The Pages project's `build_config`
  (build `npm run build`, output `dist`) lives in Terraform
  (`tf-resources/wisefowl-org.tf`). The existing Web Analytics tag/token are
  kept via `ignore_changes`. CI builds before running Playwright. Node 22 is
  set in `.node-version`.
- **Contracts** (`src/core/`):
  - `types.ts` defines `AudioFeatures`, `ParamSpec`, `VizDefinition`, `Layer`,
    `Scene`, `ColorMapper` and `ProjectFile`.
  - `engine-api.ts` is the audio engine surface.
  - `registry.ts` auto-discovers `src/viz/*/index.ts` and `src/scenes/*.ts`,
    so contributors never edit a shared list.
  - `store.ts` holds the document (layers, colour, analysis, post) with
    undo/redo and autosave, plus UI state.
  - `compositor.ts` runs the render loop. Each layer gets its own canvas, and
    the compositor applies modulation, blends, transforms and post effects.
    The gallery reuses the same class for previews.
  - `stage.ts` is the main compositor instance.
- **Modulation matrix**: any numeric param can be bound to a `ModSource`.
  The effective value is `base + amount × (max − min) × source`, with
  smoothing. This is the main exploration lever.

## Orchestration

I act as orchestrator: I wrote the contracts and a reference visualization
(`viz/spectrum-bars`) myself, then dispatched parallel agents with
non-overlapping ownership:

| Agent | Owns | Delivers |
|---|---|---|
| audio | `src/audio/` | engine (file / demo / mic, seek, loop, capture stream), features (bands, chroma, pitch, partials, peaks, beat/BPM, flux, centroid), track overview, synthesized demo tracks, `syntheticFeatures` |
| ui | `src/ui/`, `src/styles/`, `main.tsx` | app shell, design system, layers panel, inspector + param controls + modulation UI, transport, top bar actions, shortcuts, record/export |
| viz-2d | `src/viz/<2d ids>/` | 2D visualizations, each with presets |
| viz-3d | `src/viz/<3d ids>/` | three.js visualizations, each with presets |
| colour + gallery | `src/color/`, `src/features/`, `src/scenes/` | colour mapping library, Mapping Lab, Gallery, curated scenes |

After the agents finish, I integrate, run a browser QA pass (Playwright plus
screenshots), add a smoke test to the site's suite, build, and deploy.

## Log

- **2026-11-06 18:05** — Kickoff. Read the inbox note, tools-site conventions
  (`DESIGN.md`) and the deploy setup. Chose Vite/React/TS, committing the
  built output.
- **2026-11-06 18:20** — Wrote the core contracts, store, compositor, stubs
  and the reference viz. Typecheck and build pass. Dispatched five agents.
- **2026-11-06 18:40** — Karthik OK'd a build step. Switched from committing
  the built output to a Pages build: added `scripts/build.mjs`,
  `.node-version`, the CI build step and `build_config` in Terraform (plan
  checked; apply waits until the app is on main). Fixed the test static
  server to resolve `dir/` to `index.html`, as Pages does.
- **2026-11-06 18:46** — The UI, 3D and audio agents have landed and are committed.
  - Core follow-ups from their reports: WebGL layer thumbnails are now a 2D
    copy taken right after render, `stage.time()` is a shared clock for the
    LFO meters, and the stage is no longer re-measured every frame (that
    forced a layout each frame).
  - 3D compositing: use premultiplied alpha, and premultiplied additive
    blending (`ADD_PREMUL`) instead of three's `AdditiveBlending`, which drew
    dark halos.
  - Audio: the demos are synthesized directly in JS, because rendering them
    with Web Audio nodes offline was too slow. Loading a track doesn't
    auto-play; the UI calls `play()`.
  - Waiting on the 2D and gallery/colour agents.

- **(next day)** The 2D and gallery agents hit the 5-hour usage limit
  mid-run and were resumed after the reset. Gallery thumbnails switched from
  image encoding, which was slow on GPU readback, to in-memory canvases
  rendered lazily.
- **2026-11-07 10:35** — Integration and QA. All five agents have landed: 16
  visualizations (11 2D, 5 3D), 63 presets, 34 curated scenes.
  - A validator confirms every scene and preset param, option and range
    against the viz definitions.
  - Swept all 34 scenes in headless Chromium on the GPU while a demo played:
    48–60 fps, frame time 1–5 ms, zero errors. A contact sheet reviewed by
    eye looks good.
  - Hooked `MODE_INFO` and `GRADIENT_PRESETS` into the Mapping inspector,
    and widened the param labels.
  - `tests/music-viz.spec.js` added; the full suite passes (52/52).

- **2026-11-07 17:55** — **Live** at https://tools.wisefowl.org/music-viz/. Applied the
  Pages `build_config` with Terraform (Web Analytics tag preserved), merged
  tf-resources#2 and tools.wisefowl.org#3, and the first build deployed
  within about 30 s. A browser check on the live site passed: demo plays,
  56 fps, no console errors, gallery renders. Unknown paths such as `/apps/…`
  return Pages' fallback page, not source files.

- **2026-11-07 18:30** — v1.1, from Karthik's first feedback:
  - **Tooltips on every setting (learning first).**
    - Hovering any label shows a rich tooltip: what the setting does, which
      part of the sound drives it, and its range and default.
    - Describe mode (the ⓘ button or the I key) prints every explanation
      inline.
    - Three agents wrote the content from the code: all 297 viz params and
      their options, 13 blend modes, every Mapping, analysis and Scene
      setting, and the modulation sources.
    - They also caught three wrong hints and a backwards label
      ("Morph speed" is now "Morph smoothing").
  - **Audio loading fixed.** Root causes:
    1. A failed decode reset the engine to "nothing loaded", then the UI's
       `play()` silently started the demo and cleared the error.
    2. The error line rendered off-screen, below the transport.
    3. The file `<input>` was detached from the DOM, so it could be
       garbage-collected mid-dialog and `change` would never fire.
    4. `ctx.resume()` without a user gesture hangs rather than rejecting.
  - **Now:**
    - Files get pre-checks: empty, not audio, MIDI, WMA, DRM, playlists, too
      large.
    - Read and decode failures are explained per format (cloud placeholder,
      ALAC in .m4a, AIFF outside Safari…).
    - The current track keeps playing until the new one decodes.
    - Silent files get a notice.
    - When the browser blocks sound, a notice says so instead of hanging.
    - Audio unlocks on the first click or keypress.
    - Messages sit in a dismissable banner above the transport.
  - **Audio entry points consolidated** to one source control (Open, Demos,
    Mic) plus drag-and-drop anywhere. The stage pill and the seek-bar links
    are gone.
  - Selecting the already-selected layer no longer yanks the inspector back
    to the Layer tab.
  - Tests: regression specs for bad files and for label explanations; the
    suite is 54/54.

- **2026-11-07 19:10** — v1.2: Random, History and autosave.
  - **🎲 Random** (top bar, `G`, or Gallery → Surprise me):
    - Builds 1–3 layers from presets and varies their settings around them
      (`core/random.ts`), sometimes binding a knob to the music.
    - Mild, Medium or Wild sets how far it strays.
    - Seeded: the seed is in the name, so a roll can be rebuilt.
    - `⇧G` (or the dice in the Layer inspector) shuffles one layer.
    - A dud guard rerolls quietly (up to 3×) if the stage is still blank
      1.5 s after a roll while music plays, and drops the dud. In a test of
      15 rolls on the beatless drone, none ended up blank; without the guard
      about 5 in 30 were nearly blank.
  - **History** (left panel tab, `Y`), in `core/history.ts`:
    - The current visualization autosaves every 3 s (doc plus a 192×120
      webp thumbnail) to localStorage.
    - It freezes into a checkpoint when it's replaced (random, scene,
      import, new, restore), on ⌘S (which also opens rename), and every
      4 min of editing (a toast offers "Name it").
    - Rename, star (kept forever), restore (double-click) or delete.
      Unnamed, unstarred checkpoints beyond 60 are pruned, and on quota
      errors old thumbnails are dropped.
    - The store now has `docEpoch` / `docOrigin` to tell a replacement from
      an edit.
  - **Bugs found and fixed along the way:**
    - An edit made less than 3 s before a replacement would have been
      missing from the frozen checkpoint; it now freezes from the
      subscription's `prev` state.
    - The project autosave (400 ms debounce) never flushed on unload, so an
      edit right before closing the tab was lost; `pagehide` /
      `beforeunload` now flush it.
    - Renaming a checkpoint echoed into the project as an "edit" and left
      duplicates.
  - **Shortcuts:** ⌘S is now Save checkpoint; export moved to ⇧⌘S.
  - Tests: History/random regression spec; the suite is 55/55.

## Backlog (post-v1 ideas)
- Tie the chroma/pitch reference to `color.a4` (needs `a4` in
  `AnalysisSettings`); make the band tilt (+3 dB/oct) a setting.
- Layer solo; layer groups/masks; per-layer post effects.
- MIDI input, and MIDI-learn for any knob.
- Keyframes or an automation timeline per param.
- Code-split three.js: the bundle is 1.1 MB, 312 KB gzipped.
- History: compare two checkpoints side by side; export/import the whole history.
- Shareable project links (encode the project into the URL hash).
