import { PDFDocument } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Raster compression: pages become JPEG images at the chosen DPI and quality. */
export async function compressRaster(bytes: Uint8Array, dpi: number, quality: number): Promise<Uint8Array> {
  const pdf = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const out = await PDFDocument.create();
  const scale = Math.max(0.2, Math.min(4, dpi / 72));
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is unavailable');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;
    const image = await out.embedJpg(dataUrlToBytes(canvas.toDataURL('image/jpeg', quality)));
    const outputPage = out.addPage([base.width, base.height]);
    outputPage.drawImage(image, { x: 0, y: 0, width: base.width, height: base.height });
  }
  await pdf.destroy();
  return out.save({ useObjectStreams: true });
}
