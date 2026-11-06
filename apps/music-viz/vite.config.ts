import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Built into the static tools site: tools.wisefowl.org/music-viz/
// The Pages deploy has no build step, so the built output is committed.
export default defineConfig({
  base: '/music-viz/',
  plugins: [react()],
  build: {
    outDir: '../../music-viz',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
  },
});
