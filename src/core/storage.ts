import { openDB, type IDBPDatabase } from 'idb';
import type { SourceDocument, WorkspaceState } from './types';
import { serializeWorkspace } from './workspace';

const DB_NAME = 'folio-pdf-studio';
const STORE = 'drafts';
const KEY = 'current';

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE);
      },
    });
  }
  return dbPromise;
}

type Serialized = ReturnType<typeof serializeWorkspace>;
export type StoredDraft = Serialized & {
  activeDocumentId?: string | null;
  selectedPageIds?: string[];
  activePageId?: string | null;
  activeTool?: string;
  zoom?: Record<string, number>;
  columnWidths?: Record<string, number>;
  editorWidth?: number;
  renderQuality?: number;
  focusedDocId?: string | null;
  editorMaximized?: boolean;
  thumbSizes?: Record<string, number>;
};
type PortableSource = Omit<SourceDocument, 'bytes'> & { bytes: string };
type PortableProject = Omit<Serialized, 'sources'> & { sources: PortableSource[] };

export async function saveDraft(state: WorkspaceState): Promise<void> {
  const database = await db();
  const payload: StoredDraft = {
    ...serializeWorkspace(state),
    activeDocumentId: state.activeDocumentId,
    selectedPageIds: state.selectedPageIds,
    activePageId: state.activePageId,
    activeTool: state.activeTool,
    zoom: state.zoom,
    columnWidths: state.columnWidths,
    editorWidth: state.editorWidth,
    renderQuality: state.renderQuality,
    focusedDocId: state.focusedDocId,
    editorMaximized: state.editorMaximized,
    thumbSizes: state.thumbSizes,
  };
  await database.put(STORE, payload, KEY);
}

export async function loadDraft(): Promise<StoredDraft | undefined> {
  const database = await db();
  return database.get(STORE, KEY) as Promise<StoredDraft | undefined>;
}

export async function clearDraft(): Promise<void> {
  const database = await db();
  await database.delete(STORE, KEY);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function exportProject(state: WorkspaceState): string {
  const data = serializeWorkspace(state);
  const portable: PortableProject = {
    version: data.version,
    pages: data.pages,
    documents: data.documents,
    sources: Object.values(data.sources).map((s) => ({ ...s, bytes: bytesToBase64(s.bytes) })),
  };
  return JSON.stringify(portable);
}

export function importProject(json: string): StoredDraft {
  const parsed = JSON.parse(json) as PortableProject;
  return {
    version: parsed.version,
    pages: parsed.pages,
    documents: parsed.documents,
    sources: Object.fromEntries(parsed.sources.map((s) => [s.id, { ...s, bytes: base64ToBytes(s.bytes) }])),
  };
}
