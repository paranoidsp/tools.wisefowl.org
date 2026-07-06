const { test, expect } = require('./helpers/fixtures');
const { attachMedia, attachWav } = require('./helpers/gen');

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

async function attachRaw(page, name, type, bytes) {
  await page.evaluate(({ name, type, bytes }) => {
    const file = new File([new Uint8Array(bytes)], name, { type });
    const dt = new DataTransfer();
    dt.items.add(file);
    const input = document.getElementById('file-input');
    input.files = dt.files;
    input.dispatchEvent(new Event('change'));
  }, { name, type, bytes });
}

test('surfaces a visible error for a file it cannot decode (no silent failure)', async ({ page }) => {
  await page.goto('/media-clip.html');
  // Valid media extension, but the bytes are garbage the browser can't decode.
  await attachRaw(page, 'broken.mp4', '', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  await expect(page.locator('#load-error')).toBeVisible();
  await expect(page.locator('#editor')).toBeHidden();
});

test('rejects a non-media file with a visible message', async ({ page }) => {
  await page.goto('/media-clip.html');
  await attachRaw(page, 'notes.txt', 'text/plain', [104, 105]);
  await expect(page.locator('#load-error')).toContainText(/audio or video/i);
  await expect(page.locator('#editor')).toBeHidden();
});

test('accepts a file by extension when the MIME type is empty (.m4a)', async ({ page }) => {
  await page.goto('/media-clip.html');
  // Simulate an .m4a that the OS reports with no MIME type — it must not be rejected.
  await attachMedia(page, { video: false, ms: 2000, name: 'sound.m4a', type: '' });
  await page.waitForFunction(() => !document.getElementById('editor').hidden, { timeout: 30_000 });
  await expect(page.locator('#preview')).toHaveClass(/audio-mode/);
});

test.describe('video input', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/media-clip.html');
    await attachMedia(page, { video: true, ms: 2500 });
    await page.waitForFunction(() => !document.getElementById('editor').hidden);
  });

  test('shows video formats, audio-extraction options and a size selector', async ({ page }) => {
    const labels = await page.locator('#format-selector .opt-btn').allTextContents();
    expect(labels.map((s) => s.trim())).toEqual(['MP4', 'GIF', 'MP3', 'M4A', 'AAC', 'OGG', 'FLAC', 'WAV']);
    await expect(page.locator('#res-field')).toBeVisible();
    await expect(page.locator('#bitrate-field')).toBeHidden();
    await expect(page.locator('#format-hint')).toBeVisible();
  });

  test('audio-extraction formats reveal the quality selector', async ({ page }) => {
    await page.evaluate(() => [...document.querySelectorAll('#format-selector .opt-btn')]
      .find((b) => b.textContent.trim() === 'M4A').click());
    await expect(page.locator('#bitrate-field')).toBeVisible();
    await expect(page.locator('#res-field')).toBeHidden();
    await expect(page.locator('#fps-field')).toBeHidden();
  });

  test('exports MP4, GIF and MP3 (engine reused across clips)', async ({ page }) => {
    await clip(page, 'MP4');
    await expect(page.locator('#download-link')).toHaveAttribute('download', /\.mp4$/);
    await expect(page.locator('#output-preview')).toBeVisible();

    await clip(page, 'GIF');
    await expect(page.locator('#download-link')).toHaveAttribute('download', /\.gif$/);
    await expect(page.locator('#output-gif')).toBeVisible();

    await clip(page, 'MP3');
    await expect(page.locator('#download-link')).toHaveAttribute('download', /\.mp3$/);
    expect(await page.locator('#download-link').getAttribute('href')).toMatch(/^blob:/);
  });

  test('lets you rename the output before downloading', async ({ page }) => {
    await clip(page, 'MP3');
    await expect(page.locator('#filename-input')).toHaveValue(/-clip$/);
    await expect(page.locator('#filename-ext')).toHaveText('.mp3');
    const input = page.locator('#filename-input');
    const link = page.locator('#download-link');
    await expect(link).toHaveAttribute('download', /-clip\.mp3$/);

    await input.fill('my song');
    await expect(link).toHaveAttribute('download', 'my song.mp3');

    // Illegal characters stripped, extension preserved, empty → default.
    await input.fill('a/b:c');
    await expect(link).toHaveAttribute('download', 'abc.mp3');
    await input.fill('');
    await expect(link).toHaveAttribute('download', 'clip.mp3');
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

    await clip(page, 'MP3');
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

  test('shows every audio format and a quality selector', async ({ page }) => {
    await expect(page.locator('#preview')).toHaveClass(/audio-mode/);
    const labels = await page.locator('#format-selector .opt-btn').allTextContents();
    expect(labels.map((s) => s.trim())).toEqual(['MP3', 'M4A', 'AAC', 'OGG', 'FLAC', 'WAV']);
    await expect(page.locator('#bitrate-field')).toBeVisible();
    await expect(page.locator('#res-field')).toBeHidden();
    await expect(page.locator('#format-hint')).toBeHidden();
  });

  // One case per audio encoder — this fails loudly if a codec isn't actually
  // present in @ffmpeg/core, which is the real guard behind "support everything".
  for (const [label, ext] of [
    ['MP3', 'mp3'], ['M4A', 'm4a'], ['AAC', 'aac'],
    ['OGG', 'ogg'], ['FLAC', 'flac'], ['WAV', 'wav'],
  ]) {
    test(`exports ${label}`, async ({ page }) => {
      await clip(page, label);
      await expect(page.locator('#download-link')).toHaveAttribute('download', new RegExp(`\\.${ext}$`));
      expect(await page.locator('#download-link').getAttribute('href')).toMatch(/^blob:/);
    });
  }

  test('lossless formats hide the quality selector', async ({ page }) => {
    for (const label of ['FLAC', 'WAV']) {
      await page.evaluate((l) => [...document.querySelectorAll('#format-selector .opt-btn')]
        .find((b) => b.textContent.trim() === l).click(), label);
      await expect(page.locator('#bitrate-field')).toBeHidden();
    }
    await page.evaluate(() => [...document.querySelectorAll('#format-selector .opt-btn')]
      .find((b) => b.textContent.trim() === 'MP3').click());
    await expect(page.locator('#bitrate-field')).toBeVisible();
  });
});

// ?audioengine=webaudio forces the fallback that iPad Safari needs, so we can
// exercise it in Chromium: decode with Web Audio, build the editor without a
// working media element, and still clip via ffmpeg from the original bytes.
test.describe('web audio fallback', () => {
  test('decodes, builds the editor, and clips without the media element', async ({ page }) => {
    await page.goto('/media-clip.html?audioengine=webaudio');
    await attachWav(page, { name: 'tone.wav', type: 'audio/wav', seconds: 2 });
    await page.waitForFunction(() => !document.getElementById('editor').hidden, { timeout: 30_000 });

    // The media element is hidden (it couldn't play the file), but we still have
    // a real duration and audio format options.
    await expect(page.locator('#preview')).toBeHidden();
    await expect(page.locator('#t-end')).toHaveText('0:02.0');
    await expect(page.locator('#load-error')).toBeHidden();

    // Playing the selection through Web Audio must not throw.
    await page.click('#play-sel');

    // The clip is produced by ffmpeg from the original bytes, independent of preview.
    await clip(page, 'MP3');
    await expect(page.locator('#download-link')).toHaveAttribute('download', /\.mp3$/);
    expect(await page.locator('#download-link').getAttribute('href')).toMatch(/^blob:/);
  });
});
