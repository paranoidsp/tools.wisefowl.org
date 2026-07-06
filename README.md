---
created: '2026-03-04 16:34:30'
updated: '2026-03-04 16:34:30'
creators:
- human-legacy
type: note
status: draft
---# tools.wisefowl.org

A collection of browser-based tools and experiments, hosted at [tools.wisefowl.org](https://tools.wisefowl.org).

Inspired by [Simon Willison's tools](https://tools.simonwillison.net) — a wonderful example of a simple, static tools directory built with AI assistance.

## How it works

- Plain HTML/CSS/JS — no build step, no framework
- Each tool is a standalone `.html` file in the root
- Private experiments live in `/private/`, gated by Cloudflare Zero Trust (`@wisefowl.org` only)
- Deployed via Cloudflare Pages (auto-deploys on push)

## Adding a new tool

1. Create `tool-name.html` in the root (or `private/tool-name.html` for auth-gated tools)
2. Link `style.css` for shared styles, or use inline styles. Follow [`DESIGN.md`](DESIGN.md) so it matches the other tools.
3. Add an entry to `index.html`:
   ```html
   <li><a href="tool-name.html">Tool Name</a> <span class="tool-desc">— What it does.</span></li>
   ```
4. Add a `tests/tool-name.spec.js` (see [Testing](#testing))
5. Commit and push — Cloudflare Pages will auto-deploy

## Commit convention

One tool per commit. Use conventional commits with the tool name as scope:

```
feat(pdf-compressor): add separate PDFs mode
fix(pdf-compressor): correct filename encoding for unicode
chore(site): update index page links
```

The changelog page parses the scope and shows it as a tool badge.

## Testing

Each tool has an end-to-end [Playwright](https://playwright.dev) spec under
`tests/` that drives the real `.html` in a browser. CDN libraries are served
from `node_modules` during tests, so the suite runs offline and the shipped HTML
is never modified. See [`tests/README.md`](tests/README.md) for details.

```sh
npm install && npm run setup   # once
npm test                       # run all specs
```

CI runs the suite on every push and pull request
(`.github/workflows/test.yml`). These dev dependencies never reach the deployed
site — Cloudflare Pages only serves the static files.

## Deploy

- **Platform**: Cloudflare Pages
- **Build command**: (none)
- **Output directory**: `/`
- **Custom domain**: `tools.wisefowl.org`

## Auth

- `tools.wisefowl.org/*` — public
- Private experiments → separate site at [`private.tools.wisefowl.org`](https://private.tools.wisefowl.org), repo `paranoidsp/private.tools.wisefowl.org`

