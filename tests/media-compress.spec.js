const { test, expect } = require('./helpers/fixtures');
const { attachImages, attachPdf, attachMedia } = require('./helpers/gen');

test.beforeEach(async ({ page }) => {
  await page.goto('/media-compress.html');
  await expect(page.locator('#drop-zone')).toBeVisible();
});

test('queues added images', async ({ page }) => {
  await attachImages(page, 2);
  await expect(page.locator('#queue-section')).toBeVisible();
  await expect(page.locator('#queue-list li')).toHaveCount(2);
});

test('combined mode produces one PDF', async ({ page }) => {
  await attachImages(page, 2);
  await page.click('#create-btn');
  await expect(page.locator('#output-section')).toBeVisible({ timeout: 60_000 });

  const link = page.locator('#download-link');
  await expect(link).toHaveAttribute('download', /\.pdf$/);
  expect(await link.getAttribute('href')).toMatch(/^blob:/);
  await expect(page.locator('#size-comparison')).toContainText('MB');
  // The individual-file list belongs to separate mode only.
  await expect(page.locator('#file-list')).toBeHidden();
});

test('separate mode offers a ZIP plus individual downloads, native format by default', async ({ page }) => {
  await attachImages(page, 3);
  await page.click('.mode-btn[data-mode="separate"]');
  await page.click('#create-btn');
  await expect(page.locator('#output-section')).toBeVisible({ timeout: 60_000 });

  const link = page.locator('#download-link');
  await expect(link).toHaveAttribute('download', /\.zip$/);
  await expect(page.locator('#filename-ext')).toHaveText('.zip');

  // One individual download link per input file.
  await expect(page.locator('#file-list')).toBeVisible();
  await expect(page.locator('#file-list a')).toHaveCount(3);
  await expect(page.locator('#file-list a').first()).toHaveAttribute('download', /-compressed\.jpg$/);
});

test('separate mode can force images to WEBP', async ({ page }) => {
  await attachImages(page, 2);
  await page.click('.mode-btn[data-mode="separate"]');
  await page.click('.format-btn[data-format="webp"]');
  await page.click('#create-btn');
  await expect(page.locator('#output-section')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#file-list a')).toHaveCount(2);
  await expect(page.locator('#file-list a').first()).toHaveAttribute('download', /-compressed\.webp$/);
});

test('separate mode can still force PDF output for images', async ({ page }) => {
  await attachImages(page, 2);
  await page.click('.mode-btn[data-mode="separate"]');
  await page.click('.format-btn[data-format="pdf"]');
  await page.click('#create-btn');
  await expect(page.locator('#output-section')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#file-list a').first()).toHaveAttribute('download', /-compressed\.pdf$/);
});

test('image format selector only shows in separate mode with images queued', async ({ page }) => {
  await attachImages(page, 1);
  await expect(page.locator('#image-format-selector')).toBeHidden();
  await page.click('.mode-btn[data-mode="separate"]');
  await expect(page.locator('#image-format-selector')).toBeVisible();
  await page.click('.mode-btn[data-mode="combined"]');
  await expect(page.locator('#image-format-selector')).toBeHidden();
});

test('lets you rename the output before downloading', async ({ page }) => {
  await attachImages(page, 2);
  await page.click('#create-btn');
  await expect(page.locator('#output-section')).toBeVisible({ timeout: 60_000 });

  await expect(page.locator('#filename-ext')).toHaveText('.pdf');
  const input = page.locator('#filename-input');
  const link = page.locator('#download-link');

  await input.fill('my report');
  await expect(link).toHaveAttribute('download', 'my report.pdf');

  // Illegal filename characters are stripped; the extension is preserved.
  await input.fill('a/b:c*d');
  await expect(link).toHaveAttribute('download', 'abcd.pdf');

  // Empty falls back to a sensible default.
  await input.fill('');
  await expect(link).toHaveAttribute('download', 'compressed.pdf');
});

test('accepts a PDF input (exercises pdf.js)', async ({ page }) => {
  await attachPdf(page, 2);
  await expect(page.locator('#queue-list li')).toHaveCount(1);
  // page count is read via pdf.js; wait for it to resolve away from "loading…"
  await expect(page.locator('#queue-list li .meta')).toContainText('page', { timeout: 30_000 });

  await page.click('#create-btn');
  await expect(page.locator('#output-section')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#download-link')).toHaveAttribute('download', /\.pdf$/);
});

test('video is accepted and shown as incompatible with Combine', async ({ page }) => {
  await attachImages(page, 1);
  await attachMedia(page, { video: true, ms: 1000 });
  await expect(page.locator('#queue-list li')).toHaveCount(2);
  await expect(page.locator('#queue-list li .incompatible')).toBeVisible();
  await page.click('#create-btn');
  await expect(page.locator('#output-section')).toBeVisible({ timeout: 60_000 });
  // The video was skipped; the PDF still built from the image alone.
  await expect(page.locator('#download-link')).toHaveAttribute('download', /\.pdf$/);
});

test('an all-video queue disables Combine and shows a hint', async ({ page }) => {
  await attachMedia(page, { video: true, ms: 1000 });
  await expect(page.locator('#create-btn')).toBeDisabled();
  await expect(page.locator('#combine-hint')).toBeVisible();
});

test('separate mode compresses video to MP4', async ({ page }) => {
  test.setTimeout(180_000);
  await attachMedia(page, { video: true, ms: 1500 });
  await page.click('.mode-btn[data-mode="separate"]');
  await expect(page.locator('#create-btn')).toBeEnabled();
  await page.click('#create-btn');
  await expect(page.locator('#output-section')).toBeVisible({ timeout: 150_000 });
  await expect(page.locator('#file-list a')).toHaveCount(1);
  await expect(page.locator('#file-list a').first()).toHaveAttribute('download', /-compressed\.mp4$/);
});
