import {
  PDFArray,
  PDFDict,
  PDFName,
  PDFRawStream,
  PDFRef,
  StandardFonts,
  decodePDFRawStream,
  rgb,
  type PDFDocument,
  type PDFPage,
} from 'pdf-lib';
import type { Rect, TextEdit } from './types';

type Token = { text: string; kind: 'string' | 'name' | 'number' | 'array' | 'dict' | 'op'; value?: string };

function decodeBytes(bytes: Uint8Array): string {
  let result = '';
  for (let i = 0; i < bytes.length; i += 1) result += String.fromCharCode(bytes[i]!);
  return result;
}

function encodeString(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i += 1) bytes[i] = value.charCodeAt(i) & 0xff;
  return bytes;
}

function decodeLiteral(raw: string): string {
  return raw.replace(/\\([nrtbf()\\])/g, (_match, group: string) => {
    const map: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' };
    return map[group] ?? group;
  });
}

function decodeHex(raw: string): string {
  const clean = raw.replace(/[^0-9a-f]/gi, '');
  let result = '';
  for (let i = 0; i + 1 < clean.length; i += 2) result += String.fromCharCode(parseInt(clean.slice(i, i + 2), 16));
  return result;
}

function isDelimiter(char: string): boolean {
  return /[\s()<>\[\]{}%\/]/.test(char);
}

export function tokenize(content: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < content.length) {
    const char = content[i]!;
    if (/\s/.test(char)) { i += 1; continue; }
    if (char === '%') { while (i < content.length && content[i] !== '\n') i += 1; continue; }
    if (char === '(') {
      const start = i;
      let depth = 1;
      i += 1;
      while (i < content.length && depth > 0) {
        if (content[i] === '\\') { i += 2; continue; }
        if (content[i] === '(') depth += 1;
        else if (content[i] === ')') depth -= 1;
        i += 1;
      }
      tokens.push({ text: content.slice(start, i), kind: 'string', value: decodeLiteral(content.slice(start + 1, i - 1)) });
      continue;
    }
    if (char === '<') {
      if (content[i + 1] === '<') {
        const start = i;
        let depth = 1;
        i += 2;
        while (i < content.length && depth > 0) {
          if (content.slice(i, i + 2) === '<<') { depth += 1; i += 2; }
          else if (content.slice(i, i + 2) === '>>') { depth -= 1; i += 2; }
          else i += 1;
        }
        tokens.push({ text: content.slice(start, i), kind: 'dict' });
        continue;
      }
      const end = content.indexOf('>', i + 1);
      if (end < 0) { i += 1; continue; }
      const raw = content.slice(i, end + 1);
      tokens.push({ text: raw, kind: 'string', value: decodeHex(content.slice(i + 1, end)) });
      i = end + 1;
      continue;
    }
    if (char === '[') {
      const start = i;
      let depth = 1;
      i += 1;
      while (i < content.length && depth > 0) {
        if (content[i] === '[') depth += 1;
        else if (content[i] === ']') depth -= 1;
        i += 1;
      }
      const raw = content.slice(start, i);
      const strings = [...raw.matchAll(/<([0-9a-f\s]*)>|\(((?:\\.|[^\\()])*)\)/gi)]
        .map((match) => (match[1] !== undefined ? decodeHex(match[1]) : decodeLiteral(match[2] ?? '')));
      tokens.push({ text: raw, kind: 'array', value: strings.join('') });
      continue;
    }
    if (char === '/') {
      const start = i;
      i += 1;
      while (i < content.length && !isDelimiter(content[i]!)) i += 1;
      tokens.push({ text: content.slice(start, i), kind: 'name', value: content.slice(start + 1, i) });
      continue;
    }
    const start = i;
    while (i < content.length && !isDelimiter(content[i]!)) i += 1;
    const text = content.slice(start, i);
    if (!text) { i += 1; continue; }
    tokens.push({ text, kind: /^-?(\d|\.)/.test(text) ? 'number' : 'op' });
  }
  return tokens;
}

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function matches(text: string, x: number, y: number, edit: TextEdit): boolean {
  const sameText = normalize(text) === normalize(edit.original);
  const inRect = x >= edit.rect.x1 - 30 && x <= edit.rect.x2 + 30 && y >= edit.rect.y1 - 30 && y <= edit.rect.y2 + 30;
  if (!edit.original) return inRect;
  return sameText && inRect;
}

/** Remove text-showing operators for the target edits; keep all other vector content intact. */
export function rewriteContent(content: string, edits: TextEdit[]): { content: string; removed: number[] } {
  if (edits.length === 0) return { content, removed: [] };
  const tokens = tokenize(content);
  const removed = edits.map(() => 0);
  const deleteTokens = new Set<number>();
  let operands: number[] = [];
  let tx = 0;
  let ty = 0;

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]!;
    if (token.kind !== 'op') { operands.push(i); continue; }
    const op = token.text;
    const operandText = (index: number) => tokens[operands[index]!]?.text ?? '';
    if (op === 'Tm' && operands.length >= 6) {
      tx = Number(operandText(operands.length - 2));
      ty = Number(operandText(operands.length - 1));
    } else if ((op === 'Td' || op === 'TD') && operands.length >= 2) {
      tx += Number(operandText(operands.length - 2));
      ty += Number(operandText(operands.length - 1));
    } else if (op === 'T*') {
      ty -= 14;
    } else if (op === 'Tj' || op === 'TJ' || op === "'" || op === '"') {
      const text = operands
        .map((index) => tokens[index]!)
        .filter((item) => item.kind === 'string' || item.kind === 'array')
        .map((item) => item.value ?? '')
        .join('');
      edits.forEach((edit, editIndex) => {
        if (matches(text, tx, ty, edit)) {
          operands.forEach((index) => deleteTokens.add(index));
          deleteTokens.add(i);
          removed[editIndex] += 1;
        }
      });
    } else if (op === 'BT' || op === 'ET') {
      if (op === 'ET') { tx = 0; ty = 0; }
    }
    operands = [];
  }
  return {
    content: tokens.filter((_token, index) => !deleteTokens.has(index)).map((token) => token.text).join(' '),
    removed,
  };
}

function pageStreams(doc: PDFDocument, page: PDFPage): { ref: PDFRef; stream: PDFRawStream }[] {
  const contents = page.node.Contents();
  if (!contents) return [];
  const entries = contents instanceof PDFArray ? contents.asArray() : [contents];
  const result: { ref: PDFRef; stream: PDFRawStream }[] = [];
  for (const entry of entries) {
    if (!(entry instanceof PDFRef)) continue;
    const object = doc.context.lookup(entry);
    if (object instanceof PDFRawStream) result.push({ ref: entry, stream: object });
  }
  return result;
}

function replaceStream(doc: PDFDocument, page: PDFPage, ref: PDFRef, dict: PDFDict, bytes: Uint8Array): void {
  const newRef = doc.context.register(PDFRawStream.of(dict, bytes));
  const contents = page.node.Contents();
  if (contents instanceof PDFArray) {
    const index = contents.asArray().findIndex((entry) => entry === ref);
    if (index >= 0) contents.set(index, newRef);
    else contents.push(newRef);
  } else {
    page.node.set(PDFName.of('Contents'), newRef);
  }
}

export type TextEditResult = { applied: number; removed: number[]; warnings: string[] };

export async function applyTextEdits(doc: PDFDocument, page: PDFPage, edits: TextEdit[]): Promise<TextEditResult> {
  const result: TextEditResult = { applied: 0, removed: edits.map(() => 0), warnings: [] };
  if (edits.length === 0) return result;

  const streams = pageStreams(doc, page);
  if (streams.length === 0) {
    result.warnings = ['This page has no editable text stream.'];
    return result;
  }
  const content = streams.map(({ stream }) => decodeBytes(decodePDFRawStream(stream).decode())).join('\n');
  const rewritten = rewriteContent(content, edits);
  result.removed = rewritten.removed;

  streams.forEach(({ ref, stream }, index) => {
    const dict = stream.dict.clone();
    dict.delete(PDFName.of('Filter'));
    dict.delete(PDFName.of('DecodeParms'));
    replaceStream(doc, page, ref, dict, index === 0 ? encodeString(rewritten.content) : new Uint8Array());
  });

  edits.forEach((edit, index) => {
    if (rewritten.removed[index] === 0) {
      result.warnings.push(`"${edit.original}" was not found on this page — the original text may use an unsupported encoding.`);
      return;
    }
    result.applied += 1;
  });

  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const edit of edits) {
    const width = edit.rect.x2 - edit.rect.x1;
    const naturalWidth = font.widthOfTextAtSize(edit.replacement, edit.fontSize);
    const size = naturalWidth > width && naturalWidth > 0 ? Math.max(4, (edit.fontSize * width) / naturalWidth) : edit.fontSize;
    page.drawText(edit.replacement, {
      x: edit.baselineX ?? edit.rect.x1 + 1,
      y: edit.baselineY ?? edit.rect.y1 + 2,
      size,
      font,
      color: rgb(edit.color[0], edit.color[1], edit.color[2]),
    });
  }
  return result;
}

export function estimateTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.52;
}

export function isInside(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x1 && x <= rect.x2 && y >= rect.y1 && y <= rect.y2;
}
