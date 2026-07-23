# Media Compressor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename `pdf-compress.html` to `media-compress.html` and extend it to
compress images, PDFs, and video (via ffmpeg.wasm) with native-format output
in "Compress separately" mode.

**Architecture:** Single-file tool, no build step, following the existing
queue → quality/mode selectors → process → download pattern already in the
tool. Video support reuses the ffmpeg.wasm loading/crash-recovery pattern
already shipped in `media-clip.html`. Image native-format output generalizes
the existing JPEG-only embed helper into a canvas-blob helper that can target
JPEG or WEBP.

**Tech Stack:** Vanilla JS, pdf-lib, pdfjs-dist, JSZip, ffmpeg.wasm
(`@ffmpeg/ffmpeg` 0.12.10 + `@ffmpeg/core` 0.12.6 + `@ffmpeg/util` 0.12.1),
Playwright for e2e tests (in-browser generated test media, no binary
fixtures).

## Global Constraints

- One tool per file, no build step — `media-compress.html` stays a single
  standalone file (DESIGN.md).
- Follow `DESIGN.md` component/color/type conventions for any new UI
  (segmented selector pattern for the new image-format selector, amber
  palette for the new video-size warning).
- Conventional commits, scope `media-compressor` (kebab-case), one tool
  concern per commit (README.md / DESIGN.md convention).
- CDN deps added must already have a Playwright-hermetic mapping via
  `tests/helpers/fixtures.js` (unpkg/jsdelivr → `node_modules`) — ffmpeg
  packages are already devDependencies in `package.json`, so no new mapping
  work is needed.
- Every new interactive element needs an e2e assertion in
  `tests/media-compress.spec.js`; no manual-only verification.
- Never overwrite `tests/pdf-compress.spec.js` content silently — it is
  renamed (`git mv`), not deleted-and-recreated, so history is preserved.

---

### Task 1: Rename to Media Compressor + handoff baseline (image/pdf)

**Files:**
- Rename: `pdf-compress.html` → `media-compress.html`
- Rename: `tests/pdf-compress.spec.js` → `tests/media-compress.spec.js`
- Modify: `media-compress.html` (title/h1/subtitle, add `handoff.js`, wire
  `open-in` handoff control)
- Modify: `handoff.js` (register the tool)
- Modify: `tests/handoff.spec.js` (one assertion changes because a new tool
  now accepts `image`)
- Modify: `index.html` (tool entry)
- Modify: `README.md`, `DESIGN.md` (commit-convention example scope)

**Interfaces:**
- Produces: `addFiles(files: File[])` — already exists in the tool, reused
  unchanged as the handoff receive target.
- Produces: `openInEl` (`#open-in` DOM node) and a `WFHandoff.showOpenIn`
  call after the combined-mode PDF is produced — later tasks (2, 3) add more
  `showOpenIn` call sites for the separate-mode branch.

- [ ] **Step 1: Rename the tool and test files**

```bash
git mv pdf-compress.html media-compress.html
git mv tests/pdf-compress.spec.js tests/media-compress.spec.js
```

- [ ] **Step 2: Update the spec's goto path**

In `tests/media-compress.spec.js`, change:

```js
test.beforeEach(async ({ page }) => {
  await page.goto('/pdf-compress.html');
```

to:

```js
test.beforeEach(async ({ page }) => {
  await page.goto('/media-compress.html');
```

- [ ] **Step 3: Run the renamed suite to confirm nothing broke from the move alone**

Run: `npx playwright test media-compress.spec.js`
Expected: PASS (5 tests, same as before the rename — no behavior changed yet)

- [ ] **Step 4: Rebrand the title, heading, and subtitle**

In `media-compress.html`, change:

```html
    <title>PDF Compressor — Wisefowl Tools</title>
```

to:

```html
    <title>Media Compressor — Wisefowl Tools</title>
```

and change:

```html
            <h1>PDF Compressor</h1>
            <p class="subtitle">Compress images and PDFs. Combined or separate. Files never leave your device.</p>
```

to:

```html
            <h1>Media Compressor</h1>
            <p class="subtitle">Compress images, PDFs, and video. Combined or separate. Files never leave your device.</p>
```

- [ ] **Step 5: Add the handoff control markup to the output row**

In `media-compress.html`, change:

```html
            <a id="download-link" class="download-btn" href="#" download>Download</a>
            <span id="size-comparison"></span>
        </div>
        <ul id="file-list" hidden></ul>
```

to:

```html
            <a id="download-link" class="download-btn" href="#" download>Download</a>
            <span id="size-comparison"></span>
            <span id="open-in" class="open-in" hidden></span>
        </div>
        <ul id="file-list" hidden></ul>
```

- [ ] **Step 6: Load `handoff.js`**

In `media-compress.html`, change:

```html
    <script src="https://unpkg.com/jszip@3.10.1/dist/jszip.min.js"></script>
    <script src="https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js"></script>
    <script type="module">
```

to:

```html
    <script src="https://unpkg.com/jszip@3.10.1/dist/jszip.min.js"></script>
    <script src="https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js"></script>
    <script src="handoff.js"></script>
    <script type="module">
```

- [ ] **Step 7: Grab the `open-in` element**

In `media-compress.html`, change:

```js
        const sizeComp      = document.getElementById('size-comparison');
        const fileList      = document.getElementById('file-list');
```

to:

```js
        const sizeComp      = document.getElementById('size-comparison');
        const fileList      = document.getElementById('file-list');
        const openInEl      = document.getElementById('open-in');
```

- [ ] **Step 8: Call `showOpenIn` after the combined-mode PDF is produced**

In `media-compress.html`, change:

```js
                    const inMB  = (totalInputBytes / 1048576).toFixed(1);
                    const outMB = (pdfBytes.byteLength / 1048576).toFixed(1);
                    const pct   = Math.round((1 - pdfBytes.byteLength / totalInputBytes) * 100);
                    sizeComp.textContent = pct > 0
                        ? `${inMB} MB → ${outMB} MB (${pct}% smaller)`
                        : `${inMB} MB → ${outMB} MB`;
                } else {
```

to:

```js
                    const inMB  = (totalInputBytes / 1048576).toFixed(1);
                    const outMB = (pdfBytes.byteLength / 1048576).toFixed(1);
                    const pct   = Math.round((1 - pdfBytes.byteLength / totalInputBytes) * 100);
                    sizeComp.textContent = pct > 0
                        ? `${inMB} MB → ${outMB} MB (${pct}% smaller)`
                        : `${inMB} MB → ${outMB} MB`;
                    WFHandoff.showOpenIn(openInEl, { blob, name: outName, kind: 'pdf' });
                } else {
```

- [ ] **Step 9: Give separate-mode outputs a `mime`/`kind` and offer handoff for a single output**

In `media-compress.html`, change:

```js
                        const name = compressedName(item.name);
                        zip.file(name, pdfBytes);
                        outputs.push({ name, bytes: pdfBytes });
                    }
                    statusMsg.textContent = 'Creating ZIP…';
```

to:

```js
                        const name = compressedName(item.name);
                        zip.file(name, pdfBytes);
                        outputs.push({ name, bytes: pdfBytes, mime: 'application/pdf', kind: 'pdf' });
                    }
                    statusMsg.textContent = 'Creating ZIP…';
```

and change:

```js
                    for (const out of outputs) {
                        const url = trackUrl(URL.createObjectURL(
                            new Blob([out.bytes], { type: 'application/pdf' })));
```

to:

```js
                    for (const out of outputs) {
                        const url = trackUrl(URL.createObjectURL(
                            new Blob([out.bytes], { type: out.mime })));
```

and change:

```js
                    sizeComp.textContent = pct > 0
                        ? `${inMB} MB → ${outMB} MB (${pct}% smaller)`
                        : `${inMB} MB → ${outMB} MB`;
                }

                outputSection.hidden = false;
```

(this is the second, separate-mode occurrence of this block — the combined-mode one was already handled in Step 8) to:

```js
                    sizeComp.textContent = pct > 0
                        ? `${inMB} MB → ${outMB} MB (${pct}% smaller)`
                        : `${inMB} MB → ${outMB} MB`;

                    if (outputs.length === 1) {
                        WFHandoff.showOpenIn(openInEl, {
                            blob: new Blob([outputs[0].bytes], { type: outputs[0].mime }),
                            name: outputs[0].name,
                            kind: outputs[0].kind,
                        });
                    } else {
                        openInEl.hidden = true;
                    }
                }

                outputSection.hidden = false;
```

- [ ] **Step 10: Receive handoff input on load**

At the end of the `<script type="module">` block in `media-compress.html`
(after the `createBtn.addEventListener(...)` block closes), add:

```js

        WFHandoff.receive({
            image: f => addFiles([f]),
            pdf:   f => addFiles([f]),
        });
```

- [ ] **Step 11: Register the tool in the handoff registry**

In `handoff.js`, change:

```js
  const TOOLS = [
    { file: 'media-clip.html',  name: 'Media Clipper',  accepts: ['audio', 'video'] },
    { file: 'audio-merge.html', name: 'Audio Merge',    accepts: ['audio'] },
    { file: 'audio-video.html', name: 'Audio to Video', accepts: ['image', 'audio'] },
  ];
```

to:

```js
  const TOOLS = [
    { file: 'media-clip.html',    name: 'Media Clipper',    accepts: ['audio', 'video'] },
    { file: 'audio-merge.html',   name: 'Audio Merge',      accepts: ['audio'] },
    { file: 'audio-video.html',   name: 'Audio to Video',   accepts: ['image', 'audio'] },
    { file: 'media-compress.html', name: 'Media Compressor', accepts: ['image', 'pdf'] },
  ];
```

(video is added to `accepts` in Task 3, once the tool can actually process it)

- [ ] **Step 12: Fix the handoff test whose target list now includes Media Compressor**

In `tests/handoff.spec.js`, change:

```js
test('an image output only offers Audio to Video', async ({ page }) => {
  await page.goto('/media-clip.html');
  expect(await targetsFor(page, 'image', 'image/gif')).toEqual(['Audio to Video']);
});
```

to:

```js
test('an image output offers Audio to Video and Media Compressor', async ({ page }) => {
  await page.goto('/media-clip.html');
  expect(await targetsFor(page, 'image', 'image/gif')).toEqual(['Audio to Video', 'Media Compressor']);
});
```

- [ ] **Step 13: Run the full suite**

Run: `npx playwright test`
Expected: PASS (all specs, including `media-compress.spec.js` and
`handoff.spec.js`)

- [ ] **Step 14: Update `index.html`**

In `index.html`, change:

```html
        <li><a href="pdf-compress.html">PDF Compressor</a> <span class="tool-desc">— Merge images and PDFs into one small PDF. Runs in your browser.</span></li>
```

to:

```html
        <li><a href="media-compress.html">Media Compressor</a> <span class="tool-desc">— Compress and convert images, PDFs, and video. Runs in your browser.</span></li>
```

- [ ] **Step 15: Update commit-convention examples in README.md and DESIGN.md**

In `README.md`, change:

```
feat(pdf-compressor): add separate PDFs mode
fix(pdf-compressor): correct filename encoding for unicode
```

to:

```
feat(media-compressor): add separate PDFs mode
fix(media-compressor): correct filename encoding for unicode
```

In `DESIGN.md`, change:

```
  feat(media-clipper): add gif export
  fix(pdf-compressor): correct unicode filename encoding
```

to:

```
  feat(media-clipper): add gif export
  fix(media-compressor): correct unicode filename encoding
```

Also in `DESIGN.md`, change:

```
The shared design language for every tool on `tools.wisefowl.org`. Read this
before building a new tool so the whole collection reads as one thing. Distilled
from the PDF Compressor, the first tool built to these conventions.
```

to:

```
The shared design language for every tool on `tools.wisefowl.org`. Read this
before building a new tool so the whole collection reads as one thing. Distilled
from the Media Compressor (originally the PDF Compressor), the first tool
built to these conventions.
```

- [ ] **Step 16: Commit**

```bash
git add pdf-compress.html media-compress.html tests/pdf-compress.spec.js \
        tests/media-compress.spec.js handoff.js tests/handoff.spec.js \
        index.html README.md DESIGN.md
git commit -m "feat(media-compressor): rename PDF Compressor to Media Compressor

Renames pdf-compress.html to media-compress.html ahead of adding
video support. Wires up handoff (Send to) for image/PDF output;
video is added to the handoff registry once the tool can process it."
```

---

### Task 2: Native image/PDF output in Separate mode

**Files:**
- Modify: `media-compress.html` (image-format selector UI, `imageToBlob`
  helper, `processItemSeparate` dispatcher, separate-mode branch rewrite)
- Modify: `tests/media-compress.spec.js` (update one existing assertion,
  add two new tests)

**Interfaces:**
- Consumes: `compressedName(originalName, ext = '.pdf')` (existing, no
  signature change), `imageToJpeg(file, maxDim, jpegQ)` (existing, still
  used for the PDF-embedding paths), `openInEl`, `WFHandoff.showOpenIn`
  (from Task 1).
- Produces: `imageToBlob(file, maxDim, quality, mime): Promise<Blob>` —
  used by Task 3's video branch is NOT applicable (video uses its own
  helper in Task 3), but `processItemSeparate` and its `{name, bytes, mime,
  kind}` return shape ARE extended in Task 3 with a `video` branch.
- Produces: `activeImageFormat: 'keep' | 'jpg' | 'webp' | 'pdf'` (module
  state), `processItemSeparate(item, cfg, level, imageFormat):
  Promise<{name: string, bytes: Uint8Array, mime: string, kind: string}>`.

- [ ] **Step 1: Write the failing tests**

In `tests/media-compress.spec.js`, change the existing test:

```js
test('separate mode offers a ZIP plus individual downloads', async ({ page }) => {
  await attachImages(page, 3);
  await page.click('.mode-btn[data-mode="separate"]');
  await page.click('#create-btn');
  await expect(page.locator('#output-section')).toBeVisible({ timeout: 60_000 });

  const link = page.locator('#download-link');
  await expect(link).toHaveAttribute('download', /\.zip$/);
  await expect(page.locator('#filename-ext')).toHaveText('.zip');

  // One individual download link per input file.
  await expect(page.locator('#file-list')).toBeVisible();
  await expect(page.locator('#file-list a')).toHaveCount(3);
  await expect(page.locator('#file-list a').first()).toHaveAttribute('download', /-compressed\.pdf$/);
});
```

to (default image format is now "keep type", and the test images are PNG,
which — like today's always-JPEG behavior — encodes to JPEG):

```js
test('separate mode offers a ZIP plus individual downloads, native format by default', async ({ page }) => {
  await attachImages(page, 3);
  await page.click('.mode-btn[data-mode="separate"]');
  await page.click('#create-btn');
  await expect(page.locator('#output-section')).toBeVisible({ timeout: 60_000 });

  const link = page.locator('#download-link');
  await expect(link).toHaveAttribute('download', /\.zip$/);
  await expect(page.locator('#filename-ext')).toHaveText('.zip');

  // One individual download link per input file.
  await expect(page.locator('#file-list')).toBeVisible();
  await expect(page.locator('#file-list a')).toHaveCount(3);
  await expect(page.locator('#file-list a').first()).toHaveAttribute('download', /-compressed\.jpg$/);
});

test('separate mode can force images to WEBP', async ({ page }) => {
  await attachImages(page, 2);
  await page.click('.mode-btn[data-mode="separate"]');
  await page.click('.format-btn[data-format="webp"]');
  await page.click('#create-btn');
  await expect(page.locator('#output-section')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#file-list a')).toHaveCount(2);
  await expect(page.locator('#file-list a').first()).toHaveAttribute('download', /-compressed\.webp$/);
});

test('separate mode can still force PDF output for images', async ({ page }) => {
  await attachImages(page, 2);
  await page.click('.mode-btn[data-mode="separate"]');
  await page.click('.format-btn[data-format="pdf"]');
  await page.click('#create-btn');
  await expect(page.locator('#output-section')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#file-list a').first()).toHaveAttribute('download', /-compressed\.pdf$/);
});

test('image format selector only shows in separate mode with images queued', async ({ page }) => {
  await attachImages(page, 1);
  await expect(page.locator('#image-format-selector')).toBeHidden();
  await page.click('.mode-btn[data-mode="separate"]');
  await expect(page.locator('#image-format-selector')).toBeVisible();
  await page.click('.mode-btn[data-mode="combined"]');
  await expect(page.locator('#image-format-selector')).toBeHidden();
});
```

- [ ] **Step 2: Run the suite to confirm the new/changed tests fail**

Run: `npx playwright test media-compress.spec.js`
Expected: FAIL — `#image-format-selector` and `.format-btn` don't exist yet;
the "native format by default" test fails because output is still always
`.pdf`.

- [ ] **Step 3: Add the image-format selector styles**

In `media-compress.html`, change:

```css
        .mode-btn.active {
            border-color: #2563eb;
            color: #2563eb;
            background: #eff6ff;
        }
    </style>
```

to:

```css
        .mode-btn.active {
            border-color: #2563eb;
            color: #2563eb;
            background: #eff6ff;
        }
        .format-selector { display: flex; gap: 0.5rem; margin: 0.5rem 0 0.75rem; }
        .format-btn {
            flex: 1;
            padding: 0.4rem;
            border: 1px solid #e5e7eb;
            border-radius: 4px;
            background: white;
            cursor: pointer;
            font-size: 0.9rem;
            color: #6b7280;
        }
        .format-btn.active {
            border-color: #2563eb;
            color: #2563eb;
            background: #eff6ff;
        }
    </style>
```

- [ ] **Step 4: Add the selector markup**

In `media-compress.html`, change:

```html
        <div class="mode-selector">
            <button class="mode-btn active" data-mode="combined" type="button">One PDF</button>
            <button class="mode-btn" data-mode="separate" type="button">Separate PDFs</button>
        </div>

        <button id="create-btn" type="button">Create PDF</button>
```

to:

```html
        <div class="mode-selector">
            <button class="mode-btn active" data-mode="combined" type="button">One PDF</button>
            <button class="mode-btn" data-mode="separate" type="button">Separate PDFs</button>
        </div>

        <div class="format-selector" id="image-format-selector" hidden>
            <button class="format-btn active" data-format="keep" type="button">Keep type</button>
            <button class="format-btn" data-format="jpg" type="button">JPG</button>
            <button class="format-btn" data-format="webp" type="button">WEBP</button>
            <button class="format-btn" data-format="pdf" type="button">PDF</button>
        </div>

        <button id="create-btn" type="button">Create PDF</button>
```

- [ ] **Step 5: Add module state, the DOM ref, and the selector's click handler**

In `media-compress.html`, change:

```js
        let queue = [];
        let nextId = 0;
        let activeLevel = 'medium';
        let activeMode = 'combined';
        let outputUrls = [];
```

to:

```js
        let queue = [];
        let nextId = 0;
        let activeLevel = 'medium';
        let activeMode = 'combined';
        let activeImageFormat = 'keep';
        let outputUrls = [];
```

and change:

```js
        const openInEl      = document.getElementById('open-in');
```

to:

```js
        const openInEl      = document.getElementById('open-in');
        const imageFormatSelector = document.getElementById('image-format-selector');
```

and, after the existing mode-selector listener block:

```js
        // Mode selector
        document.querySelector('.mode-selector').addEventListener('click', e => {
            const btn = e.target.closest('.mode-btn');
            if (!btn) return;
            document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeMode = btn.dataset.mode;
            createBtn.textContent = activeMode === 'combined' ? 'Create PDF' : 'Create PDFs';
        });
```

replace it with:

```js
        // Mode selector
        document.querySelector('.mode-selector').addEventListener('click', e => {
            const btn = e.target.closest('.mode-btn');
            if (!btn) return;
            document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeMode = btn.dataset.mode;
            createBtn.textContent = activeMode === 'combined' ? 'Create PDF' : 'Compress';
            renderQueue();
        });

        // Image output format selector (separate mode only)
        document.querySelector('.format-selector').addEventListener('click', e => {
            const btn = e.target.closest('.format-btn');
            if (!btn) return;
            document.querySelectorAll('.format-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeImageFormat = btn.dataset.format;
        });
```

- [ ] **Step 6: Show/hide the selector from `renderQueue`**

In `media-compress.html`, change:

```js
            queueList.innerHTML = '';
            queue.forEach((item, i) => {
```

to:

```js
            imageFormatSelector.hidden = !(activeMode === 'separate' && queue.some(x => x.type === 'image'));

            queueList.innerHTML = '';
            queue.forEach((item, i) => {
```

- [ ] **Step 7: Add `imageToBlob` and the format-mapping helpers**

In `media-compress.html`, change:

```js
        function compressedName(originalName, ext = '.pdf') {
```

to:

```js
        async function imageToBlob(file, maxDim, quality, mime) {
            const url = URL.createObjectURL(file);
            const img = new Image();
            await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
            URL.revokeObjectURL(url);
            let w = img.naturalWidth, h = img.naturalHeight;
            if (Math.max(w, h) > maxDim) {
                const r = maxDim / Math.max(w, h);
                w = Math.round(w * r);
                h = Math.round(h * r);
            }
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            return new Promise(res => canvas.toBlob(res, mime, quality));
        }

        const IMG_EXT = { 'image/jpeg': '.jpg', 'image/webp': '.webp' };

        // PNG (and anything else) can't round-trip as itself in this tool —
        // it always rasterizes to JPEG, same limitation "Keep type" has had
        // since the tool only ever produced JPEG-backed PDFs.
        function keepTypeMime(inputType) {
            return inputType === 'image/webp' ? 'image/webp' : 'image/jpeg';
        }

        function compressedName(originalName, ext = '.pdf') {
```

- [ ] **Step 8: Add `processItemSeparate`**

In `media-compress.html`, change:

```js
        createBtn.addEventListener('click', async () => {
```

to:

```js
        async function processItemSeparate(item, cfg, level, imageFormat) {
            const { PDFDocument } = window.PDFLib;
            if (item.type === 'pdf' || (item.type === 'image' && imageFormat === 'pdf')) {
                const doc = await PDFDocument.create();
                await processItemIntoDoc(item, doc, cfg);
                const bytes = await doc.save();
                return { name: compressedName(item.name, '.pdf'), bytes, mime: 'application/pdf', kind: 'pdf' };
            }
            // item.type === 'image', native output
            const mime = imageFormat === 'keep' ? keepTypeMime(item.file.type)
                       : imageFormat === 'jpg'  ? 'image/jpeg'
                       : 'image/webp';
            const blob = await imageToBlob(item.file, cfg.imgMaxDim, cfg.jpeg, mime);
            const bytes = new Uint8Array(await blob.arrayBuffer());
            return { name: compressedName(item.name, IMG_EXT[mime]), bytes, mime, kind: 'image' };
        }

        createBtn.addEventListener('click', async () => {
```

- [ ] **Step 9: Rewrite the separate-mode branch to use it**

In `media-compress.html`, change:

```js
                } else {
                    // Separate mode: one PDF per input file.
                    // Provide both a combined ZIP and individual download links.
                    const zip = new window.JSZip();
                    const outputs = [];
                    let totalOutputBytes = 0;
                    let processed = 0;
                    for (const item of valid) {
                        processed++;
                        statusMsg.textContent = `Processing ${item.name}… (${processed}/${valid.length})`;
                        const doc = await PDFDocument.create();
                        await processItemIntoDoc(item, doc, cfg);
                        const pdfBytes = await doc.save();
                        totalOutputBytes += pdfBytes.byteLength;
                        const name = compressedName(item.name);
                        zip.file(name, pdfBytes);
                        outputs.push({ name, bytes: pdfBytes, mime: 'application/pdf', kind: 'pdf' });
                    }
                    statusMsg.textContent = 'Creating ZIP…';
```

to:

```js
                } else {
                    // Separate mode: native output per input file.
                    // Provide both a combined ZIP and individual download links.
                    const zip = new window.JSZip();
                    const outputs = [];
                    let totalOutputBytes = 0;
                    let processed = 0;
                    for (const item of valid) {
                        processed++;
                        statusMsg.textContent = `Processing ${item.name}… (${processed}/${valid.length})`;
                        const out = await processItemSeparate(item, cfg, activeLevel, activeImageFormat);
                        totalOutputBytes += out.bytes.byteLength;
                        zip.file(out.name, out.bytes);
                        outputs.push(out);
                    }
                    statusMsg.textContent = 'Creating ZIP…';
```

- [ ] **Step 10: Run the suite to confirm it passes**

Run: `npx playwright test media-compress.spec.js`
Expected: PASS (8 tests: the original 4 minus the one replaced, plus the 4
new/changed ones from Step 1)

- [ ] **Step 11: Run the full suite**

Run: `npx playwright test`
Expected: PASS (no regressions in other tools' specs)

- [ ] **Step 12: Commit**

```bash
git add media-compress.html tests/media-compress.spec.js
git commit -m "feat(media-compressor): native image/PDF output in Separate mode

Separate mode now outputs images in their own format (JPG/WEBP,
selectable, defaulting to 'keep type') instead of always wrapping
them in a PDF. PDF input still recompresses to PDF. The old
always-PDF behavior is still available via the new PDF format
button."
```

---

### Task 3: Video support (accept, queue, Combine exclusion, ffmpeg compression)

**Files:**
- Modify: `media-compress.html` (accept video input, queue rendering,
  Combine-mode exclusion + hint, ffmpeg wiring, video branch in
  `processItemSeparate`, video size warning)
- Modify: `handoff.js` (add `video` to the tool's `accepts`)
- Modify: `tests/handoff.spec.js` (one assertion changes)
- Modify: `tests/media-compress.spec.js` (three new tests)

**Interfaces:**
- Consumes: `processItemSeparate(item, cfg, level, imageFormat)` (Task 2) —
  gains a video branch; `openInEl`, `WFHandoff.showOpenIn` (Task 1);
  `addFiles` (existing).
- Produces: `compressVideo(item, level): Promise<Uint8Array>`,
  `readVideoDuration(file): Promise<number>`, `ensureFFmpeg()`,
  `resetFFmpeg()` (module-private, no other task consumes them directly).

- [ ] **Step 1: Write the failing tests**

In `tests/media-compress.spec.js`, add:

```js
test('video is accepted and shown as incompatible with Combine', async ({ page }) => {
  await attachImages(page, 1);
  await attachMedia(page, { video: true, ms: 1000 });
  await expect(page.locator('#queue-list li')).toHaveCount(2);
  await expect(page.locator('#queue-list li .incompatible')).toBeVisible();
  await page.click('#create-btn');
  await expect(page.locator('#output-section')).toBeVisible({ timeout: 60_000 });
  // The video was skipped; the PDF still built from the image alone.
  await expect(page.locator('#download-link')).toHaveAttribute('download', /\.pdf$/);
});

test('an all-video queue disables Combine and shows a hint', async ({ page }) => {
  await attachMedia(page, { video: true, ms: 1000 });
  await expect(page.locator('#create-btn')).toBeDisabled();
  await expect(page.locator('#combine-hint')).toBeVisible();
});

test('separate mode compresses video to MP4', async ({ page }) => {
  test.setTimeout(180_000);
  await attachMedia(page, { video: true, ms: 1500 });
  await page.click('.mode-btn[data-mode="separate"]');
  await expect(page.locator('#create-btn')).toBeEnabled();
  await page.click('#create-btn');
  await expect(page.locator('#output-section')).toBeVisible({ timeout: 150_000 });
  await expect(page.locator('#file-list a')).toHaveCount(1);
  await expect(page.locator('#file-list a').first()).toHaveAttribute('download', /-compressed\.mp4$/);
});
```

- [ ] **Step 2: Run the suite to confirm the new tests fail**

Run: `npx playwright test media-compress.spec.js`
Expected: FAIL — video files are currently rejected by `ACCEPTED` (dropped
silently, queue stays empty), `#combine-hint` and `.incompatible` don't
exist.

- [ ] **Step 3: Accept video input**

In `media-compress.html`, change:

```html
        <input type="file" id="file-input" accept=".jpg,.jpeg,.png,.webp,.pdf" multiple hidden>
```

to:

```html
        <input type="file" id="file-input" accept=".jpg,.jpeg,.png,.webp,.pdf,.mp4,.mov,.webm,.mkv,.avi" multiple hidden>
```

and change:

```html
        <p>Drop images or PDFs here</p>
```

to:

```html
        <p>Drop images, PDFs, or video here</p>
```

and change:

```js
        const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
```

to:

```js
        const ACCEPTED = new Set([
            'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
            'video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska', 'video/x-msvideo',
        ]);
```

- [ ] **Step 4: Read video duration on add, tag the item type**

In `media-compress.html`, change:

```js
        async function addFiles(files) {
            for (const file of files) {
                if (!ACCEPTED.has(file.type)) continue;
                const item = {
                    id: nextId++,
                    file,
                    type: file.type === 'application/pdf' ? 'pdf' : 'image',
                    name: file.name,
                    pageCount: null,
                    error: null,
                };
                queue.push(item);
                renderQueue();
                if (item.type === 'pdf') {
                    try {
                        const buf = await file.arrayBuffer();
                        const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
                        item.pageCount = doc.numPages;
                        doc.destroy();
                    } catch {
                        item.error = 'Failed to read PDF';
                    }
                    renderQueue();
                }
            }
        }
```

to:

```js
        function readVideoDuration(file) {
            return new Promise((res, rej) => {
                const url = URL.createObjectURL(file);
                const v = document.createElement('video');
                v.preload = 'metadata';
                v.onloadedmetadata = () => { URL.revokeObjectURL(url); res(v.duration); };
                v.onerror = () => { URL.revokeObjectURL(url); rej(new Error('metadata read failed')); };
                v.src = url;
            });
        }

        async function addFiles(files) {
            for (const file of files) {
                if (!ACCEPTED.has(file.type)) continue;
                const type = file.type === 'application/pdf' ? 'pdf'
                           : file.type.startsWith('video/') ? 'video'
                           : 'image';
                const item = {
                    id: nextId++,
                    file,
                    type,
                    name: file.name,
                    pageCount: null,
                    duration: null,
                    error: null,
                };
                queue.push(item);
                renderQueue();
                if (item.type === 'pdf') {
                    try {
                        const buf = await file.arrayBuffer();
                        const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
                        item.pageCount = doc.numPages;
                        doc.destroy();
                    } catch {
                        item.error = 'Failed to read PDF';
                    }
                    renderQueue();
                } else if (item.type === 'video') {
                    try {
                        item.duration = await readVideoDuration(file);
                    } catch {
                        item.error = 'Failed to read video';
                    }
                    renderQueue();
                }
            }
        }
```

- [ ] **Step 5: Add the incompatible-badge style and the video-warning element style**

In `media-compress.html`, change:

```css
        #queue-list li .err { color: #dc2626; font-size: 0.8rem; }
```

to:

```css
        #queue-list li .err { color: #dc2626; font-size: 0.8rem; }
        #queue-list li .incompatible { color: #9ca3af; font-size: 0.8rem; font-style: italic; }
```

and change:

```css
        #memory-warning {
```

to:

```css
        #memory-warning, #video-warning {
```

- [ ] **Step 6: Add the combine-hint and video-warning markup**

In `media-compress.html`, change:

```html
        <button id="create-btn" type="button">Create PDF</button>
        <div id="memory-warning" hidden>Large document (&gt;40 pages) — may be slow on mobile.</div>
        <div id="status-msg" hidden></div>
```

to:

```html
        <p id="combine-hint" class="limitation-notice" hidden>All queued files are video — switch to "Compress separately" to process them.</p>
        <button id="create-btn" type="button">Create PDF</button>
        <div id="memory-warning" hidden>Large document (&gt;40 pages) — may be slow on mobile.</div>
        <div id="video-warning" hidden>Large video (&gt;200 MB) — encoding in the browser may be slow and memory-heavy.</div>
        <div id="status-msg" hidden></div>
```

- [ ] **Step 7: Wire up the new DOM refs**

In `media-compress.html`, change:

```js
        const memWarn       = document.getElementById('memory-warning');
```

to:

```js
        const memWarn       = document.getElementById('memory-warning');
        const videoWarn     = document.getElementById('video-warning');
        const combineHint   = document.getElementById('combine-hint');
```

- [ ] **Step 8: Render video items, the incompatible badge, the video warning, and drive Create's disabled state**

In `media-compress.html`, change:

```js
            const pages = totalPages();
            pageCountSum.textContent = `(${queue.length} file${queue.length !== 1 ? 's' : ''}, ~${pages} page${pages !== 1 ? 's' : ''})`;
            memWarn.hidden = pages <= 40;

            imageFormatSelector.hidden = !(activeMode === 'separate' && queue.some(x => x.type === 'image'));

            queueList.innerHTML = '';
            queue.forEach((item, i) => {
                const li = document.createElement('li');
                const icon = item.type === 'pdf' ? '📄' : '🖼';
                const meta = item.error
                    ? `<span class="err">${item.error}</span>`
                    : item.type === 'pdf'
                        ? `<span class="meta">${item.pageCount != null ? item.pageCount + ' page' + (item.pageCount !== 1 ? 's' : '') : 'loading…'}</span>`
                        : `<span class="meta">image</span>`;
                li.innerHTML = `
                    <span>${icon}</span>
                    <span class="name" title="${item.name}">${item.name}</span>
                    ${meta}
                    <button class="queue-btn" data-action="up" data-id="${item.id}" ${i === 0 ? 'disabled' : ''}>↑</button>
                    <button class="queue-btn" data-action="down" data-id="${item.id}" ${i === queue.length - 1 ? 'disabled' : ''}>↓</button>
                    <button class="queue-btn remove" data-action="remove" data-id="${item.id}">✕</button>
                `;
                queueList.appendChild(li);
            });
        }
```

to:

```js
            const pages = totalPages();
            pageCountSum.textContent = `(${queue.length} file${queue.length !== 1 ? 's' : ''}, ~${pages} page${pages !== 1 ? 's' : ''})`;
            memWarn.hidden = pages <= 40;
            videoWarn.hidden = totalVideoBytes() <= 200 * 1024 * 1024;

            imageFormatSelector.hidden = !(activeMode === 'separate' && queue.some(x => x.type === 'image'));

            queueList.innerHTML = '';
            queue.forEach((item, i) => {
                const li = document.createElement('li');
                const icon = item.type === 'pdf' ? '📄' : item.type === 'video' ? '🎬' : '🖼';
                const incompatible = activeMode === 'combined' && item.type === 'video';
                let meta;
                if (incompatible) {
                    meta = `<span class="incompatible">can't combine — switch to Compress separately</span>`;
                } else if (item.error) {
                    meta = `<span class="err">${item.error}</span>`;
                } else if (item.type === 'pdf') {
                    meta = `<span class="meta">${item.pageCount != null ? item.pageCount + ' page' + (item.pageCount !== 1 ? 's' : '') : 'loading…'}</span>`;
                } else if (item.type === 'video') {
                    meta = `<span class="meta">${item.duration != null ? Math.round(item.duration) + 's' : 'loading…'}</span>`;
                } else {
                    meta = `<span class="meta">image</span>`;
                }
                li.innerHTML = `
                    <span>${icon}</span>
                    <span class="name" title="${item.name}">${item.name}</span>
                    ${meta}
                    <button class="queue-btn" data-action="up" data-id="${item.id}" ${i === 0 ? 'disabled' : ''}>↑</button>
                    <button class="queue-btn" data-action="down" data-id="${item.id}" ${i === queue.length - 1 ? 'disabled' : ''}>↓</button>
                    <button class="queue-btn remove" data-action="remove" data-id="${item.id}">✕</button>
                `;
                queueList.appendChild(li);
            });

            updateCreateBtnState();
        }

        function totalVideoBytes() {
            return queue.filter(x => x.type === 'video').reduce((n, x) => n + x.file.size, 0);
        }

        function eligibleItems() {
            return activeMode === 'combined'
                ? queue.filter(x => !x.error && x.type !== 'video')
                : queue.filter(x => !x.error);
        }

        function updateCreateBtnState() {
            const hasEligible = eligibleItems().length > 0;
            createBtn.disabled = !hasEligible;
            combineHint.hidden = !(activeMode === 'combined' && queue.length > 0 && !hasEligible);
        }
```

- [ ] **Step 9: Use `eligibleItems()` in the create handler and restore state via `updateCreateBtnState()` when done**

In `media-compress.html`, change:

```js
        createBtn.addEventListener('click', async () => {
            const valid = queue.filter(x => !x.error);
            if (valid.length === 0) return;
```

to:

```js
        createBtn.addEventListener('click', async () => {
            const valid = eligibleItems();
            if (valid.length === 0) return;
```

and change:

```js
            } catch (err) {
                statusMsg.textContent = `Error: ${err.message}`;
            } finally {
                createBtn.disabled = false;
            }
        });
```

to:

```js
            } catch (err) {
                statusMsg.textContent = `Error: ${err.message}`;
                // A wasm trap leaves the ffmpeg instance unusable; drop it so
                // the next attempt starts from a fresh engine.
                resetFFmpeg();
            } finally {
                updateCreateBtnState();
            }
        });
```

- [ ] **Step 10: Load ffmpeg.wasm**

In `media-compress.html`, change:

```html
    <script src="https://unpkg.com/jszip@3.10.1/dist/jszip.min.js"></script>
    <script src="https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js"></script>
    <script src="handoff.js"></script>
    <script type="module">
```

to:

```html
    <script src="https://unpkg.com/jszip@3.10.1/dist/jszip.min.js"></script>
    <script src="https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js"></script>
    <script src="https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/umd/ffmpeg.js"></script>
    <script src="https://unpkg.com/@ffmpeg/util@0.12.1/dist/umd/index.js"></script>
    <script src="handoff.js"></script>
    <script type="module">
```

- [ ] **Step 11: Add the ffmpeg loading/crash-recovery pattern and `compressVideo`**

In `media-compress.html`, change:

```js
        function compressedName(originalName, ext = '.pdf') {
```

to:

```js
        // Same loading/crash-recovery pattern as media-clip.html: the worker
        // chunk is the UMD build, the core must be the ESM build so the module
        // worker can `import()` it. Blob URLs are cached so recovering from a
        // crash re-instantiates without re-downloading.
        const FF_UMD   = 'https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/umd';
        const CORE_ESM = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
        let ffmpeg = null;
        let coreBlobs = null;

        async function ensureFFmpeg() {
            if (ffmpeg) return ffmpeg;
            const { FFmpeg } = FFmpegWASM;
            const { toBlobURL } = FFmpegUtil;
            if (!coreBlobs) {
                statusMsg.textContent = 'Loading video engine (~32 MB, first time only)…';
                coreBlobs = {
                    classWorkerURL: await toBlobURL(`${FF_UMD}/814.ffmpeg.js`, 'text/javascript'),
                    coreURL: await toBlobURL(`${CORE_ESM}/ffmpeg-core.js`, 'text/javascript'),
                    wasmURL: await toBlobURL(`${CORE_ESM}/ffmpeg-core.wasm`, 'application/wasm'),
                };
            }
            const ff = new FFmpeg();
            ff.on('progress', ({ progress }) => {
                if (progress >= 0 && progress <= 1) {
                    statusMsg.textContent = `Encoding… ${Math.round(progress * 100)}%`;
                }
            });
            await ff.load(coreBlobs);
            ffmpeg = ff;
            return ffmpeg;
        }

        function resetFFmpeg() {
            try { ffmpeg && ffmpeg.terminate(); } catch {}
            ffmpeg = null;
        }

        const VIDEO_QUALITY = {
            low:    { crf: 30, scale: '-2:480' },
            medium: { crf: 26, scale: '-2:720' },
            high:   { crf: 21, scale: null },
        };

        async function compressVideo(item, level) {
            const { fetchFile } = FFmpegUtil;
            const vq = VIDEO_QUALITY[level];
            const ff = await ensureFFmpeg();
            const inName = 'in' + item.id + (item.name.match(/\.[a-z0-9]+$/i)?.[0] || '.bin');
            const outName = 'out' + item.id + '.mp4';
            await ff.writeFile(inName, await fetchFile(item.file));
            const args = ['-i', inName, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(vq.crf),
                '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '128k'];
            if (vq.scale) args.push('-vf', `scale=${vq.scale}`);
            args.push(outName);
            await ff.exec(args);
            const data = await ff.readFile(outName);
            try { await ff.deleteFile(inName); await ff.deleteFile(outName); } catch {}
            return new Uint8Array(data.buffer);
        }

        function compressedName(originalName, ext = '.pdf') {
```

- [ ] **Step 12: Add the video branch to `processItemSeparate`**

In `media-compress.html`, change:

```js
        async function processItemSeparate(item, cfg, level, imageFormat) {
            const { PDFDocument } = window.PDFLib;
            if (item.type === 'pdf' || (item.type === 'image' && imageFormat === 'pdf')) {
```

to:

```js
        async function processItemSeparate(item, cfg, level, imageFormat) {
            if (item.type === 'video') {
                const bytes = await compressVideo(item, level);
                return { name: compressedName(item.name, '.mp4'), bytes, mime: 'video/mp4', kind: 'video' };
            }
            const { PDFDocument } = window.PDFLib;
            if (item.type === 'pdf' || (item.type === 'image' && imageFormat === 'pdf')) {
```

- [ ] **Step 13: Add `video` to the handoff receive map**

In `media-compress.html`, change:

```js
        WFHandoff.receive({
            image: f => addFiles([f]),
            pdf:   f => addFiles([f]),
        });
```

to:

```js
        WFHandoff.receive({
            image: f => addFiles([f]),
            pdf:   f => addFiles([f]),
            video: f => addFiles([f]),
        });
```

- [ ] **Step 14: Register video with the handoff tool and fix the affected test**

In `handoff.js`, change:

```js
    { file: 'media-compress.html', name: 'Media Compressor', accepts: ['image', 'pdf'] },
```

to:

```js
    { file: 'media-compress.html', name: 'Media Compressor', accepts: ['image', 'pdf', 'video'] },
```

In `tests/handoff.spec.js`, change:

```js
  // A video output (e.g. its own MP4) can only be trimmed in the Clipper.
  expect(await targetsFor(page, 'video', 'video/mp4')).toEqual(['Media Clipper']);
```

to:

```js
  // A video output (e.g. its own MP4) can go to the Clipper or Media Compressor.
  expect(await targetsFor(page, 'video', 'video/mp4')).toEqual(['Media Clipper', 'Media Compressor']);
```

- [ ] **Step 15: Run the media-compress and handoff suites**

Run: `npx playwright test media-compress.spec.js handoff.spec.js`
Expected: PASS (11 tests in media-compress.spec.js, 5 in handoff.spec.js)

- [ ] **Step 16: Run the full suite**

Run: `npx playwright test`
Expected: PASS (no regressions in `audio-merge.spec.js`, `audio-video.spec.js`,
`media-clip.spec.js`, `yt-audio.spec.js`)

- [ ] **Step 17: Commit**

```bash
git add media-compress.html handoff.js tests/handoff.spec.js tests/media-compress.spec.js
git commit -m "feat(media-compressor): compress video via ffmpeg.wasm

Video files are now accepted, shown with duration in the queue, and
compressed to MP4 (H.264/AAC, quality-mapped CRF+scale) in Compress
separately mode. They're excluded from Combine (greyed badge in the
queue; Create is disabled with a hint if the whole queue is video).
Adds a >200 MB video-size memory warning alongside the existing
page-count one, and registers video with the handoff ('Send to')
system."
```

---

## Post-plan verification (not a task — final sanity pass)

- [ ] Run `npx playwright test` once more from a clean state and confirm all
  specs pass.
- [ ] Open `media-compress.html` in a real browser (via `npx serve .` or
  similar) and manually run: an image → WEBP in Separate mode, a PDF →
  recompressed PDF in Combine mode, and a short screen recording → MP4 in
  Separate mode, confirming file sizes and the "Send to" menu render
  sensibly.
