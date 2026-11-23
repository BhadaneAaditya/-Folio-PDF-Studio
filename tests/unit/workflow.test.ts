import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { createWorkspace, importSources, swapPages, movePages, copyPages, addMark, undo, redo } from '../../src/core/workspace';
import { buildAllExports, buildZip } from '../../src/core/exportPdf';
import { createAllSamples, sampleLabelRect } from '../../src/core/samples';
import type { WorkspaceState } from '../../src/core/types';
import { sourceFromBytes } from '../helpers';
import { pageLabels, highlightAnnotations } from '../pdfRead';

async function fourDocumentWorkspace(): Promise<WorkspaceState> {
  const samples = await createAllSamples();
  const sources = await Promise.all(
    samples.map((s, i) => sourceFromBytes(`src_${i}`, s.name, s.bytes, s.labels)),
  );
  return importSources(createWorkspace(), sources);
}

function docs(state: WorkspaceState): Record<string, string[]> {
  return Object.fromEntries(state.documents.map((d) => [d.name, d.pageIds.map((id) => state.pages[id]!.label)]));
}

describe('Milestone 1 — four-document workflow', () => {
  it('opens four documents with two uniquely labelled pages each', async () => {
    const state = await fourDocumentWorkspace();
    expect(state.documents).toHaveLength(4);
    expect(docs(state)).toEqual({ A: ['A1', 'A2'], B: ['B1', 'B2'], C: ['C1', 'C2'], D: ['D1', 'D2'] });
  });

  it('highlights A2, swaps with C1, moves D2 into B, and exports verified PDFs in a ZIP', async () => {
    let state = await fourDocumentWorkspace();
    const docA = state.documents.find((d) => d.name === 'A')!;
    const docB = state.documents.find((d) => d.name === 'B')!;
    const docC = state.documents.find((d) => d.name === 'C')!;
    const docD = state.documents.find((d) => d.name === 'D')!;
    const a2 = docA.pageIds[1]!;
    const c1 = docC.pageIds[0]!;
    const d2 = docD.pageIds[1]!;
    const b2 = docB.pageIds[1]!;

    state = addMark(state, a2, {
      id: 'highlight_a2',
      kind: 'highlight',
      rect: sampleLabelRect('A2'),
      color: [1, 0.84, 0.2],
      opacity: 0.45,
      text: 'A2',
    });
    expect(state.pages[a2]!.marks).toHaveLength(1);

    state = swapPages(state, { docId: docA.id, pageId: a2 }, { docId: docC.id, pageId: c1 });
    state = movePages(state, {
      pageIds: [d2],
      fromDocId: docD.id,
      toDocId: docB.id,
      anchorPageId: b2,
      position: 'before',
    });

    expect(docs(state)).toEqual({ A: ['A1', 'C1'], B: ['B1', 'D2', 'B2'], C: ['A2', 'C2'], D: ['D1'] });

    const exports = await buildAllExports(state);
    const filenames = exports.map((e) => e.filename);
    expect(filenames).toEqual(['A.pdf', 'B.pdf', 'C.pdf', 'D.pdf']);

    const byName = Object.fromEntries(exports.map((e) => [e.filename, e.bytes]));
    expect(await pageLabels(byName['A.pdf']!)).toEqual(['A1', 'C1']);
    expect(await pageLabels(byName['B.pdf']!)).toEqual(['B1', 'D2', 'B2']);
    expect(await pageLabels(byName['C.pdf']!)).toEqual(['A2', 'C2']);
    expect(await pageLabels(byName['D.pdf']!)).toEqual(['D1']);

    const highlight = await highlightAnnotations(byName['C.pdf']!);
    expect(highlight.some((a) => a.subtype === 'Highlight')).toBe(true);
    expect(highlight[0]!.quadPoints).toBeDefined();

    const zip = await buildZip(state);
    const loaded = await JSZip.loadAsync(zip);
    expect(Object.keys(loaded.files).sort()).toEqual(['A.pdf', 'B.pdf', 'C.pdf', 'D.pdf']);
    const fromZip = await loaded.file('C.pdf')!.async('uint8array');
    expect(await pageLabels(fromZip)).toEqual(['A2', 'C2']);
  });

  it('undoes and redoes the move and swap as single operations', async () => {
    let state = await fourDocumentWorkspace();
    const docA = state.documents.find((d) => d.name === 'A')!;
    const docB = state.documents.find((d) => d.name === 'B')!;
    const docC = state.documents.find((d) => d.name === 'C')!;
    const docD = state.documents.find((d) => d.name === 'D')!;

    state = swapPages(state, { docId: docA.id, pageId: docA.pageIds[1]! }, { docId: docC.id, pageId: docC.pageIds[0]! });
    state = movePages(state, {
      pageIds: [docD.pageIds[1]!],
      fromDocId: docD.id,
      toDocId: docB.id,
      anchorPageId: docB.pageIds[1]!,
      position: 'before',
    });

    state = undo(state);
    expect(docs(state)).toEqual({ A: ['A1', 'C1'], B: ['B1', 'B2'], C: ['A2', 'C2'], D: ['D1', 'D2'] });
    state = undo(state);
    expect(docs(state)).toEqual({ A: ['A1', 'A2'], B: ['B1', 'B2'], C: ['C1', 'C2'], D: ['D1', 'D2'] });

    state = redo(state);
    state = redo(state);
    expect(docs(state)).toEqual({ A: ['A1', 'C1'], B: ['B1', 'D2', 'B2'], C: ['A2', 'C2'], D: ['D1'] });
  });

  it('copies a page and edits the copy without affecting the source instance', async () => {
    let state = await fourDocumentWorkspace();
    const docA = state.documents.find((d) => d.name === 'A')!;
    const docB = state.documents.find((d) => d.name === 'B')!;
    const sourceId = docA.pageIds[0]!;
    state = copyPages(state, {
      pageIds: [sourceId],
      fromDocId: docA.id,
      toDocId: docB.id,
      anchorPageId: docB.pageIds[0]!,
      position: 'after',
    });
    const copiedId = docB.pageIds.length + 1;
    const copied = state.documents.find((d) => d.id === docB.id)!.pageIds.find((id) => id !== docB.pageIds[0] && id !== docB.pageIds[1])!;
    expect(copied).not.toBe(sourceId);
    expect(state.pages[copied]!.label).toBe('A1');
    void copiedId;

    state = addMark(state, copied, {
      id: 'only_on_copy',
      kind: 'highlight',
      rect: sampleLabelRect('A1'),
      color: [0, 1, 0],
      opacity: 0.5,
    });
    expect(state.pages[sourceId]!.marks).toHaveLength(0);
    expect(state.pages[copied]!.marks).toHaveLength(1);
  });

  it('preserves stable page ids through moves', async () => {
    let state = await fourDocumentWorkspace();
    const docC = state.documents.find((d) => d.name === 'C')!;
    const docA = state.documents.find((d) => d.name === 'A')!;
    const a2 = docA.pageIds[1]!;
    state = swapPages(state, { docId: docA.id, pageId: a2 }, { docId: docC.id, pageId: docC.pageIds[0]! });
    const owner = state.documents.find((d) => d.pageIds.includes(a2))!;
    expect(owner.name).toBe('C');
    expect(state.pages[a2]!.label).toBe('A2');
  });
});
