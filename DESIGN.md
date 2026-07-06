# Wisefowl Tools — Design Principles

The shared design language for every tool on `tools.wisefowl.org`. Read this
before building a new tool so the whole collection reads as one thing. Distilled
from the PDF Compressor, the first tool built to these conventions.

## Philosophy

1. **Runs entirely in the browser.** No server, no uploads, no accounts. The
   file the user picks never leaves their device. Say so, out loud, in the
   subtitle — it is the product's main promise.
2. **No build step.** Each tool is a single standalone `.html` file in the repo
   root. Dependencies come from a CDN (unpkg / jsdelivr) via `<script>` tags.
   Anyone can open the file and read the whole thing top to bottom.
3. **Self-contained.** Tool-specific CSS lives in an inline `<style>` block; the
   shared `style.css` handles the frame (layout, header, footer, typography).
   Tool-specific JS lives in an inline `<script>` at the bottom.
4. **Honest.** State the tradeoffs and limits in plain language where the user
   will see them (e.g. "Text in PDFs will not be selectable in the output").
   Never hide a caveat to make the tool look more capable than it is.

## Layout & frame

- Single centered column, `max-width: 50rem`, `padding: 2rem 1rem`.
- `font-family: system-ui`, `line-height: 1.6`, text `#1a1a1a` on `#fafafa`.
- **Header** — flex row, space-between:
  - Left: `<h1>` tool name + `<p class="subtitle">` one-line description that
    includes the privacy promise.
  - Right: `<a class="private-link" href="/">← Tools</a>` back link.
- **Footer** — muted, small: `changelog · wisefowl.org`.
- Responsive: single breakpoint at `600px` (tighten padding, shrink `h1`).

## Color

One accent, used sparingly. Everything else is greyscale plus semantic status
colors.

| Role | Value |
| --- | --- |
| Text | `#1a1a1a` |
| Page background | `#fafafa` |
| Accent (links, active, primary button) | `#2563eb` |
| Accent hover (button) | `#1d4ed8` |
| Accent tint (active bg, drag-over) | `#eff6ff` |
| Accent tint border | `#bfdbfe` |
| Primary button disabled | `#93c5fd` |
| Borders | `#e5e7eb` (control), `#d1d5db` (drop zone), `#f3f4f6` (list row) |
| Muted text | `#6b7280`, `#9ca3af`, `#666`, `#999` (lightest) |
| Success / size-saved | `#16a34a` |
| Error | `#dc2626` |
| Warning | text `#92400e` on `#fef3c7`, border `#fde68a` |

## Type scale

- `h1` — `1.8rem` (→ `1.5rem` on mobile)
- `h2` — `1.2rem`, `margin-top: 2.5rem`, bottom border `#e5e7eb` (section rule)
- body — `1rem`
- secondary / controls — `0.9rem`
- meta, notices, captions — `0.8`–`0.85rem`
- smallest (hashes, tiny meta) — `0.75rem`

## Components

Reusable patterns. Copy the ones you need; keep the class names.

- **Drop zone** — dashed `#d1d5db` border, `border-radius: 8px`, centered prompt
  + "browse files" text button. `.drag-over` → accent border + `#eff6ff` bg.
  Always pair drag-and-drop with a hidden `<input type="file">`.
- **Segmented selector** — a row of flex-`1` buttons (`.quality-btn` /
  `.mode-btn` style): white bg, `#e5e7eb` border, muted text. Active button gets
  accent border + accent text + `#eff6ff` bg. Use for quality / mode / format /
  size choices. One selection at a time.
- **Primary action button** — accent-filled, white text, `border-radius: 5px`,
  `padding: 0.6rem 1.5rem`. Hover `#1d4ed8`. Disabled `#93c5fd` +
  `cursor: not-allowed`. Disable it while there is nothing to act on and while
  work is running.
- **List rows** (queue, outputs) — flex rows, `0.9rem`, bottom border `#f3f4f6`,
  a flexible name that ellipsizes, muted `.meta` on the right, small ghost
  buttons for row actions.
- **Output row** — the download link + a `#16a34a` before→after summary
  ("4.2 MB → 1.1 MB (74% smaller)").
- **Status line** — muted `0.9rem` text for progress ("Processing… (2/5)").
- **Notices** — non-blocking. Limitation notice: muted grey. Memory/size
  warning: the amber palette (`#92400e` / `#fef3c7` / `#fde68a`).

## Interaction principles

1. **Progressive disclosure.** Start with just the drop zone. Reveal the editor
   / options once a file is loaded, and the output section only once there is an
   output. Hide sections again on reset.
2. **Reset cleanly.** New input clears prior output. Track every
   `URL.createObjectURL` and `revokeObjectURL` them on reset to avoid leaks — a
   small `trackUrl` / `revokeOutputs` helper pair does the job.
3. **Feedback during work.** Disable the action button, show a status/progress
   line, re-enable in a `finally` so a failure never leaves a dead button.
4. **Errors inline, not fatal.** Bad input → an inline badge, skip it, keep
   going. Processing error → show the message, re-enable the button.
5. **Give size feedback.** Show the before→after size in green. It is the payoff.

## Conventions

- One tool per file, one tool per commit.
- Add the tool to `index.html` under **Tools** with a one-line `.tool-desc`.
- Conventional commits, scope = tool name (kebab-case). The changelog page
  parses `type(scope): message` and renders the scope as a badge:
  ```
  feat(media-clipper): add gif export
  fix(pdf-compressor): correct unicode filename encoding
  ```
- Deployed by Cloudflare Pages on push to `main` — no build, output dir `/`.
