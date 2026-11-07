import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Built into the static tools site: tools.wisefowl.org/music-viz/
// Built by `npm run build` at the repo root (scripts/build.mjs) on Cloudflare Pages.
export default defineConfig({
  base: '/music-viz/',
  plugins: [react()],
  build: {
    outDir: '../../music-viz',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
  },
});
