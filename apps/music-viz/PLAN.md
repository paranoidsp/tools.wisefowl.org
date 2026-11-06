---
created: 2026-11-06 18:04:41
updated: 2026-11-06 18:20:00
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
- **Deploy**: source in `apps/music-viz/`, built with `npm run build` into
  `/music-viz/` at the repo root. The built output is committed, because the
  Pages project has no build step. This is a deliberate exception to
  `DESIGN.md`'s "no build step" principle: an editor this size needs a
  component framework.
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
