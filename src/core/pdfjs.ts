import * as pdfjs from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { Rect, SourceDocument } from './types';

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

const proxies = new Map<string, pdfjs.PDFDocumentProxy>();
const renderTasks = new WeakMap<HTMLCanvasElement, ReturnType<pdfjs.PDFPageProxy['render']>>();

export async function loadPdf(bytes: Uint8Array, password = ''): Promise<pdfjs.PDFDocumentProxy> {
  return pdfjs.getDocument({ data: bytes.slice(), password, useSystemFonts: true }).promise;
}

function guessLabel(text: string, name: string, index: number): string {
  const tokens = text.split(/\s+/).map((t) => t.trim()).filter(Boolean);
  const match = tokens.find((t) => /^[A-Za-z]\d{1,3}$/.test(t));
  if (match) return match.toUpperCase();
  return `${name.replace(/\.pdf$/i, '')}-${index + 1}`;
}

export async function describeSource(id: string, name: string, bytes: Uint8Array, knownLabels?: string[]): Promise<SourceDocument> {
  const pdf = await loadPdf(bytes);
  proxies.set(id, pdf);
  const labels: string[] = [];
  const widths: number[] = [];
  const heights: number[] = [];
  const rotations: number[] = [];
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    widths.push(page.view[2] - page.view[0]);
    heights.push(page.view[3] - page.view[1]);
    rotations.push(page.rotate);
    const text = await page.getTextContent();
    labels.push(guessLabel(text.items.map((item) => ('str' in item ? item.str : '')).join(' '), name, i - 1));
  }
  return { id, name, bytes, pageCount: pdf.numPages, labels: knownLabels ?? labels, widths, heights, rotations };
}

export async function registerProxy(id: string, bytes: Uint8Array): Promise<pdfjs.PDFDocumentProxy> {
  const pdf = await loadPdf(bytes);
  proxies.set(id, pdf);
  return pdf;
}

export function getProxy(sourceId: string): pdfjs.PDFDocumentProxy | undefined {
  return proxies.get(sourceId);
}

export async function renderPage(
  sourceId: string,
  pageIndex: number,
  canvas: HTMLCanvasElement,
  scale = 1,
  options: { deviceScale?: number; cssSize?: boolean } = {},
): Promise<void> {
  const pdf = proxies.get(sourceId);
  if (!pdf) throw new Error('Source is not loaded');
  const page = await pdf.getPage(pageIndex + 1);
  let deviceScale = options.deviceScale ?? (typeof window === 'undefined' ? 1 : (window.devicePixelRatio || 1));
  let viewport = page.getViewport({ scale: scale * deviceScale });
  const maxDimension = 4096;
  if (Math.max(viewport.width, viewport.height) > maxDimension) {
    deviceScale = Math.max(1, Math.min(deviceScale, maxDimension / Math.max(viewport.width / deviceScale, viewport.height / deviceScale)));
    viewport = page.getViewport({ scale: scale * deviceScale });
  }
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable');
  const previous = renderTasks.get(canvas);
  if (previous) previous.cancel();
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  if (options.cssSize !== false) {
    canvas.style.width = `${viewport.width / deviceScale}px`;
    canvas.style.height = `${viewport.height / deviceScale}px`;
  }
  const task = page.render({ canvasContext: context, viewport });
  renderTasks.set(canvas, task);
  try {
    await task.promise;
  } finally {
    if (renderTasks.get(canvas) === task) renderTasks.delete(canvas);
  }
}

export async function pageText(sourceId: string, pageIndex: number): Promise<string> {
  const pdf = proxies.get(sourceId);
  if (!pdf) return '';
  const page = await pdf.getPage(pageIndex + 1);
  const content = await page.getTextContent();
  return content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
}

export type TextInRect = { text: string; baselineX: number; baselineY: number; fontSize: number };

export async function textInRect(sourceId: string, pageIndex: number, rect: Rect): Promise<TextInRect> {
  const empty: TextInRect = { text: '', baselineX: rect.x1, baselineY: rect.y1 + 2, fontSize: 12 };
  const pdf = proxies.get(sourceId);
  if (!pdf) return empty;
  const page = await pdf.getPage(pageIndex + 1);
  const content = await page.getTextContent();
  const inside = content.items.flatMap((item) => {
    if (!('str' in item) || !item.str.trim()) return [];
    const [a, , , d, x, y] = item.transform;
    if (x < rect.x1 - 6 || x > rect.x2 + 6 || y < rect.y1 - 6 || y > rect.y2 + 6) return [];
    return [{ str: item.str, x, y, size: Math.abs(d) || 12, width: Math.abs(a) * item.str.length * 0.6 }];
  });
  inside.sort((left, right) => right.y - left.y || left.x - right.x);
  if (!inside.length) return empty;
  return {
    text: inside.map((item) => item.str).join(' ').trim(),
    baselineX: inside[0]!.x,
    baselineY: inside[0]!.y,
    fontSize: inside[0]!.size,
  };
}

export function releaseSource(sourceId: string): void {
  const pdf = proxies.get(sourceId);
  if (pdf) {
    void pdf.destroy();
    proxies.delete(sourceId);
  }
}
