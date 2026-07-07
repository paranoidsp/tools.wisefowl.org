const { test, expect } = require('./helpers/fixtures');
const { attachMedia } = require('./helpers/gen');

// Add one audio file (recorded webm) to the queue. addFiles() appends, so
// calling this repeatedly with different names builds up a multi-file queue.
async function addAudio(page, name, ms = 2000) {
  await attachMedia(page, { video: false, ms, name, type: '' });
}

// Click the format button whose label matches, then merge and wait for a
// finished output (output section) or a surfaced error.
async function merge(page, label) {
  if (label) {
    await page.evaluate((lbl) => {
      [...document.querySelectorAll('#format-selector .opt-btn')]
        .find((b) => b.textContent.trim() === lbl).click();
    }, label);
  }
  await page.click('#merge-btn');
  await page.waitForFunction(() => {
    const status = document.getElementById('status-msg');
    if (!status.hidden && /Error|memory/i.test(status.textContent)) return true;
    return !document.getElementById('output-section').hidden;
  }, { timeout: 120_000 });
  const status = await page.locator('#status-msg').textContent();
  if (/Error|memory/i.test(status) && !(await page.locator('#status-msg').isHidden())) {
    throw new Error('merge failed: ' + status);
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto('/audio-merge.html');
  await expect(page.locator('#drop-zone')).toBeVisible();
});

test('queues added audio files in order', async ({ page }) => {
  await addAudio(page, 'first.webm');
  await addAudio(page, 'second.webm');
  await expect(page.locator('#queue-section')).toBeVisible();
  await expect(page.locator('#queue-list li')).toHaveCount(2);
  await expect(page.locator('#queue-list li .name').first()).toHaveText('first.webm');
  await expect(page.locator('#merge-btn')).toHaveText(/Merge 2 files/);
});

test('offers every audio output format and a quality selector', async ({ page }) => {
  await addAudio(page, 'a.webm');
  const labels = await page.locator('#format-selector .opt-btn').allTextContents();
  expect(labels.map((s) => s.trim())).toEqual(['MP3', 'M4A', 'AAC', 'OGG', 'FLAC', 'WAV']);
  await expect(page.locator('#bitrate-field')).toBeVisible();

  // Lossless formats hide the quality selector.
  await page.evaluate(() => [...document.querySelectorAll('#format-selector .opt-btn')]
    .find((b) => b.textContent.trim() === 'FLAC').click());
  await expect(page.locator('#bitrate-field')).toBeHidden();
});

test('reorder and remove change the queue', async ({ page }) => {
  await addAudio(page, 'one.webm');
  await addAudio(page, 'two.webm');
  await addAudio(page, 'three.webm');

  // Move the last file (three) up to the top, one step at a time.
  await page.click('#queue-list li:last-child .queue-btn[data-action="up"]');
  await expect(page.locator('#queue-list li:nth-child(2) .name')).toHaveText('three.webm');
  await page.click('#queue-list li:nth-child(2) .queue-btn[data-action="up"]');
  await expect(page.locator('#queue-list li .name').first()).toHaveText('three.webm');

  // Remove the middle file.
  await page.click('#queue-list li:nth-child(2) .queue-btn[data-action="remove"]');
  await expect(page.locator('#queue-list li')).toHaveCount(2);
});

test('skips non-audio files with a visible message', async ({ page }) => {
  await page.evaluate(() => {
    const file = new File([new Uint8Array([104, 105])], 'notes.txt', { type: 'text/plain' });
    const dt = new DataTransfer();
    dt.items.add(file);
    const input = document.getElementById('file-input');
    input.files = dt.files;
    input.dispatchEvent(new Event('change'));
  });
  await expect(page.locator('#load-error')).toContainText(/audio/i);
  await expect(page.locator('#queue-section')).toBeHidden();
});

test('merges two files into one whose duration is their sum', async ({ page }) => {
  await addAudio(page, 'clip-a.webm', 2000);
  await addAudio(page, 'clip-b.webm', 2000);

  await merge(page, 'MP3');
  await expect(page.locator('#download-link')).toHaveAttribute('download', /\.mp3$/);
  expect(await page.locator('#download-link').getAttribute('href')).toMatch(/^blob:/);
  await expect(page.locator('#output-audio')).toBeVisible();

  // The merged file should run ~4s (two ~2s inputs back to back).
  const dur = await page.evaluate(async () => {
    const a = new Audio();
    a.src = document.getElementById('download-link').href;
    await new Promise((res) => { a.onloadedmetadata = res; setTimeout(res, 3000); });
    if (!isFinite(a.duration)) {
      a.currentTime = 1e7;
      await new Promise((res) => { a.ontimeupdate = () => { a.ontimeupdate = null; res(); }; setTimeout(res, 1500); });
    }
    return a.duration;
  });
  expect(dur).toBeGreaterThan(3.0);
  expect(dur).toBeLessThan(5.0);
});

test('exports M4A as well as MP3', async ({ page }) => {
  await addAudio(page, 'a.webm');
  await addAudio(page, 'b.webm');
  await merge(page, 'M4A');
  await expect(page.locator('#download-link')).toHaveAttribute('download', /\.m4a$/);
  expect(await page.locator('#download-link').getAttribute('href')).toMatch(/^blob:/);
});

test('lets you rename the output before downloading', async ({ page }) => {
  await addAudio(page, 'a.webm');
  await addAudio(page, 'b.webm');
  await merge(page, 'MP3');

  await expect(page.locator('#filename-input')).toHaveValue('merged');
  await expect(page.locator('#filename-ext')).toHaveText('.mp3');
  const input = page.locator('#filename-input');
  const link = page.locator('#download-link');
  await expect(link).toHaveAttribute('download', 'merged.mp3');

  await input.fill('my mixtape');
  await expect(link).toHaveAttribute('download', 'my mixtape.mp3');

  // Illegal characters stripped, extension preserved, empty → default.
  await input.fill('a/b:c*d');
  await expect(link).toHaveAttribute('download', 'abcd.mp3');
  await input.fill('');
  await expect(link).toHaveAttribute('download', 'merged.mp3');
});
