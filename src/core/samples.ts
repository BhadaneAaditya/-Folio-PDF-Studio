import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { RGB, Rect } from './types';

export const SAMPLE_LETTERS = ['A', 'B', 'C', 'D'] as const;

const COLORS: Record<string, RGB> = {
  A: [0.04, 0.52, 1],
  B: [0.75, 0.36, 0.95],
  C: [0.18, 0.82, 0.38],
  D: [1, 0.62, 0.05],
};

/** The on-page rectangle where a sample label is drawn (PDF page coordinates). */
export function sampleLabelRect(label: string): Rect {
  return { x1: 62, y1: 668, x2: 62 + label.length * 48 + 12, y2: 758 };
}

export async function createSamplePdf(letter: string, pages = 2, accent?: RGB): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const color = accent ?? COLORS[letter] ?? [0.2, 0.2, 0.2];

  for (let i = 1; i <= pages; i += 1) {
    const label = `${letter}${i}`;
    const page = doc.addPage([612, 792]);
    page.drawRectangle({ x: 0, y: 740, width: 612, height: 52, color: rgb(color[0], color[1], color[2]) });
    page.drawRectangle({ x: 36, y: 36, width: 540, height: 680, borderColor: rgb(0.85, 0.85, 0.87), borderWidth: 1 });

    page.drawText(label, { x: 72, y: 680, size: 72, font: bold, color: rgb(0.1, 0.1, 0.12) });
    page.drawText('FOLIO SAMPLE DOCUMENT', { x: 74, y: 626, size: 18, font: bold, color: rgb(color[0], color[1], color[2]) });
    page.drawText(`Document ${letter}  -  Page ${i} of ${pages}`, { x: 74, y: 596, size: 13, font: regular, color: rgb(0.35, 0.35, 0.38) });
    page.drawText('This text is selectable and searchable.', { x: 74, y: 574, size: 11, font: regular, color: rgb(0.45, 0.45, 0.48) });

  }

  doc.setTitle(`Folio sample ${letter}`);
  doc.setSubject('Sample PDF for the multi-document acceptance test');
  doc.setProducer('Folio PDF Studio');
  return doc.save();
}

export async function createAllSamples(): Promise<{ name: string; bytes: Uint8Array; labels: string[] }[]> {
  return Promise.all(
    SAMPLE_LETTERS.map(async (letter) => ({
      name: `${letter}.pdf`,
      bytes: await createSamplePdf(letter),
      labels: ['1', '2'].map((n) => `${letter}${n}`),
    })),
  );
}
