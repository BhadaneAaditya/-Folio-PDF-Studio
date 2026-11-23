import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { allPageText, pageLabels } from '../pdfRead';

async function loadSamples(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try sample files' }).click();
  await expect(page.getByRole('region', { name: /Document D/ })).toBeVisible();
}

test('document columns and the editor pane can be resized by dragging', async ({ page }) => {
  await loadSamples(page);
  const column = page.getByRole('region', { name: /Document A\b/ });
  const before = (await column.boundingBox())!.width;
  const handle = column.getByRole('separator', { name: 'Resize A column' });
  const grip = (await handle.boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + 60);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2 + 90, grip.y + 60, { steps: 8 });
  await page.mouse.up();
  const after = (await column.boundingBox())!.width;
  expect(after).toBeGreaterThan(before + 60);

  await page.getByRole('button', { name: 'Page A1' }).click();
  const editor = page.getByRole('complementary', { name: 'Page editor' });
  const editorBefore = (await editor.boundingBox())!.width;
  const editorGrip = (await editor.getByRole('separator', { name: 'Resize editor pane' }).boundingBox())!;
  await page.mouse.move(editorGrip.x + editorGrip.width / 2, editorGrip.y + 60);
  await page.mouse.down();
  await page.mouse.move(editorGrip.x + editorGrip.width / 2 - 70, editorGrip.y + 60, { steps: 8 });
  await page.mouse.up();
  expect((await editor.boundingBox())!.width).toBeGreaterThan(editorBefore + 50);
});

test('page previews can be sized and a page can be maximized in the viewer', async ({ page }) => {
  await loadSamples(page);
  const column = page.getByRole('region', { name: /Document A\b/ });
  const thumb = column.locator('.thumb-wrap').first();
  const before = (await thumb.boundingBox())!.width;
  await column.getByRole('button', { name: 'Make thumbnails larger' }).click();
  await column.getByRole('button', { name: 'Make thumbnails larger' }).click();
  const after = (await thumb.boundingBox())!.width;
  expect(after).toBeGreaterThan(before + 30);
  await column.getByRole('button', { name: 'Make thumbnails smaller' }).click();
  await expect(column.getByText('240px')).toBeVisible();

  await column.getByRole('button', { name: 'Maximize A1' }).click();
  await expect(page.getByRole('region', { name: /Document B/ })).toHaveCount(0);
  const editor = page.getByRole('complementary', { name: 'Page editor' });
  expect((await editor.boundingBox())!.width).toBeGreaterThan(1000);
  await page.getByRole('button', { name: 'Minimize editor' }).click();
  await expect(page.getByRole('region', { name: /Document B/ })).toBeVisible();
});

test('columns and the editor can be maximized and restored', async ({ page }) => {
  await loadSamples(page);
  const column = page.getByRole('region', { name: /Document A\b/ });
  await column.getByRole('button', { name: 'Maximize column A' }).click();
  await expect(page.getByRole('region', { name: /Document B/ })).toHaveCount(0);
  const wide = (await column.boundingBox())!.width;
  expect(wide).toBeGreaterThan(800);
  await column.getByRole('button', { name: 'Restore column A' }).click();
  await expect(page.getByRole('region', { name: /Document B/ })).toBeVisible();

  await page.getByRole('button', { name: 'Page A1' }).click();
  await page.getByRole('button', { name: 'Maximize editor' }).click();
  await expect(page.getByRole('region', { name: /Document A/ })).toHaveCount(0);
  const editor = page.getByRole('complementary', { name: 'Page editor' });
  expect((await editor.boundingBox())!.width).toBeGreaterThan(1000);
  await page.getByRole('button', { name: 'Minimize editor' }).click();
  await expect(page.getByRole('region', { name: /Document A/ })).toBeVisible();
});

test('column actions delete selected pages and add a page from the device', async ({ page }) => {
  await loadSamples(page);
  const column = page.getByRole('region', { name: /Document A\b/ });
  await page.getByRole('button', { name: 'Page A1' }).click();
  await column.getByRole('button', { name: /^Delete \(1\)$/ }).click();
  await expect(column.locator('.thumb')).toHaveCount(1);

  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await column.getByRole('button', { name: 'From device' }).click();
  await column.locator('input[type=file]').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: png });
  await expect(column.locator('.thumb')).toHaveCount(2);
  await expect(column.getByText('2 pages')).toBeVisible();
});

test('viewer toolbar navigates pages, zooms and fits the page inside the window', async ({ page }) => {
  await loadSamples(page);
  await page.getByRole('button', { name: 'Page A1' }).click();
  const viewer = page.getByRole('toolbar', { name: 'Page viewing controls' });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByRole('spinbutton', { name: 'Current page' })).toHaveValue('1');
  await expect(viewer.getByText('/ 2')).toBeVisible();

  await viewer.getByRole('button', { name: 'Next page' }).click();
  await expect(page.locator('.editor-title')).toHaveText('A2 — editing');
  await viewer.getByRole('button', { name: 'Zoom in' }).click();
  await expect(viewer.getByRole('combobox', { name: 'Zoom level' })).toHaveValue('1.25');
  await viewer.getByRole('combobox', { name: 'Zoom level' }).selectOption('1.5');
  await viewer.getByRole('button', { name: 'Fit page' }).click();
  const zoomValue = await viewer.getByRole('combobox', { name: 'Zoom level' }).inputValue();
  expect(zoomValue === 'custom' || Number.isFinite(Number(zoomValue))).toBe(true);

  const hq = viewer.getByRole('button', { name: 'High quality rendering' });
  await expect(hq).toHaveAttribute('aria-pressed', 'true');
  const pixels = await page.locator('.editor canvas').evaluate((canvas) => (canvas as HTMLCanvasElement).width);
  expect(pixels).toBeGreaterThanOrEqual(600);
});

test('pages render at display resolution and above so text is readable', async ({ page }) => {
  await loadSamples(page);
  await page.getByRole('button', { name: 'Page A1' }).click();
  const metrics = await page.locator('.editor canvas').evaluate((canvas) => {
    const element = canvas as HTMLCanvasElement;
    return { pixels: element.width, css: parseFloat(element.style.width || '0') };
  });
  expect(metrics.pixels).toBeGreaterThanOrEqual(600);
  expect(metrics.pixels).toBeGreaterThanOrEqual(metrics.css);
  const thumb = await page.locator('.thumb canvas').first().evaluate((canvas) => (canvas as HTMLCanvasElement).width);
  expect(thumb).toBeGreaterThanOrEqual(200);
});

test('existing text is replaced in the exported PDF and remains searchable', async ({ page }) => {
  await loadSamples(page);
  await page.getByRole('button', { name: 'Page A1' }).click();
  await page.getByRole('button', { name: 'Edit text', exact: true }).click();
  const box = (await page.locator('.page-surface').boundingBox())!;
  await page.mouse.move(box.x + 68, box.y + 95);
  await page.mouse.down();
  await page.mouse.move(box.x + 170, box.y + 135, { steps: 8 });
  await page.mouse.up();
  const dialog = page.getByRole('dialog', { name: 'Edit text in place' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Current text' }).fill('A1');
  await dialog.getByRole('textbox', { name: 'Replace with' }).fill('Z9');
  await dialog.getByRole('button', { name: 'Apply edit' }).click();
  await expect(page.getByRole('button', { name: /“A1” → “Z9”/ })).toBeVisible();

  await page.getByRole('button', { name: 'Export' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download all as ZIP' }).click(),
  ]);
  const zip = await JSZip.loadAsync(await readFile((await download.path())!));
  const firstPage = (await allPageText(await zip.file('A.pdf')!.async('uint8array')))[0]!;
  expect(firstPage).toContain('Z9');
  expect(firstPage).not.toContain('A1');
});

test('download can compress PDFs at export time', async ({ page }) => {
  await loadSamples(page);
  await page.getByRole('button', { name: 'Export' }).click();
  const dialog = page.getByRole('dialog', { name: 'Review your export' });
  await dialog.locator('#export-compression-mode').selectOption('lossless');
  await dialog.getByRole('button', { name: 'Preview size' }).click();
  await expect(dialog.getByText(/→/)).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Download all as ZIP' }).click(),
  ]);
  const zip = await JSZip.loadAsync(await readFile((await download.path())!));
  expect(Object.keys(zip.files).sort()).toEqual(['A.pdf', 'B.pdf', 'C.pdf', 'D.pdf']);
  expect(await pageLabels(await zip.file('A.pdf')!.async('uint8array'))).toEqual(['A1', 'A2']);
});

test('compression previews the size and opens a compressed copy', async ({ page }) => {
  await loadSamples(page);
  await page.getByRole('button', { name: 'Compress' }).click();
  const dialog = page.getByRole('dialog', { name: 'Compress PDF' });
  await dialog.getByRole('button', { name: 'Preview size' }).click();
  await expect(dialog.getByText(/After:/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Open compressed copy' }).click();
  await expect(page.getByRole('region', { name: /Document D-compressed/ })).toBeVisible();
  await expect(page.getByRole('region', { name: /Document D-compressed/ }).locator('.thumb')).toHaveCount(2);
});
