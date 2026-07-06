const { defineConfig, devices } = require('@playwright/test');

// The tools do real work in the browser (pdf-lib, JSZip, ffmpeg.wasm), so tests
// are slower and heavier than a typical web app — run serially with generous
// timeouts. CDN dependencies are served from node_modules by tests/helpers/
// fixtures.js, so no network access is required.
module.exports = defineConfig({
  testDir: './tests',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: 'http://localhost:8123',
    launchOptions: {
      // executablePath lets the sandbox point at a preinstalled Chromium; on a
      // normal machine it's undefined and Playwright uses its managed browser.
      executablePath: process.env.PW_CHROMIUM || undefined,
      args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
    },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'node tests/helpers/static-server.js',
    url: 'http://localhost:8123/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
