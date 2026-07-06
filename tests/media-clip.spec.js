const { test, expect } = require('./helpers/fixtures');
const { attachMedia } = require('./helpers/gen');

// Click the format button whose label matches, and wait for a finished clip
// (output section) or a surfaced error.
async function clip(page, label) {
  await page.evaluate((lbl) => {
    const btn = [...document.querySelectorAll('#format-selector .opt-btn')]
      .find((b) => b.textContent.trim() === lbl);
    btn.click();
  }, label);
  await page.click('#clip-btn');
  await page.waitForFunction(() => {
    const status = document.getElementById('status-msg');
    if (!status.hidden && /Error|memory/i.test(status.textContent)) return true;
    return !document.getElementById('output-section').hidden;
  }, { timeout: 120_000 });
  const status = await page.locator('#status-msg').textContent();
  if (/Error|memory/i.test(status) && !(await page.locator('#status-msg').isHidden())) {
    throw new Error('clip failed: ' + status);
  }
}

test.describe('video input', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/media-clip.html');
    await attachMedia(page, { video: true, ms: 2500 });
    await page.waitForFunction(() => !document.getElementById('editor').hidden);
  });

  test('shows video formats and a size selector', async ({ page }) => {
    const labels = await page.locator('#format-selector .opt-btn').allTextContents();
    expect(labels.map((s) => s.trim())).toEqual(['MP4', 'GIF', 'MP3 (audio)']);
    await expect(page.locator('#res-field')).toBeVisible();
    await expect(page.locator('#bitrate-field')).toBeHidden();
  });

  test('exports MP4, GIF and MP3 (engine reused across clips)', async ({ page }) => {
    await clip(page, 'MP4');
    await expect(page.locator('#download-link')).toHaveAttribute('download', /\.mp4$/);
    await expect(page.locator('#output-preview')).toBeVisible();

    await clip(page, 'GIF');
    await expect(page.locator('#download-link')).toHaveAttribute('download', /\.gif$/);
    await expect(page.locator('#output-gif')).toBeVisible();

    await clip(page, 'MP3 (audio)');
    await expect(page.locator('#download-link')).toHaveAttribute('download', /\.mp3$/);
    expect(await page.locator('#download-link').getAttribute('href')).toMatch(/^blob:/);
  });

  test('trims to the selected range', async ({ page }) => {
    // Select [1.0s, 2.0s] via the set-start / set-end buttons.
    await page.evaluate(async () => {
      const v = document.getElementById('preview');
      v.currentTime = 1.0; await new Promise((r) => setTimeout(r, 150));
      document.getElementById('set-start').click();
      v.currentTime = 2.0; await new Promise((r) => setTimeout(r, 150));
      document.getElementById('set-end').click();
    });
    await expect(page.locator('#t-start')).toHaveText('0:01.0');
    await expect(page.locator('#t-end')).toHaveText('0:02.0');

    await clip(page, 'MP3 (audio)');
    // Decode the output and confirm its real duration is ~1.0s.
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
    expect(dur).toBeGreaterThan(0.8);
    expect(dur).toBeLessThan(1.3);
  });
});

test.describe('audio input', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/media-clip.html');
    await attachMedia(page, { video: false, ms: 2500 });
    await page.waitForFunction(() => !document.getElementById('editor').hidden);
  });

  test('shows audio formats and a quality selector', async ({ page }) => {
    await expect(page.locator('#preview')).toHaveClass(/audio-mode/);
    const labels = await page.locator('#format-selector .opt-btn').allTextContents();
    expect(labels.map((s) => s.trim())).toEqual(['MP3 (audio)', 'M4A', 'WAV']);
    await expect(page.locator('#bitrate-field')).toBeVisible();
    await expect(page.locator('#res-field')).toBeHidden();
  });

  test('exports WAV and M4A', async ({ page }) => {
    await clip(page, 'WAV');
    await expect(page.locator('#download-link')).toHaveAttribute('download', /\.wav$/);

    await clip(page, 'M4A');
    await expect(page.locator('#download-link')).toHaveAttribute('download', /\.m4a$/);
    expect(await page.locator('#download-link').getAttribute('href')).toMatch(/^blob:/);
  });
});
