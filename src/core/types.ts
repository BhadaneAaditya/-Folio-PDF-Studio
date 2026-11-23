/** Core workspace model. Sources are immutable; pages are placed instances with stable IDs. */

export type RGB = [number, number, number];

export type Rect = { x1: number; y1: number; x2: number; y2: number };

export type CropBox = { left: number; bottom: number; right: number; top: number };

export type HighlightMark = {
  id: string;
  kind: 'highlight';
  rect: Rect;
  color: RGB;
  opacity: number;
  text?: string;
};

export type TextEdit = {
  id: string;
  rect: Rect;
  original: string;
  replacement: string;
  fontSize: number;
  color: RGB;
  baselineX?: number;
  baselineY?: number;
};

export type Mark = HighlightMark;

/** Immutable imported source PDF. Bytes are never mutated. */
export type SourceDocument = {
  id: string;
  name: string;
  bytes: Uint8Array;
  pageCount: number;
  labels?: string[];
  widths?: number[];
  heights?: number[];
  rotations?: number[];
};

/** One placed occurrence of a source page. Moving keeps the id; copying mints a new one. */
export type PageInstance = {
  id: string;
  sourceId: string;
  sourcePageIndex: number;
  label: string;
  width: number;
  height: number;
  baseRotation: number;
  rotation: number;
  crop: CropBox | null;
  marks: Mark[];
  textEdits: TextEdit[];
};

export type OutputDocument = {
  id: string;
  name: string;
  pageIds: string[];
  accent: string;
  originalName: string;
};

/** The part of workspace state that participates in undo/redo history. */
export type Snapshot = {
  pages: Record<string, PageInstance>;
  documents: OutputDocument[];
};

export type WorkspaceState = Snapshot & {
  sources: Record<string, SourceDocument>;
  past: Snapshot[];
  future: Snapshot[];
  activeDocumentId: string | null;
  selectedPageIds: string[];
  activePageId: string | null;
  activeTool: string;
  zoom: Record<string, number>;
  scroll: Record<string, number>;
  columnWidths: Record<string, number>;
  editorWidth: number;
  renderQuality: number;
  focusedDocId: string | null;
  editorMaximized: boolean;
  thumbSizes: Record<string, number>;
};

export type InsertPosition = 'before' | 'after' | number;

export type TransferAction = 'move' | 'copy' | 'swap';
