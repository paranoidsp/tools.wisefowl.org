// Extends Playwright's `test` so that every request the tools make to a public
// CDN (unpkg / jsdelivr / cdnjs) is transparently served from the matching
// package in node_modules. This keeps the suite HERMETIC: it runs with no
// network access (offline, CI) and the tool HTML is tested exactly as shipped —
// the production CDN URLs are never rewritten.
const base = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const NODE_MODULES = path.resolve(__dirname, '../../node_modules');

const MIME = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.cjs': 'text/javascript',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.map': 'application/json',
};

// https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/umd/ffmpeg.js -> @ffmpeg/ffmpeg/dist/umd/ffmpeg.js
// https://cdn.jsdelivr.net/npm/pdfjs-dist@4.9.155/build/pdf.min.mjs -> pdfjs-dist/build/pdf.min.mjs
function localPathFor(url) {
  const m = url.match(/^https?:\/\/[^/]+\/(?:npm\/)?(.+)$/);
  if (!m) return null;
  // Drop the @version from either a scoped (@scope/pkg@ver) or bare (pkg@ver) spec.
  const rest = m[1].replace(/^(@[^/]+\/[^@/]+|[^@/]+)@[^/]+\//, '$1/');
  return path.join(NODE_MODULES, rest);
}

exports.test = base.test.extend({
  context: async ({ context }, use) => {
    await context.route(/^https?:\/\/(?:[^/]*\.)?(unpkg\.com|jsdelivr\.net|cdnjs\.cloudflare\.com)\//, async (route) => {
      const url = route.request().url();
      const file = localPathFor(url);
      if (file && fs.existsSync(file)) {
        await route.fulfill({
          status: 200,
          headers: { 'access-control-allow-origin': '*' },
          contentType: MIME[path.extname(file)] || 'application/octet-stream',
          body: fs.readFileSync(file),
        });
      } else {
        // Surface unmapped deps loudly instead of silently hitting the network.
        console.warn('[fixtures] no local mapping for', url, '->', file);
        await route.fulfill({ status: 404, body: `unmapped CDN dependency: ${url}` });
      }
    });
    await use(context);
  },
});

exports.expect = base.expect;
