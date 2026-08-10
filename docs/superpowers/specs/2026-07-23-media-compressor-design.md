# Media Compressor — design

Rename and extend the PDF Compressor tool to handle images, PDFs, and video
in one place.

## Motivation

The PDF Compressor already merges/compresses images and PDFs client-side.
Adding video (via the ffmpeg.wasm pattern already used by `media-clip.html`,
`audio-video.html`, `yt-audio.html`) turns it into a general media
compressor without duplicating the queue/quality/mode UI machinery.

## File & naming changes

- `pdf-compress.html` → `media-compress.html`
- `tests/pdf-compress.spec.js` → `tests/media-compress.spec.js`
- Title/`<h1>` → "Media Compressor"; subtitle mentions images, PDFs, and
  video, keeps the "never leaves your device" promise
- `index.html`: update the tool entry (href, label, description)
- `handoff.js`: add `{ file: 'media-compress.html', name: 'Media
  Compressor', accepts: ['image', 'pdf', 'video'] }` to `TOOLS`; add the
  `<script src="handoff.js"></script>` tag to the tool (currently absent)
  and wire `WFHandoff.showOpenIn` on output rows, matching the pattern in
  `media-clip.html`
- `README.md` / `DESIGN.md`: commit-convention examples using scope
  `pdf-compressor` → `media-compressor`

## Input handling

`ACCEPTED` mime set gains video:
`video/mp4`, `video/quicktime`, `video/webm`, `video/x-matroska`,
`video/x-msvideo`

Queue items gain `type: 'video'` alongside existing `'image'` / `'pdf'`.
Video items read duration via a hidden `<video>` element the same way PDF
items read page count via pdf.js — best-effort metadata, item stays
usable if it fails (no error, meta shows "video").

## Modes

Two modes, same mode-selector UI pattern as today:

**Combine into PDF** (existing behavior, unchanged)
- Images + PDFs merge into one PDF, exactly as now.
- Video items are not eligible: rendered in the queue with a greyed
  "can't combine" badge instead of a page-count/size meta, and skipped
  when `createBtn` runs. If the queue is all-video, the action button is
  disabled with a status hint ("Switch to Compress separately for
  video").

**Compress separately** (existing "Separate PDFs" mode, generalized)
- Native output per item instead of always-PDF:
  - image → output format per the image-format selector (below)
  - PDF → recompressed PDF (unchanged)
  - video → compressed MP4 (ffmpeg.wasm)
- Single output: direct download link, same size-comparison line.
- Multiple outputs: ZIP (existing JSZip path) + individual per-file
  download links (existing `#file-list` pattern), unchanged.

## Image output format (Separate mode only)

New selector, visible only in Separate mode and only when the queue
contains at least one image:

```
Keep type · JPG · WEBP · PDF
```

- **Keep type**: re-encode to the image's own type (jpeg stays jpeg,
  webp stays webp, png re-encodes to jpeg today's default — unchanged
  from current behavior, which always rasterizes to JPEG). PNG input
  with "Keep type" still outputs JPEG, same limitation as today; no
  regression, not a new gap to solve here.
- **JPG** / **WEBP**: forced re-encode to that type via canvas
  `toDataURL`/`toBlob`, reusing the existing `imageToJpeg`-style helper
  generalized to take a target mime.
- **PDF**: routes the image through the existing single-page-PDF path
  (what "Combine" does for a single image), still counted as a
  "separate" output.

One global selector, not per-item — matches the existing global
quality-selector pattern (no per-item overrides in this tool today).

## Video compression

- ffmpeg.wasm, same version and lazy-load pattern as `media-clip.html`
  (`@ffmpeg/ffmpeg@0.12.10`, `@ffmpeg/core@0.12.6`, blob-URL caching,
  `ensureFFmpeg()` / `resetFFmpeg()` on crash).
- One shared `FFmpeg` instance across all video items in a batch (loaded
  once, reused per item) so multi-video batches don't reload the ~32 MB
  core repeatedly.
- Always MP4 output:
  ```
  -c:v libx264 -preset veryfast -crf <N> -pix_fmt yuv420p
  -movflags +faststart -c:a aac -b:a 128k
  ```
  plus `-vf scale=-2:<H>` except at `high` (no forced downscale).
- Quality presets extend the existing `QUALITY` table:

  | level  | crf | scale     |
  |--------|-----|-----------|
  | low    | 30  | -2:480    |
  | medium | 26  | -2:720    |
  | high   | 21  | (none)    |

- Progress: reuse `statusMsg`, ffmpeg's `progress` event drives
  `Encoding <name>… NN% (i/n)`, consistent with the existing
  `Processing <name>… (i/n)` text for image/PDF items.
- Crash recovery: same `resetFFmpeg()` + retry-on-next-run pattern as
  `media-clip.html` — a wasm trap doesn't wedge the tool for the rest of
  the session.

## Memory / size warnings

Existing warning (`>40 pages`) stays for the PDF/image page-count case.
Add a second, independently-shown warning for video: total queued video
size `> 200 MB` → "Large video (&gt;200 MB) — encoding in the browser may
be slow and memory-heavy," mirroring `media-clip.html`'s wording for long
clips. Both warnings can show at once (they're about different queue
contents); each is its own `hidden`-toggled element.

## Error handling

Unchanged per-item pattern: a bad/unreadable file gets an inline error
badge in the queue, is skipped at process time, and the rest of the
batch continues. Video decode/encode failures during processing surface
via the same `catch` → `statusMsg` "Error: …" path already used for
PDF/image failures, plus `resetFFmpeg()` so the next attempt gets a
fresh engine.

## Testing

- Rename `tests/pdf-compress.spec.js` → `tests/media-compress.spec.js`,
  update its `page.goto('/media-compress.html')` and existing
  image/PDF/combine/separate cases to the new file.
- Add a video case: use the existing `attachMedia` helper
  (`tests/helpers/gen.js`, already used by `media-clip.spec.js`) to
  generate an in-browser video clip and attach it, no static fixture
  file needed. Run it through Separate mode, assert the output is a
  non-empty MP4 produced without error (CRF re-encode of a synthetic
  low-entropy clip may not shrink, so don't assert on size reduction).
- Keep existing PDF/image/combine/separate assertions intact under the
  new file name.

## Out of scope

- WebM output, per-file format overrides, audio-only input (existing
  tools cover audio), redirect/alias from the old `pdf-compress.html`
  URL.
