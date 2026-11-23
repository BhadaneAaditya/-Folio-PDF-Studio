import { PDFDocument } from 'pdf-lib';

/** Wrap a JPG/PNG from the device into a single PDF page, fitted inside Letter size. */
export async function imageFileToPdf(bytes: Uint8Array, mime: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const image = mime.toLowerCase().includes('png') ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  const scale = Math.min(612 / image.width, 792 / image.height, 1);
  const width = Math.max(1, image.width * scale);
  const height = Math.max(1, image.height * scale);
  const page = doc.addPage([width, height]);
  page.drawImage(image, { x: 0, y: 0, width, height });
  doc.setTitle('Image page');
  return doc.save();
}
