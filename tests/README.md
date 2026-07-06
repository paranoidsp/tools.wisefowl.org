# Tests

End-to-end tests for the tools, one spec per tool, driven by
[Playwright](https://playwright.dev). Each spec loads the real `.html` file in a
browser and exercises it exactly as shipped.

## Running

```sh
npm install            # once
npm run setup          # once — downloads the Playwright Chromium build
npm test               # run everything
npm test media-clip    # run one tool's spec
npm run test:headed    # watch it in a real browser window
```

## How it stays hermetic

The tools load their libraries (pdf-lib, JSZip, pdf.js, ffmpeg.wasm) from public
CDNs. The tool HTML is **never modified** for tests. Instead
`tests/helpers/fixtures.js` intercepts every request to unpkg / jsdelivr / cdnjs
and serves it from the matching package in `node_modules`. So:

- the versions in `package.json` must match the CDN versions pinned in the tool
  HTML — bump them together;
- the suite needs **no network access** and runs offline / in CI.

Test inputs (images, PDFs, audio/video) are generated in the browser at runtime
(`tests/helpers/gen.js`) via canvas, `pdf-lib`, and `MediaRecorder` — there are
no binary fixtures to check in.

## Adding a tool

Create `tests/<tool>.spec.js`, `require('./helpers/fixtures')` for `test` /
`expect`, and add its CDN library versions to `package.json` so the routing can
resolve them. See the existing specs for the pattern.

## Notes

- Tests run serially (`workers: 1`) with long timeouts — ffmpeg.wasm work is
  heavy. This is expected.
- `PW_CHROMIUM=/path/to/chrome` overrides the browser binary (used in sandboxes
  that ship their own Chromium); normally leave it unset.
