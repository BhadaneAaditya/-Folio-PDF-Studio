import type {
  CropBox,
  InsertPosition,
  Mark,
  OutputDocument,
  Snapshot,
  SourceDocument,
  TextEdit,
  WorkspaceState,
} from './types';

let counter = 0;
export function uid(prefix: string): string {
  counter += 1;
  return `${prefix}_${counter.toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export const ACCENTS = ['#0a84ff', '#bf5af2', '#30d158', '#ff9f0a', '#ff375f', '#64d2ff', '#ac8e68', '#5e5ce6'];

export function createWorkspace(): WorkspaceState {
  return {
    sources: {},
    pages: {},
    documents: [],
    past: [],
    future: [],
    activeDocumentId: null,
    selectedPageIds: [],
    activePageId: null,
    activeTool: 'select',
    zoom: {},
    scroll: {},
    columnWidths: {},
    editorWidth: 520,
    renderQuality: 2,
    focusedDocId: null,
    editorMaximized: false,
    thumbSizes: {},
  };
}

function takeSnapshot(state: WorkspaceState): Snapshot {
  return structuredClone({ pages: state.pages, documents: state.documents });
}

function commit(state: WorkspaceState, next: Snapshot): WorkspaceState {
  return {
    ...state,
    ...next,
    past: [...state.past, takeSnapshot(state)].slice(-200),
    future: [],
  };
}

/** Import one or more immutable sources, creating one output document per file. */
export function importSources(state: WorkspaceState, sources: SourceDocument[]): WorkspaceState {
  if (sources.length === 0) return state;
  const pages = { ...state.pages };
  const documents = [...state.documents];
  for (const source of sources) {
    const sourceId = source.id;
    const pageIds: string[] = [];
    for (let i = 0; i < source.pageCount; i += 1) {
      const id = uid('page');
      pages[id] = {
        id,
        sourceId,
        sourcePageIndex: i,
        label: source.labels?.[i] ?? `${source.name.replace(/\.pdf$/i, '')}-${i + 1}`,
        width: source.widths?.[i] ?? 612,
        height: source.heights?.[i] ?? 792,
        baseRotation: source.rotations?.[i] ?? 0,
        rotation: 0,
        crop: null,
        marks: [],
        textEdits: [],
      };
      pageIds.push(id);
    }
    documents.push({
      id: uid('doc'),
      name: source.name.replace(/\.pdf$/i, ''),
      originalName: source.name,
      pageIds,
      accent: ACCENTS[documents.length % ACCENTS.length],
    });
  }
  const next = commit(state, { pages, documents });
  return {
    ...next,
    sources: { ...state.sources, ...Object.fromEntries(sources.map((s) => [s.id, s])) },
    activeDocumentId: state.activeDocumentId ?? documents[documents.length - 1]!.id,
  };
}

/** Deterministic insertion index for a document given a before/after/numeric position. */
export function resolveInsertIndex(doc: OutputDocument, pageId: string, position: InsertPosition): number {
  const current = doc.pageIds.indexOf(pageId);
  if (typeof position === 'number') return position;
  if (current === -1) return position === 'before' ? 0 : doc.pageIds.length;
  return position === 'before' ? current : current + 1;
}

function normalizedIndex(doc: OutputDocument, pageId: string, position: InsertPosition): number {
  const raw = resolveInsertIndex(doc, pageId, position);
  return Math.max(0, Math.min(raw, doc.pageIds.length));
}

function withPages(doc: OutputDocument, pageIds: string[]): OutputDocument {
  return { ...doc, pageIds };
}

function replaceDoc(documents: OutputDocument[], doc: OutputDocument): OutputDocument[] {
  return documents.map((d) => (d.id === doc.id ? doc : d));
}

/** Swap two page instances (across documents or within one) as a single operation. */
export function swapPages(
  state: WorkspaceState,
  a: { docId: string; pageId: string },
  b: { docId: string; pageId: string },
): WorkspaceState {
  const docA = state.documents.find((d) => d.id === a.docId);
  const docB = state.documents.find((d) => d.id === b.docId);
  if (!docA || !docB) return state;
  const ia = docA.pageIds.indexOf(a.pageId);
  const ib = docB.pageIds.indexOf(b.pageId);
  if (ia === -1 || ib === -1) return state;
  let documents = state.documents;
  const idsA = [...docA.pageIds];
  const idsB = docA.id === docB.id ? idsA : [...docB.pageIds];
  idsA[ia] = b.pageId;
  idsB[ib] = a.pageId;
  documents = replaceDoc(documents, withPages(docA, idsA));
  if (docA.id !== docB.id) documents = replaceDoc(documents, withPages(docB, idsB));
  return commit(state, { pages: state.pages, documents });
}

/** Move pages between documents (or within one), as a single operation. */
export function movePages(
  state: WorkspaceState,
  args: { pageIds: string[]; fromDocId: string; toDocId: string; anchorPageId: string | null; position: InsertPosition },
): WorkspaceState {
  const from = state.documents.find((d) => d.id === args.fromDocId);
  const to = state.documents.find((d) => d.id === args.toDocId);
  if (!from || !to) return state;
  const moving = args.pageIds.filter((id) => from.pageIds.includes(id));
  if (moving.length === 0) return state;
  const fromIds = from.pageIds.filter((id) => !moving.includes(id));

  let insertAt: number;
  if (!args.anchorPageId) insertAt = to.id === from.id ? fromIds.length : to.pageIds.length;
  else {
    const anchorDoc = to.id === from.id ? { ...to, pageIds: fromIds } : to;
    insertAt = normalizedIndex(anchorDoc, args.anchorPageId, args.position);
  }

  let documents = state.documents;
  if (from.id === to.id) {
    const ids = [...fromIds];
    ids.splice(insertAt, 0, ...moving);
    documents = replaceDoc(documents, withPages(from, ids));
  } else {
    documents = replaceDoc(documents, withPages(from, fromIds));
    const toIds = [...to.pageIds];
    toIds.splice(insertAt, 0, ...moving);
    documents = replaceDoc(documents, withPages(to, toIds));
  }
  return commit(state, { pages: state.pages, documents });
}

/** Copy pages into a destination, minting independent instances with cloned marks. */
export function copyPages(
  state: WorkspaceState,
  args: { pageIds: string[]; fromDocId: string; toDocId: string; anchorPageId: string | null; position: InsertPosition },
): WorkspaceState {
  const from = state.documents.find((d) => d.id === args.fromDocId);
  const to = state.documents.find((d) => d.id === args.toDocId);
  if (!from || !to) return state;
  const copying = args.pageIds.filter((id) => from.pageIds.includes(id));
  if (copying.length === 0) return state;

  const pages = { ...state.pages };
  const newIds = copying.map((id) => {
    const clone = structuredClone(pages[id]!);
    clone.id = uid('page');
    clone.marks = clone.marks.map((m: Mark) => ({ ...structuredClone(m), id: uid('mark') }));
    pages[clone.id] = clone;
    return clone.id;
  });

  const insertAt = args.anchorPageId ? normalizedIndex(to, args.anchorPageId, args.position) : to.pageIds.length;
  const toIds = [...to.pageIds];
  toIds.splice(insertAt, 0, ...newIds);
  const documents = replaceDoc(state.documents, withPages(to, toIds));
  return commit(state, { pages, documents });
}

/** Import a source and place its pages directly into an existing document as one operation. */
export function insertSourcePages(state: WorkspaceState, source: SourceDocument, toDocId: string): WorkspaceState {
  const doc = state.documents.find((d) => d.id === toDocId);
  if (!doc) return state;
  const pages = { ...state.pages };
  const newIds: string[] = [];
  for (let i = 0; i < source.pageCount; i += 1) {
    const id = uid('page');
    pages[id] = {
      id,
      sourceId: source.id,
      sourcePageIndex: i,
      label: source.labels?.[i] ?? `${source.name.replace(/\.(pdf|jpe?g|png)$/i, '')}-${i + 1}`,
      width: source.widths?.[i] ?? 612,
      height: source.heights?.[i] ?? 792,
      baseRotation: source.rotations?.[i] ?? 0,
      rotation: 0,
      crop: null,
      marks: [],
      textEdits: [],
    };
    newIds.push(id);
  }
  if (newIds.length === 0) return state;
  const documents = replaceDoc(state.documents, withPages(doc, [...doc.pageIds, ...newIds]));
  const next = commit(state, { pages, documents });
  return { ...next, sources: { ...state.sources, [source.id]: source } };
}

/** Duplicate pages inside their own document as independent instances. */
export function duplicatePages(state: WorkspaceState, docId: string, pageIds: string[]): WorkspaceState {
  const doc = state.documents.find((d) => d.id === docId);
  if (!doc) return state;
  const chosen = pageIds.filter((id) => doc.pageIds.includes(id));
  if (chosen.length === 0) return state;
  const pages = { ...state.pages };
  const clones = chosen.map((id) => {
    const clone = structuredClone(pages[id]!);
    clone.id = uid('page');
    clone.marks = clone.marks.map((m: Mark) => ({ ...structuredClone(m), id: uid('mark') }));
    pages[clone.id] = clone;
    return clone.id;
  });
  const lastIndex = Math.max(...chosen.map((id) => doc.pageIds.indexOf(id)));
  const ids = [...doc.pageIds];
  ids.splice(lastIndex + 1, 0, ...clones);
  const documents = replaceDoc(state.documents, withPages(doc, ids));
  return commit(state, { pages, documents });
}

export function deletePages(state: WorkspaceState, docId: string, pageIds: string[]): WorkspaceState {
  const doc = state.documents.find((d) => d.id === docId);
  if (!doc) return state;
  const ids = doc.pageIds.filter((id) => !pageIds.includes(id));
  if (ids.length === doc.pageIds.length) return state;
  const documents = replaceDoc(state.documents, withPages(doc, ids));
  return commit(state, { pages: state.pages, documents });
}

export function reverseDocument(state: WorkspaceState, docId: string): WorkspaceState {
  const doc = state.documents.find((d) => d.id === docId);
  if (!doc || doc.pageIds.length < 2) return state;
  const documents = replaceDoc(state.documents, withPages(doc, [...doc.pageIds].reverse()));
  return commit(state, { pages: state.pages, documents });
}

/** Create a new document from copies of selected pages. The source is left intact. */
export function createDocumentFromPages(
  state: WorkspaceState,
  args: { pageIds: string[]; fromDocId: string; name?: string },
): WorkspaceState {
  const from = state.documents.find((d) => d.id === args.fromDocId);
  if (!from) return state;
  const copying = args.pageIds.filter((id) => from.pageIds.includes(id));
  if (copying.length === 0) return state;
  const pages = { ...state.pages };
  const newIds = copying.map((id) => {
    const clone = structuredClone(pages[id]!);
    clone.id = uid('page');
    clone.marks = clone.marks.map((m: Mark) => ({ ...structuredClone(m), id: uid('mark') }));
    pages[clone.id] = clone;
    return clone.id;
  });
  const base = args.name ?? `Pages from ${from.name}`;
  const doc: OutputDocument = {
    id: uid('doc'),
    name: uniqueName(state.documents.map((d) => d.name), base),
    originalName: base,
    pageIds: newIds,
    accent: ACCENTS[state.documents.length % ACCENTS.length],
  };
  return commit(state, { pages, documents: [...state.documents, doc] });
}

export function uniqueName(existing: string[], base: string): string {
  if (!existing.includes(base)) return base;
  let n = 2;
  while (existing.includes(`${base} (${n})`)) n += 1;
  return `${base} (${n})`;
}

export function addMark(state: WorkspaceState, pageId: string, mark: Mark): WorkspaceState {
  if (!state.pages[pageId]) return state;
  const pages = { ...state.pages, [pageId]: { ...state.pages[pageId]!, marks: [...state.pages[pageId]!.marks, mark] } };
  return commit(state, { pages, documents: state.documents });
}

export function removeMark(state: WorkspaceState, pageId: string, markId: string): WorkspaceState {
  const page = state.pages[pageId];
  if (!page) return state;
  const pages = { ...state.pages, [pageId]: { ...page, marks: page.marks.filter((m) => m.id !== markId) } };
  return commit(state, { pages, documents: state.documents });
}

export function addTextEdit(state: WorkspaceState, pageId: string, edit: TextEdit): WorkspaceState {
  const page = state.pages[pageId];
  if (!page) return state;
  const pages = { ...state.pages, [pageId]: { ...page, textEdits: [...page.textEdits, edit] } };
  return commit(state, { pages, documents: state.documents });
}

export function removeTextEdit(state: WorkspaceState, pageId: string, editId: string): WorkspaceState {
  const page = state.pages[pageId];
  if (!page) return state;
  const pages = { ...state.pages, [pageId]: { ...page, textEdits: page.textEdits.filter((edit) => edit.id !== editId) } };
  return commit(state, { pages, documents: state.documents });
}

export function addBlankPage(state: WorkspaceState, docId: string): WorkspaceState {
  const doc = state.documents.find((d) => d.id === docId);
  if (!doc) return state;
  const id = uid('blank');
  const pages = { ...state.pages, [id]: { id, sourceId: '', sourcePageIndex: -1, label: 'Blank', width: 612, height: 792, baseRotation: 0, rotation: 0, crop: null, marks: [], textEdits: [] } };
  const documents = replaceDoc(state.documents, withPages(doc, [...doc.pageIds, id]));
  return commit(state, { pages, documents });
}

/** Structural edits that should not create history entries (view settings, rename, etc.). */
export function patchState(state: WorkspaceState, patch: Partial<WorkspaceState>): WorkspaceState {
  return { ...state, ...patch };
}

export function renameDocument(state: WorkspaceState, docId: string, name: string): WorkspaceState {
  return { ...state, documents: state.documents.map((d) => (d.id === docId ? { ...d, name } : d)) };
}

export function reorderDocuments(state: WorkspaceState, fromIndex: number, toIndex: number): WorkspaceState {
  if (fromIndex === toIndex) return state;
  const documents = [...state.documents];
  const [moved] = documents.splice(fromIndex, 1);
  if (!moved) return state;
  documents.splice(toIndex, 0, moved);
  return { ...state, documents };
}

export function rotatePage(state: WorkspaceState, pageId: string, delta: number): WorkspaceState {
  const page = state.pages[pageId];
  if (!page) return state;
  const pages = { ...state.pages, [pageId]: { ...page, rotation: (page.rotation + delta + 360) % 360 } };
  return commit(state, { pages, documents: state.documents });
}

export function cropPages(state: WorkspaceState, pageIds: string[], crop: CropBox | null): WorkspaceState {
  const pages = { ...state.pages };
  for (const id of pageIds) {
    if (pages[id]) pages[id] = { ...pages[id]!, crop };
  }
  return commit(state, { pages, documents: state.documents });
}

export function setCrop(state: WorkspaceState, pageId: string, crop: CropBox | null): WorkspaceState {
  const page = state.pages[pageId];
  if (!page) return state;
  const pages = { ...state.pages, [pageId]: { ...page, crop } };
  return commit(state, { pages, documents: state.documents });
}

export function closeDocument(state: WorkspaceState, docId: string): WorkspaceState {
  const documents = state.documents.filter((d) => d.id !== docId);
  if (documents.length === state.documents.length) return state;
  const activeDocumentId = state.activeDocumentId === docId ? (documents[0]?.id ?? null) : state.activeDocumentId;
  return { ...state, documents, activeDocumentId };
}

export function undo(state: WorkspaceState): WorkspaceState {
  if (state.past.length === 0) return state;
  const previous = state.past[state.past.length - 1]!;
  return {
    ...state,
    ...structuredClone(previous),
    past: state.past.slice(0, -1),
    future: [takeSnapshot(state), ...state.future].slice(0, 200),
    selectedPageIds: [],
    activePageId: null,
  };
}

export function redo(state: WorkspaceState): WorkspaceState {
  if (state.future.length === 0) return state;
  const next = state.future[0]!;
  return {
    ...state,
    ...structuredClone(next),
    past: [...state.past, takeSnapshot(state)].slice(-200),
    future: state.future.slice(1),
    selectedPageIds: [],
    activePageId: null,
  };
}

/** Used by tests and for portable project round-trips. */
export function serializeWorkspace(state: WorkspaceState) {
  return {
    version: 1,
    sources: state.sources,
    documents: state.documents,
    pages: state.pages,
  };
}
