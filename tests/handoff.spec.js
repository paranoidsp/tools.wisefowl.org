const { test, expect } = require('./helpers/fixtures');
const { attachMedia } = require('./helpers/gen');

// Render the "Send to" menu for a synthetic output and return the button labels.
async function targetsFor(page, kind, type) {
  return page.evaluate(({ kind, type }) => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    WFHandoff.showOpenIn(el, { blob: new Blob([new Uint8Array([1])], { type }), name: 'x', kind });
    return [...el.querySelectorAll('.oi-btn')].map((b) => b.textContent);
  }, { kind, type });
}

test('offers compatible targets and excludes the current tool', async ({ page }) => {
  // From Audio to Video, an audio output can go to the Clipper or Audio Merge,
  // but not back to Audio to Video itself.
  await page.goto('/audio-video.html');
  expect(await targetsFor(page, 'audio', 'audio/mpeg')).toEqual(['Media Clipper', 'Audio Merge']);

  // A video output (e.g. its own MP4) can go to the Clipper or Media Compressor.
  expect(await targetsFor(page, 'video', 'video/mp4')).toEqual(['Media Clipper', 'Media Compressor']);
});

test('an image output offers Audio to Video and Media Compressor', async ({ page }) => {
  await page.goto('/media-clip.html');
  expect(await targetsFor(page, 'image', 'image/gif')).toEqual(['Audio to Video', 'Media Compressor']);
});

test('ignores a stale record when the page was not opened via handoff', async ({ page }) => {
  // A record exists, but without ?handoff=1 the tool must not pick it up.
  await page.goto('/audio-merge.html');
  await page.evaluate(() => WFHandoff.put({ blob: new Blob([new Uint8Array([1])], { type: 'audio/mpeg' }), name: 'ghost.mp3', type: 'audio/mpeg', ts: Date.now() }));
  await page.goto('/audio-merge.html');
  await expect(page.locator('#queue-section')).toBeHidden();
});

test('hands a merged track from Audio Merge into Audio to Video', async ({ page }) => {
  await page.goto('/audio-merge.html');
  await attachMedia(page, { video: false, ms: 1500, name: 'a.webm', type: '' });
  await attachMedia(page, { video: false, ms: 1500, name: 'b.webm', type: '' });

  await page.click('#merge-btn');
  await expect(page.locator('#output-section')).toBeVisible({ timeout: 120_000 });

  // The output's "Send to" menu should list the audio-capable tools.
  const labels = await page.locator('#open-in .oi-btn').allTextContents();
  expect(labels).toEqual(['Media Clipper', 'Audio to Video']);

  // Follow the handoff into Audio to Video; the merged file lands in the audio slot.
  await page.click('#open-in .oi-btn:has-text("Audio to Video")');
  await page.waitForURL(/audio-video\.html/);
  await expect(page.locator('#audio-filled')).toBeVisible();
  await expect(page.locator('#audio-name')).toHaveText('merged.mp3');
  // With only the audio slot filled, Create is still disabled (needs an image too).
  await expect(page.locator('#make-btn')).toBeDisabled();
});
