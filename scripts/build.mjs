#!/usr/bin/env node
// Builds the deployable site into dist/ (Cloudflare Pages output dir).
//
// Most tools are plain static files with no build step; they're copied as-is.
// Apps under apps/<name>/ (e.g. Music Viz Studio) have their own package.json
// and are built with Vite into /<name>/ at the repo root (gitignored), which
// is then copied along with everything else. Building into the repo root also
// lets the Playwright suite serve them exactly as deployed.
import { execSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');

// Repo files that are dev-only and must never be served.
const EXCLUDE = new Set([
  '.git', '.github', '.gitignore', '.claude', '.wrangler', '.node-version',
  'node_modules', 'dist', 'apps', 'tests', 'docs', 'scripts',
  'test-results', 'playwright-report', 'playwright.config.js',
  'package.json', 'package-lock.json',
]);

const run = (cmd, cwd) => {
  console.log(`\n$ ${cmd}  (in ${cwd.replace(ROOT, '.') || '.'})`);
  execSync(cmd, { cwd, stdio: 'inherit' });
};

// 1. Build each app.
const appsDir = join(ROOT, 'apps');
for (const name of existsSync(appsDir) ? readdirSync(appsDir) : []) {
  const dir = join(appsDir, name);
  if (!existsSync(join(dir, 'package.json'))) continue;
  run(existsSync(join(dir, 'node_modules')) ? 'npm install --no-audit --no-fund' : 'npm ci --no-audit --no-fund', dir);
  run('npm run build', dir);
}

// 2. Assemble dist/.
rmSync(DIST, { recursive: true, force: true });
for (const entry of readdirSync(ROOT)) {
  if (EXCLUDE.has(entry) || entry.endsWith('.md')) continue;
  cpSync(join(ROOT, entry), join(DIST, entry), { recursive: true });
}
console.log(`\nSite assembled in dist/:`, readdirSync(DIST).join(', '));
