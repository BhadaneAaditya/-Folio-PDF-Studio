import { describe, expect, it } from 'vitest';
import { parseRanges, formatRanges } from '../../src/core/ranges';
import { duplicatePages, deletePages, reverseDocument, addMark } from '../../src/core/workspace';
import { searchWorkspace } from '../../src/core/search';
import { reducer } from '../../src/core/store';
import { insertSourcePages } from '../../src/core/workspace';
import { createAllSamples, sampleLabelRect } from '../../src/core/samples';
import { sourceFromBytes } from '../helpers';
import { createWorkspace, importSources } from '../../src/core/workspace';
import { computeCrop } from '../../src/core/crop';
import { clampZoom, computeFitZoom } from '../../src/core/viewer';

describe('Milestone 2 — ranges, page operations and search', () => {
  it('parses and formats page range syntax', () => {
    expect(parseRanges('1-3, 6, 9-11', 12)).toEqual([0, 1, 2, 5, 8, 9, 10]);
    expect(parseRanges('9-11, 1-2, 6', 7)).toEqual([0, 1, 5]);
    expect(parseRanges('0, abc, 4-2, 99', 10)).toEqual([]);
    expect(formatRanges([0, 1, 2, 5, 8, 9, 10])).toBe('1-3, 6, 9-11');
  });

  it('duplicates, deletes and reverses pages through one history each', async () => {
    const samples = await createAllSamples();
    const sources = await Promise.all(samples.map((s, i) => sourceFromBytes(`s${i}`, s.name, s.bytes, s.labels)));
    let state = importSources(createWorkspace(), sources);
    const doc = state.documents[0]!;
    state = addMark(state, doc.pageIds[0]!, {
      id: 'm1', kind: 'highlight', rect: sampleLabelRect('A1'), color: [1, 1, 0], opacity: 0.5,
    });

    state = duplicatePages(state, doc.id, [doc.pageIds[0]!]);
    let current = state.documents.find((d) => d.id === doc.id)!;
    expect(current.pageIds.map((id) => state.pages[id]!.label)).toEqual(['A1', 'A1', 'A2']);
    const copyId = current.pageIds[1]!;
    expect(state.pages[copyId]!.marks).toHaveLength(1);
    expect(state.pages[copyId]!.marks[0]!.id).not.toBe('m1');

    state = deletePages(state, doc.id, [copyId]);
    current = state.documents.find((d) => d.id === doc.id)!;
    expect(current.pageIds.map((id) => state.pages[id]!.label)).toEqual(['A1', 'A2']);

    state = reverseDocument(state, doc.id);
    current = state.documents.find((d) => d.id === doc.id)!;
    expect(current.pageIds.map((id) => state.pages[id]!.label)).toEqual(['A2', 'A1']);
    expect(state.past).toHaveLength(5);
  });

  it('inserts pages from a new source directly into an existing document', async () => {
    const sample = await createAllSamples();
    const source = await sourceFromBytes('device1', 'device.pdf', sample[0]!.bytes, ['D1', 'D2']);
    let state = importSources(createWorkspace(), await Promise.all(
      sample.slice(1).map((s, i) => sourceFromBytes(`s${i}`, s.name, s.bytes, s.labels)),
    ));
    const target = state.documents[0]!;
    state = insertSourcePages(state, source, target.id);
    const updated = state.documents.find((d) => d.id === target.id)!;
    expect(updated.pageIds.map((id) => state.pages[id]!.label)).toEqual(['B1', 'B2', 'D1', 'D2']);
    expect(state.sources.device1).toBeDefined();
    expect(state.past).toHaveLength(2);
  });

  it('computes fit-to-window zoom and keeps zoom within bounds', () => {
    expect(computeFitZoom(612, 792, 500, 700, 'width')).toBeCloseTo(452 / 612, 2);
    expect(computeFitZoom(612, 792, 500, 700, 'height')).toBeCloseTo(652 / 792, 2);
    const fitPage = computeFitZoom(612, 792, 500, 700, 'page');
    expect(fitPage).toBeLessThanOrEqual(computeFitZoom(612, 792, 500, 700, 'width'));
    expect(clampZoom(0.001)).toBe(0.1);
    expect(clampZoom(99)).toBe(8);
    expect(clampZoom(1.254)).toBe(1.25);
  });

  it('resizes columns and the editor pane with bounded widths', () => {
    let state = createWorkspace();
    state = reducer(state, { type: 'setColumnWidth', docId: 'doc1', width: 400 });
    expect(state.columnWidths.doc1).toBe(400);
    state = reducer(state, { type: 'setColumnWidth', docId: 'doc1', width: 2000 });
    expect(state.columnWidths.doc1).toBe(640);
    state = reducer(state, { type: 'setColumnWidth', docId: 'doc1', width: 10 });
    expect(state.columnWidths.doc1).toBe(160);
    state = reducer(state, { type: 'setEditorWidth', width: 900 });
    expect(state.editorWidth).toBe(900);
    state = reducer(state, { type: 'setEditorWidth', width: 100 });
    expect(state.editorWidth).toBe(320);
    state = reducer(state, { type: 'setRenderQuality', quality: 2 });
    expect(state.renderQuality).toBe(2);
    state = reducer(state, { type: 'setRenderQuality', quality: 9 });
    expect(state.renderQuality).toBe(1);
    state = reducer(state, { type: 'setFocusedDoc', docId: 'doc1' });
    expect(state.focusedDocId).toBe('doc1');
    expect(state.activeDocumentId).toBe('doc1');
    state = reducer(state, { type: 'setEditorMaximized', value: true });
    expect(state.editorMaximized).toBe(true);
    state = reducer(state, { type: 'setThumbSize', docId: 'doc1', size: 240 });
    expect(state.thumbSizes.doc1).toBe(240);
    state = reducer(state, { type: 'setThumbSize', docId: 'doc1', size: 5000 });
    expect(state.thumbSizes.doc1).toBe(320);
    state = reducer(state, { type: 'setThumbSize', docId: 'doc1', size: 10 });
    expect(state.thumbSizes.doc1).toBe(80);
  });

  it('computes centred proportional crops and preserves originals by default', async () => {
    const samples = await createAllSamples();
    const sources = await Promise.all(samples.map((s, i) => sourceFromBytes(`s${i}`, s.name, s.bytes, s.labels)));
    const state = importSources(createWorkspace(), sources);
    const page = state.pages[state.documents[0]!.pageIds[0]!]!;
    expect(computeCrop(page, 'original', 20)).toBeNull();
    const letter = computeCrop(page, 'letter', 0)!;
    expect(letter.left).toBeCloseTo(0);
    expect((letter.right - letter.left) / (letter.top - letter.bottom)).toBeCloseTo(612 / 792, 2);
    const withMargin = computeCrop(page, 'letter', 20)!;
    expect(withMargin.left).toBeCloseTo(20);
    expect(computeCrop(page, 'custom', 0, { width: 300, height: 300 })!.top - computeCrop(page, 'custom', 0, { width: 300, height: 300 })!.bottom).toBeCloseTo(612);
  });

  it('searches current or all documents and reports snippets', async () => {
    const samples = await createAllSamples();
    const sources = await Promise.all(samples.map((s, i) => sourceFromBytes(`s${i}`, s.name, s.bytes, s.labels)));
    const state = importSources(createWorkspace(), sources);
    const texts: Record<string, string> = Object.fromEntries(
      Object.values(state.pages).map((page) => [`${page.sourceId}:${page.sourcePageIndex}`, `${page.label} selectable text alpha beta`]),
    );
    const provider = async (sourceId: string, pageIndex: number) => texts[`${sourceId}:${pageIndex}`] ?? '';

    const all = await searchWorkspace(state, 'selectable', 'all', provider);
    expect(all).toHaveLength(8);
    const current = await searchWorkspace(state, 'selectable', 'current', provider);
    expect(current).toHaveLength(2);
    expect(current[0]!.snippet).toContain('selectable');
  });
});
