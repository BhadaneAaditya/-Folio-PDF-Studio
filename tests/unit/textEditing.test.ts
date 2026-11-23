import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { createSamplePdf } from '../../src/core/samples';
import { applyTextEdits, rewriteContent, tokenize } from '../../src/core/textEdit';
import { applyExportCompression, compressLossless, pickSmaller } from '../../src/core/compress';
import { allPageText } from '../pdfRead';
import type { TextEdit } from '../../src/core/types';

const edit: TextEdit = {
  id: 'e1',
  rect: { x1: 62, y1: 668, x2: 160, y2: 758 },
  original: 'A1',
  replacement: 'Z9',
  fontSize: 72,
  color: [0.1, 0.1, 0.12],
  baselineX: 72,
  baselineY: 680,
};

describe('Inside-the-PDF text editing and compression', () => {
  it('removes the original text operator and writes searchable replacement text', async () => {
    const tokens = tokenize('BT 1 0 0 1 72 680 Tm <4131> Tj ET');
    expect(tokens.some((token) => token.kind === 'string' && token.value === 'A1')).toBe(true);
    const rewritten = rewriteContent('BT 1 0 0 1 72 680 Tm <4131> Tj ET', [edit]);
    expect(rewritten.removed[0]).toBe(1);
    expect(rewritten.content).not.toContain('<4131>');

    const doc = await PDFDocument.load(await createSamplePdf('A'));
    const result = await applyTextEdits(doc, doc.getPage(0), [edit]);
    expect(result.removed[0]).toBe(1);
    expect(result.warnings).toHaveLength(0);
    const bytes = await doc.save();
    const pages = await allPageText(bytes);
    expect(pages[0]).toContain('Z9');
    expect(pages[0]).not.toContain('A1');
    expect(pages[0]).toContain('This text is selectable and searchable.');
    expect(await allPageText(bytes)).toHaveLength(2);
  });

  it('leaves other text untouched and warns when text is not found', async () => {
    const doc = await PDFDocument.load(await createSamplePdf('B'));
    const result = await applyTextEdits(doc, doc.getPage(0), [{ ...edit, original: 'NOT_THERE' }]);
    expect(result.removed[0]).toBe(0);
    expect(result.warnings[0]).toContain('NOT_THERE');
    const pages = await allPageText(await doc.save());
    expect(pages[0]).toContain('B1');
  });

  it('produces a valid lossless-compressed PDF and never returns a larger file', async () => {
    const original = await createSamplePdf('C');
    const compressed = await compressLossless(original);
    expect(compressed.length).toBeGreaterThan(0);
    const pages = await allPageText(compressed);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toContain('C1');
    expect(pages[1]).toContain('C2');
    const tiny = new Uint8Array([1, 2, 3]);
    expect(pickSmaller(original, tiny)).toBe(tiny);
    expect(pickSmaller(original, new Uint8Array(original.length + 10))).toBe(original);
    const untouched = await applyExportCompression(original, { mode: 'none', dpi: 110, quality: 0.7 });
    expect(untouched).toBe(original);
    const compressedOnExport = await applyExportCompression(original, { mode: 'lossless', dpi: 110, quality: 0.7 });
    expect((await allPageText(compressedOnExport))[0]).toContain('C1');
  });
});
