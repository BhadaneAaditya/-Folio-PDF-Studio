import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

export async function pageLabels(bytes: Uint8Array): Promise<string[]> {
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
  const labels: string[] = [];
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const tokens = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .flatMap((s) => s.split(/\s+/))
      .map((s) => s.trim())
      .filter(Boolean);
    labels.push(tokens.find((t) => /^[A-D]\d{1,2}$/.test(t)) ?? tokens[0] ?? '');
  }
  await pdf.destroy();
  return labels;
}

export async function allPageText(bytes: Uint8Array): Promise<string[]> {
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
  }
  await pdf.destroy();
  return pages;
}

export async function highlightAnnotations(bytes: Uint8Array): Promise<{ subtype: string; quadPoints?: number[] }[]> {
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
  const page = await pdf.getPage(1);
  const annots = await page.getAnnotations();
  await pdf.destroy();
  return annots.map((a) => ({ subtype: a.subtype, quadPoints: (a as unknown as { quadPoints?: number[] }).quadPoints }));
}
