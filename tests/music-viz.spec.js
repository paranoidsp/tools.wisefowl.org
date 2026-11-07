// Smoke test for Music Viz Studio (apps/music-viz, built into /music-viz/ by
// `npm run build`). It's a WebGL/canvas app, so this checks the essentials
// rather than pixels: it boots without errors, renders something, plays a
// synthesized demo track, and every tab opens.
const { test, expect } = require('./helpers/fixtures');

/** Std-dev of the stage canvas's luminance — > 0 means something was drawn. */
async function stageVariance(page) {
  return page.evaluate(() => {
    const canvases = [...document.querySelectorAll('canvas')];
    const stage = canvases.sort((a, b) => b.width * b.height - a.width * a.height)[0];
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 40;
    const g = c.getContext('2d');
    g.drawImage(stage, 0, 0, 64, 40);
    const d = g.getImageData(0, 0, 64, 40).data;
    let sum = 0;
    let sq = 0;
    const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const y = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      sum += y;
      sq += y * y;
    }
    const mean = sum / n;
    return Math.sqrt(Math.max(0, sq / n - mean * mean));
  });
}

test('boots, plays a demo track and switches tabs without errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/music-viz/');
  await expect(page.locator('.transport')).toBeVisible();

  // First run loads the featured scene: the layers panel has layers and the
  // stage draws something even before audio plays (idle animation).
  await expect(page.locator('canvas').first()).toBeVisible();

  // Space = play; with nothing loaded this synthesizes and plays a demo.
  await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.keyboard.press('Space');
  await expect(page.locator('.transport__trackname')).not.toHaveText(/No audio loaded/, { timeout: 60_000 });
  await page.waitForTimeout(1500);
  expect(await stageVariance(page)).toBeGreaterThan(1);

  // Tabs: 2 = Gallery, 3 = Mapping Lab, 4 = Guide, 1 = Studio.
  for (const key of ['2', '3', '4', '1']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(400);
  }

  expect(errors).toEqual([]);
});

// Opening files: failures must explain themselves and never replace the
// current track (previously a failed file silently started the demo instead).
async function openFile(page, file) {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: /^Open/ }).first().click(),
  ]);
  await chooser.setFiles(file);
}

/** A tiny valid WAV (0.5 s of a 440 Hz tone), built in Node. */
function wav() {
  const rate = 8000;
  const n = rate / 2;
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(8000 * Math.sin((2 * Math.PI * 440 * i) / rate)), 44 + i * 2);
  return b;
}

test('bad audio files explain why and keep the current track', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/music-viz/');
  await expect(page.locator('.transport')).toBeVisible();

  await openFile(page, { name: 'tone.wav', mimeType: 'audio/wav', buffer: wav() });
  await expect(page.locator('.transport__trackname')).toHaveText('tone', { timeout: 20_000 });

  const cases = [
    { file: { name: 'empty.mp3', mimeType: 'audio/mpeg', buffer: Buffer.alloc(0) }, msg: /empty \(0 bytes\)/ },
    { file: { name: 'song.mid', mimeType: 'audio/midi', buffer: Buffer.from('MThd') }, msg: /MIDI files contain notes/ },
    { file: { name: 'notes.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') }, msg: /PDF document, not audio/ },
    { file: { name: 'junk.mp3', mimeType: 'audio/mpeg', buffer: Buffer.alloc(4096, 7) }, msg: /Couldn’t decode “junk\.mp3”/ },
  ];
  for (const c of cases) {
    await openFile(page, c.file);
    await expect(page.locator('.source-msg')).toContainText(c.msg, { timeout: 20_000 });
    // the previously loaded file is still the current track (no demo fallback)
    await expect(page.locator('.transport__trackname')).toHaveText('tone');
    await page.locator('.source-msg__close').click();
    await expect(page.locator('.source-msg')).toHaveCount(0);
  }
});

test('every setting label explains itself on hover', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/music-viz/');
  const labels = page.locator('.inspector .ctl__label');
  for (const tab of ['Layer', 'Mapping', 'Scene']) {
    await page.locator('.inspector .segmented__opt', { hasText: tab }).click();
    await expect(labels.first()).toBeVisible();
    const missing = await labels.evaluateAll((els) =>
      els.filter((e) => !e.getAttribute('data-tip-title')).map((e) => e.textContent.trim()),
    );
    expect(missing, `${tab} tab labels without an explanation`).toEqual([]);
  }
  await page.locator('.inspector .segmented__opt', { hasText: 'Layer' }).click();
  await labels.filter({ hasText: 'Opacity' }).first().hover();
  await expect(page.locator('.tooltip--rich')).toContainText('Opacity');
});

// History + random: every visualization you leave is kept, edits are never
// lost to a roll, checkpoints can be named, and it all survives a reload.
const historyOf = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('music-viz-studio:history:v1') || '[]'));

test('random rolls and checkpoints are kept in History across reloads', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/music-viz/');
  await expect(page.locator('.transport')).toBeVisible();
  await page.waitForTimeout(500);

  // an edit (rename) immediately followed by a random roll: the edit must survive
  const name = page.locator('.project-name');
  await name.fill('Before the dice');
  await name.press('Enter');
  await page.keyboard.press('g');
  await expect.poll(async () => (await historyOf(page)).length).toBeGreaterThanOrEqual(2);
  let h = await historyOf(page);
  expect(h[0].current).toBe(true);
  expect(h[0].origin).toBe('random');
  expect(h[0].name).toMatch(/^Random /);
  expect(h.find((e) => !e.current)?.name).toBe('Before the dice');

  // another roll keeps the previous random too
  await page.keyboard.press('g');
  await expect.poll(async () => (await historyOf(page)).filter((e) => e.origin === 'random').length).toBe(2);

  // ⌘S: checkpoint and name it in place
  await page.keyboard.press('Control+s');
  const rename = page.locator('.history__rename');
  await expect(rename).toBeFocused();
  await rename.fill('A keeper');
  await rename.press('Enter');
  // both the checkpoint and the live visualization now carry the name
  await expect(page.locator('.history__name', { hasText: 'A keeper' })).toHaveCount(2);
  // the live visualization carries the name forward
  await expect(name).toHaveValue('A keeper');

  // rolling on without further edits must not leave a duplicate of the named checkpoint
  await page.keyboard.press('g');
  await expect.poll(async () => (await historyOf(page))[0].origin).toBe('random');
  expect((await historyOf(page)).filter((e) => e.name === 'A keeper')).toHaveLength(1);
  await expect(name).not.toHaveValue('A keeper');

  await page.reload();
  await expect(page.locator('.transport')).toBeVisible();
  h = await historyOf(page);
  expect(h.some((e) => e.name === 'A keeper' && e.named && !e.current)).toBe(true);
  expect(h.some((e) => e.name === 'Before the dice')).toBe(true);
  // the restored session is the last random roll
  expect(h[0].current && h[0].origin === 'random').toBe(true);
});
