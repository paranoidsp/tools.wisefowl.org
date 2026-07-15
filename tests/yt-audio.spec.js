const { test, expect } = require('./helpers/fixtures');

// The capture path (getDisplayMedia tab-audio recording) can't run headlessly —
// it needs a real user picking a tab and ticking "Share tab audio", plus a real
// YouTube stream playing in real time. So this spec covers the deterministic UI:
// browser-support gating, URL parsing, progressive disclosure, and the
// format/quality selectors. The recording+transcode flow is verified manually
// (see the plan's verification steps).

// Stub the YouTube IFrame API so loading a URL doesn't touch the network and a
// fake player becomes "ready" immediately.
const YT_STUB = `
  window.YT = { Player: function (el, opts) {
    this.getVideoData = () => ({ title: 'Test Video' });
    this.seekTo = () => {}; this.playVideo = () => {}; this.pauseVideo = () => {};
    this.unMute = () => {}; this.setVolume = () => {};
    this.getCurrentTime = () => 0; this.getDuration = () => 0;
    if (opts && opts.events && opts.events.onReady) setTimeout(() => opts.events.onReady({ target: this }), 0);
  }};
  if (window.onYouTubeIframeAPIReady) window.onYouTubeIframeAPIReady();
`;

test.beforeEach(async ({ page }) => {
  await page.route(/youtube\.com\/(?:iframe_api|s\/player)/, route =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: YT_STUB }));
});

test('shows the tool on a supported (Chromium) browser', async ({ page }) => {
  await page.goto('/yt-audio.html');
  await expect(page.locator('#tool')).toBeVisible();
  await expect(page.locator('#unsupported')).toBeHidden();
  // Nothing is revealed until a URL is loaded.
  await expect(page.locator('#stage')).toBeHidden();
});

test('rejects a non-YouTube URL', async ({ page }) => {
  await page.goto('/yt-audio.html');
  await page.fill('#url-input', 'https://example.com/not-a-video');
  await page.click('#load-btn');
  await expect(page.locator('#load-error')).toBeVisible();
  await expect(page.locator('#stage')).toBeHidden();
});

test('loads a valid link and reveals the options', async ({ page }) => {
  await page.goto('/yt-audio.html');
  await page.fill('#url-input', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await page.click('#load-btn');
  await expect(page.locator('#stage')).toBeVisible();
  await expect(page.locator('#load-error')).toBeHidden();
  // Six audio formats, MP3 selected first.
  await expect(page.locator('#format-selector .opt-btn')).toHaveCount(6);
  await expect(page.locator('#format-selector .opt-btn.active')).toHaveText('MP3');
  await expect(page.locator('#capture-btn')).toBeVisible();
});

test('also parses youtu.be and /shorts/ links', async ({ page }) => {
  await page.goto('/yt-audio.html');
  await page.fill('#url-input', 'https://youtu.be/dQw4w9WgXcQ');
  await page.click('#load-btn');
  await expect(page.locator('#stage')).toBeVisible();

  await page.fill('#url-input', 'https://www.youtube.com/shorts/dQw4w9WgXcQ');
  await page.click('#load-btn');
  await expect(page.locator('#load-error')).toBeHidden();
  await expect(page.locator('#stage')).toBeVisible();
});

test('quality selector shows for lossy formats and hides for lossless', async ({ page }) => {
  await page.goto('/yt-audio.html');
  await page.fill('#url-input', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await page.click('#load-btn');

  // MP3 is lossy → Quality visible.
  await expect(page.locator('#bitrate-field')).toBeVisible();
  // FLAC is lossless → Quality hidden.
  await page.click('#format-selector .opt-btn[data-fmt="flac"]');
  await expect(page.locator('#format-selector .opt-btn.active')).toHaveText('FLAC');
  await expect(page.locator('#bitrate-field')).toBeHidden();
  // WAV also lossless.
  await page.click('#format-selector .opt-btn[data-fmt="wav"]');
  await expect(page.locator('#bitrate-field')).toBeHidden();
  // Back to a lossy format → Quality returns.
  await page.click('#format-selector .opt-btn[data-fmt="m4a"]');
  await expect(page.locator('#bitrate-field')).toBeVisible();
});

test('quality buttons toggle the active selection', async ({ page }) => {
  await page.goto('/yt-audio.html');
  await page.fill('#url-input', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await page.click('#load-btn');

  await expect(page.locator('#bitrate-selector .opt-btn.active')).toHaveText('Medium');
  await page.click('#bitrate-selector .opt-btn[data-br="256k"]');
  await expect(page.locator('#bitrate-selector .opt-btn.active')).toHaveText('High');
});

test('offers a manual new-tab fallback', async ({ page }) => {
  await page.goto('/yt-audio.html');
  await page.fill('#url-input', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await page.click('#load-btn');

  await expect(page.locator('#manual-block')).toBeHidden();
  await page.click('#switch-manual');
  await expect(page.locator('#manual-block')).toBeVisible();
  await expect(page.locator('#open-tab')).toHaveAttribute('href', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await expect(page.locator('#capture-btn')).toHaveText('Start capture');
});

test('shows the unsupported notice when tab capture is unavailable', async ({ page }) => {
  // Simulate a browser without getDisplayMedia (Firefox/mobile behave this way).
  await page.addInitScript(() => {
    try {
      if (navigator.mediaDevices) {
        Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { configurable: true, value: undefined });
      }
    } catch (e) {}
  });
  await page.goto('/yt-audio.html');
  await expect(page.locator('#unsupported')).toBeVisible();
  await expect(page.locator('#tool')).toBeHidden();
});
