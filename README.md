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
2. Link `style.css` for shared styles, or use inline styles
3. Add an entry to `index.html` (or `private/index.html`):
   ```html
   <li><a href="tool-name.html">Tool Name</a> <span class="tool-desc">— What it does.</span></li>
   ```
4. Commit and push — Cloudflare Pages will auto-deploy
5. Optionally add a development history entry to `history.html`

## Deploy

- **Platform**: Cloudflare Pages
- **Build command**: (none)
- **Output directory**: `/`
- **Custom domain**: `tools.wisefowl.org`

## Auth

- `tools.wisefowl.org/*` — public
- Private experiments → separate site at [`private.tools.wisefowl.org`](https://private.tools.wisefowl.org), repo `paranoidsp/private.tools.wisefowl.org`

