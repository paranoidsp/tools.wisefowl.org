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
