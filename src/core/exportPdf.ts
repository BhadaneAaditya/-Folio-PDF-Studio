import JSZip from 'jszip';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFString,
  degrees,
  type PDFPage,
} from 'pdf-lib';
import type { HighlightMark, WorkspaceState } from './types';
import { applyTextEdits } from './textEdit';
import { uniqueName } from './workspace';

const sourceCache = new Map<string, PDFDocument>();
let exportWarnings: string[] = [];

export function getExportWarnings(): string[] {
  return exportWarnings;
}

async function loadSourceDoc(state: WorkspaceState, sourceId: string): Promise<PDFDocument | null> {
  const source = state.sources[sourceId];
  if (!source || source.bytes.length === 0) return null;
  let cached = sourceCache.get(sourceId);
  if (!cached) {
    cached = await PDFDocument.load(source.bytes, { ignoreEncryption: true, updateMetadata: false });
    sourceCache.set(sourceId, cached);
  }
  return cached;
}

export function clearExportCache(): void {
  sourceCache.clear();
}

function n(value: number): PDFNumber {
  return PDFNumber.of(Math.round(value * 1000) / 1000);
}

function addHighlight(doc: PDFDocument, page: PDFPage, mark: HighlightMark): void {
  const ctx = doc.context;
  const { x1, y1, x2, y2 } = mark.rect;
  const width = Math.max(0.5, x2 - x1);
  const height = Math.max(0.5, y2 - y1);
  const [r, g, b] = mark.color;

  const array = (values: number[]) => {
    const result = PDFArray.withContext(ctx);
    values.forEach((value) => result.push(n(value)));
    return result;
  };

  const extGState = PDFDict.withContext(ctx);
  extGState.set(PDFName.of('ca'), n(mark.opacity));
  extGState.set(PDFName.of('BM'), PDFName.of('Multiply'));

  const gsResources = PDFDict.withContext(ctx);
  gsResources.set(PDFName.of('GS'), ctx.register(extGState));

  const resources = PDFDict.withContext(ctx);
  resources.set(PDFName.of('ExtGState'), ctx.register(gsResources));

  const formDict = {
    Type: PDFName.of('XObject'),
    Subtype: PDFName.of('Form'),
    FormType: PDFNumber.of(1),
    BBox: array([0, 0, width, height]),
    Resources: ctx.register(resources),
  };

  const stream = ctx.stream(`q /GS gs ${r} ${g} ${b} rg 0 0 ${width} ${height} re f Q`, formDict);
  const appearances = PDFDict.withContext(ctx);
  appearances.set(PDFName.of('N'), stream);

  const annot = PDFDict.withContext(ctx);
  annot.set(PDFName.of('Type'), PDFName.of('Annot'));
  annot.set(PDFName.of('Subtype'), PDFName.of('Highlight'));
  annot.set(PDFName.of('Rect'), array([x1, y1, x2, y2]));
  annot.set(PDFName.of('QuadPoints'), array([x1, y2, x2, y2, x1, y1, x2, y1]));
  annot.set(PDFName.of('C'), array(mark.color));
  annot.set(PDFName.of('CA'), n(mark.opacity));
  annot.set(PDFName.of('Contents'), PDFString.of(mark.text ?? 'Highlight'));
  annot.set(PDFName.of('F'), PDFNumber.of(4));
  annot.set(PDFName.of('AP'), appearances);
  page.node.addAnnot(ctx.register(annot));
}

async function appendPage(state: WorkspaceState, doc: PDFDocument, pageId: string): Promise<void> {
  const instance = state.pages[pageId];
  if (!instance) return;
  if (!instance.sourceId || instance.sourcePageIndex < 0) {
    const blank = doc.addPage([instance.width, instance.height]);
    blank.setRotation(degrees(instance.rotation));
    return;
  }
  const source = await loadSourceDoc(state, instance.sourceId);
  if (!source) return;
  if (instance.sourcePageIndex >= source.getPageCount()) return;
  const [copied] = await doc.copyPages(source, [instance.sourcePageIndex]);
  if (!copied) return;
  doc.addPage(copied);
  copied.setRotation(degrees((source.getPage(instance.sourcePageIndex)?.getRotation().angle ?? 0) + instance.rotation));
  if (instance.crop) {
    const right = Math.min(instance.crop.right, instance.width);
    const top = Math.min(instance.crop.top, instance.height);
    copied.setCropBox(instance.crop.left, instance.crop.bottom, right - instance.crop.left, top - instance.crop.bottom);
  }
  for (const mark of instance.marks) {
    if (mark.kind === 'highlight') addHighlight(doc, copied, mark);
  }
  if (instance.textEdits.length) {
    const result = await applyTextEdits(doc, copied, instance.textEdits);
    exportWarnings = [...exportWarnings, ...result.warnings.map((warning) => `${instance.label}: ${warning}`)];
  }
}

export async function buildPdfForPageIds(state: WorkspaceState, pageIds: string[]): Promise<Uint8Array> {
  exportWarnings = [];
  const doc = await PDFDocument.create();
  for (const pageId of pageIds) await appendPage(state, doc, pageId);
  doc.setTitle('Folio export');
  doc.setProducer('Folio PDF Studio');
  return doc.save();
}

export async function buildDocumentPdf(state: WorkspaceState, docId: string): Promise<Uint8Array> {
  const doc = state.documents.find((d) => d.id === docId);
  if (!doc) throw new Error('Document not found');
  return buildPdfForPageIds(state, doc.pageIds);
}

export type ExportItem = { docId: string; filename: string; pageCount: number; empty: boolean; bytes: Uint8Array };

export async function buildAllExports(state: WorkspaceState): Promise<ExportItem[]> {
  const used: string[] = [];
  const items: ExportItem[] = [];
  for (const doc of state.documents) {
    const filename = `${uniqueName(used, doc.name)}.pdf`;
    used.push(filename.replace(/\.pdf$/i, ''));
    items.push({
      docId: doc.id,
      filename,
      pageCount: doc.pageIds.length,
      empty: doc.pageIds.length === 0,
      bytes: await buildDocumentPdf(state, doc.id),
    });
  }
  return items;
}

export async function buildZip(state: WorkspaceState): Promise<Uint8Array> {
  const zip = new JSZip();
  const items = await buildAllExports(state);
  for (const item of items) zip.file(item.filename, item.bytes);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
