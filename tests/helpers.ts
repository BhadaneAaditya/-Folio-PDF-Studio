import { PDFDocument } from 'pdf-lib';
import type { SourceDocument } from '../src/core/types';

export async function sourceFromBytes(
  id: string,
  name: string,
  bytes: Uint8Array,
  labels?: string[],
): Promise<SourceDocument> {
  const pdf = await PDFDocument.load(bytes);
  const widths: number[] = [];
  const heights: number[] = [];
  const rotations: number[] = [];
  for (let i = 0; i < pdf.getPageCount(); i += 1) {
    const page = pdf.getPage(i);
    widths.push(page.getWidth());
    heights.push(page.getHeight());
    rotations.push(page.getRotation().angle);
  }
  return { id, name, bytes, pageCount: pdf.getPageCount(), labels, widths, heights, rotations };
}
