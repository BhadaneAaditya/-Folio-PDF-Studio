import { expect, test } from '@playwright/test';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';
import { pageLabels, highlightAnnotations } from '../pdfRead';

async function loadSamples(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try sample files' }).click();
  await expect(page.getByRole('region', { name: /Document A/ })).toBeVisible();
  await expect(page.getByRole('region', { name: /Document D/ })).toBeVisible();
}

async function columnLabels(page: import('@playwright/test').Page, letter: string): Promise<string[]> {
  const column = page.getByRole('region', { name: new RegExp(`Document ${letter}\\b`) });
  return column.locator('.thumb-label').allTextContents();
}

test('four-document workflow with real highlight, swap, move, undo/redo and ZIP export', async ({ page }) => {
  await loadSamples(page);
  expect(await columnLabels(page, 'A')).toEqual(['A1', 'A2']);
  expect(await columnLabels(page, 'B')).toEqual(['B1', 'B2']);
  expect(await columnLabels(page, 'C')).toEqual(['C1', 'C2']);
  expect(await columnLabels(page, 'D')).toEqual(['D1', 'D2']);

  await page.getByRole('button', { name: 'Page A2' }).click();
  await expect(page.locator('.editor')).toBeVisible();
  await page.getByRole('button', { name: 'Highlight', exact: true }).click();
  const box = (await page.locator('.page-surface').boundingBox())!;
  await page.mouse.move(box.x + 70, box.y + 55);
  await page.mouse.down();
  await page.mouse.move(box.x + 150, box.y + 110, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.editor .highlight')).toHaveCount(1);

  await page.locator('#transfer-source').selectOption({ label: 'A' });
  await page.locator('#transfer-dest').selectOption({ label: 'C' });
  await page.locator('#transfer-anchor').selectOption({ label: 'C1' });
  await page.getByRole('button', { name: 'Swap', exact: true }).click();
  expect(await columnLabels(page, 'A')).toEqual(['A1', 'C1']);
  expect(await columnLabels(page, 'C')).toEqual(['A2', 'C2']);

  await page.getByRole('button', { name: 'Page D2' }).click();
  await page.locator('#transfer-source').selectOption({ label: 'D' });
  await page.locator('#transfer-dest').selectOption({ label: 'B' });
  await page.locator('#transfer-anchor').selectOption({ label: 'B2' });
  await page.locator('#transfer-position').selectOption('before');
  await page.getByRole('button', { name: 'Move', exact: true }).click();
  expect(await columnLabels(page, 'B')).toEqual(['B1', 'D2', 'B2']);
  expect(await columnLabels(page, 'D')).toEqual(['D1']);

  await page.getByRole('button', { name: 'Undo' }).click();
  await page.getByRole('button', { name: 'Undo' }).click();
  expect(await columnLabels(page, 'A')).toEqual(['A1', 'A2']);
  expect(await columnLabels(page, 'B')).toEqual(['B1', 'B2']);
  expect(await columnLabels(page, 'C')).toEqual(['C1', 'C2']);
  expect(await columnLabels(page, 'D')).toEqual(['D1', 'D2']);

  await page.getByRole('button', { name: 'Redo' }).click();
  await page.getByRole('button', { name: 'Redo' }).click();
  expect(await columnLabels(page, 'A')).toEqual(['A1', 'C1']);
  expect(await columnLabels(page, 'B')).toEqual(['B1', 'D2', 'B2']);

  await page.getByRole('button', { name: 'Export' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download all as ZIP' }).click(),
  ]);
  const zip = await JSZip.loadAsync(await readFile((await download.path())!));
  expect(Object.keys(zip.files).sort()).toEqual(['A.pdf', 'B.pdf', 'C.pdf', 'D.pdf']);
  expect(await pageLabels(await zip.file('A.pdf')!.async('uint8array'))).toEqual(['A1', 'C1']);
  expect(await pageLabels(await zip.file('B.pdf')!.async('uint8array'))).toEqual(['B1', 'D2', 'B2']);
  expect(await pageLabels(await zip.file('C.pdf')!.async('uint8array'))).toEqual(['A2', 'C2']);
  const highlights = await highlightAnnotations(await zip.file('C.pdf')!.async('uint8array'));
  expect(highlights.some((item) => item.subtype === 'Highlight')).toBe(true);
});

test('search and page organization commands work in the browser', async ({ page }) => {
  await loadSamples(page);
  await page.getByRole('button', { name: 'Search' }).click();
  await page.getByRole('searchbox', { name: 'Search text' }).fill('selectable');
  await expect(page.getByText('8 results')).toBeVisible();
  await page.getByRole('button', { name: /^A · A1/ }).click();
  await expect(page.locator('.editor-title')).toHaveText('A1 — editing');
  await page.getByRole('button', { name: 'Close search' }).click();

  await page.getByRole('button', { name: 'Pages' }).click();
  await page.getByRole('menuitem', { name: 'Reverse document' }).click();
  expect(await columnLabels(page, 'A')).toEqual(['A2', 'A1']);

  await page.getByRole('button', { name: 'Page A2' }).click();
  await page.getByRole('button', { name: 'Pages' }).click();
  await page.getByRole('menuitem', { name: 'Duplicate selected pages' }).click();
  expect(await columnLabels(page, 'A')).toEqual(['A2', 'A2', 'A1']);

  await page.getByRole('button', { name: 'Pages' }).click();
  await page.getByRole('menuitem', { name: 'Crop pages…' }).click();
  await page.getByRole('dialog', { name: 'Crop pages' }).getByRole('combobox').nth(1).selectOption('a4');
  await page.getByRole('button', { name: 'Apply crop' }).click();
  await expect(page.locator('.crop-outline')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.crop-outline')).toHaveCount(0);
});

test('a complete transfer can be made with the keyboard only', async ({ page }) => {
  await loadSamples(page);
  const a1 = page.getByRole('button', { name: 'Page A1' });
  await a1.focus();
  await page.keyboard.press('Space');
  await expect(a1).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('c');
  await page.getByLabel('Destination').focus();
  await page.keyboard.press('b');
  await page.getByRole('button', { name: 'Copy', exact: true }).focus();
  await page.keyboard.press('Enter');
  expect(await columnLabels(page, 'B')).toEqual(['B1', 'B2', 'A1']);
});
