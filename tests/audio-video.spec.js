const { test, expect } = require('./helpers/fixtures');
const { attachImages, attachMedia } = require('./helpers/gen');

test.beforeEach(async ({ page }) => {
  await page.goto('/audio-video.html');
  await expect(page.locator('#image-slot')).toBeVisible();
});

test('reveals options once a file is added and enables Create only with both', async ({ page }) => {
  await expect(page.locator('#options')).toBeHidden();

  await attachImages(page, 1, '#image-input');
  await expect(page.locator('#image-filled')).toBeVisible();
  await expect(page.locator('#options')).toBeVisible();
  // One slot filled is not enough to create.
  await expect(page.locator('#make-btn')).toBeDisabled();

  await attachMedia(page, { video: false, ms: 1500, name: 'track.webm', type: '', inputSel: '#audio-input' });
  await expect(page.locator('#audio-filled')).toBeVisible();
  await expect(page.locator('#make-btn')).toBeEnabled();
});

test('rejects a non-image in the image slot with a message', async ({ page }) => {
  await page.evaluate(() => {
    const file = new File([new Uint8Array([104, 105])], 'notes.txt', { type: 'text/plain' });
    const dt = new DataTransfer();
    dt.items.add(file);
    const input = document.getElementById('image-input');
    input.files = dt.files;
    input.dispatchEvent(new Event('change'));
  });
  await expect(page.locator('#load-error')).toContainText(/image/i);
  await expect(page.locator('#image-filled')).toBeHidden();
});

test('makes an MP4 whose duration matches the audio', async ({ page }) => {
  await attachImages(page, 1, '#image-input');
  await attachMedia(page, { video: false, ms: 2000, name: 'song.webm', type: '', inputSel: '#audio-input' });
  await expect(page.locator('#make-btn')).toBeEnabled();

  await page.click('#make-btn');
  await page.waitForFunction(() => {
    const s = document.getElementById('status-msg');
    if (!s.hidden && /Error|memory/i.test(s.textContent)) return true;
    return !document.getElementById('output-section').hidden;
  }, { timeout: 120_000 });
  const status = await page.locator('#status-msg').textContent();
  if (/Error|memory/i.test(status) && !(await page.locator('#status-msg').isHidden())) {
    throw new Error('encode failed: ' + status);
  }

  await expect(page.locator('#download-link')).toHaveAttribute('download', /\.mp4$/);
  expect(await page.locator('#download-link').getAttribute('href')).toMatch(/^blob:/);
  await expect(page.locator('#output-video')).toBeVisible();

  // Read the real duration from the MP4's `mvhd` box (movie header:
  // timescale + duration). Parsing the container is deterministic — headless
  // Chromium won't reliably report .duration for a looped-still MP4.
  const dur = await page.evaluate(async () => {
    const buf = new Uint8Array(await (await fetch(document.getElementById('download-link').href)).arrayBuffer());
    const dv = new DataView(buf.buffer);
    let i = -1;
    for (let p = 0; p < buf.length - 4; p++) {
      if (buf[p] === 0x6d && buf[p + 1] === 0x76 && buf[p + 2] === 0x68 && buf[p + 3] === 0x64) { i = p; break; }
    }
    if (i < 0) return null;               // no mvhd found
    const version = buf[i + 4];           // version(1) + flags(3), content at i+8
    if (version === 1) {
      return Number(dv.getBigUint64(i + 28)) / dv.getUint32(i + 24);
    }
    return dv.getUint32(i + 20) / dv.getUint32(i + 16);
  });
  expect(dur).toBeGreaterThan(1.4);
  expect(dur).toBeLessThan(3.0);
});

test('names the output after the audio and lets you rename it', async ({ page }) => {
  await attachImages(page, 1, '#image-input');
  await attachMedia(page, { video: false, ms: 1500, name: 'my song.webm', type: '', inputSel: '#audio-input' });
  await page.click('#make-btn');
  await expect(page.locator('#output-section')).toBeVisible({ timeout: 120_000 });

  await expect(page.locator('#filename-input')).toHaveValue('my song');
  await expect(page.locator('#filename-ext')).toHaveText('.mp4');
  const link = page.locator('#download-link');
  await expect(link).toHaveAttribute('download', 'my song.mp4');

  await page.locator('#filename-input').fill('a/b:c*d');
  await expect(link).toHaveAttribute('download', 'abcd.mp4');
  await page.locator('#filename-input').fill('');
  await expect(link).toHaveAttribute('download', 'video.mp4');
});
