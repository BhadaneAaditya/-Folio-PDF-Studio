import type { TransferAction, WorkspaceState } from './types';
import {
  addBlankPage,
  addMark,
  addTextEdit,
  closeDocument,
  copyPages,
  createDocumentFromPages,
  createWorkspace,
  cropPages,
  deletePages,
  insertSourcePages,
  duplicatePages,
  importSources,
  movePages,
  patchState,
  redo,
  removeMark,
  removeTextEdit,
  renameDocument,
  reorderDocuments,
  reverseDocument,
  rotatePage,
  setCrop,
  swapPages,
  undo,
} from './workspace';
import type { CropBox, InsertPosition, Mark, SourceDocument, TextEdit } from './types';

export type Action =
  | { type: 'import'; sources: SourceDocument[] }
  | { type: 'swap'; a: { docId: string; pageId: string }; b: { docId: string; pageId: string } }
  | { type: 'move'; pageIds: string[]; fromDocId: string; toDocId: string; anchorPageId: string | null; position: InsertPosition }
  | { type: 'copy'; pageIds: string[]; fromDocId: string; toDocId: string; anchorPageId: string | null; position: InsertPosition }
  | { type: 'createDoc'; pageIds: string[]; fromDocId: string; name?: string }
  | { type: 'duplicate'; docId: string; pageIds: string[] }
  | { type: 'deletePages'; docId: string; pageIds: string[] }
  | { type: 'insertPages'; source: SourceDocument; toDocId: string }
  | { type: 'reverse'; docId: string }
  | { type: 'addMark'; pageId: string; mark: Mark }
  | { type: 'removeMark'; pageId: string; markId: string }
  | { type: 'addTextEdit'; pageId: string; edit: TextEdit }
  | { type: 'removeTextEdit'; pageId: string; editId: string }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'select'; pageIds: string[]; activeId?: string | null }
  | { type: 'toggleSelect'; pageId: string; additive: boolean }
  | { type: 'setActivePage'; pageId: string }
  | { type: 'setActiveDoc'; docId: string }
  | { type: 'setTool'; tool: string }
  | { type: 'setZoom'; docId: string; zoom: number }
  | { type: 'setColumnWidth'; docId: string; width: number }
  | { type: 'setEditorWidth'; width: number }
  | { type: 'setRenderQuality'; quality: number }
  | { type: 'setFocusedDoc'; docId: string | null }
  | { type: 'setEditorMaximized'; value: boolean }
  | { type: 'setThumbSize'; docId: string; size: number }
  | { type: 'renameDoc'; docId: string; name: string }
  | { type: 'reorderDocs'; fromIndex: number; toIndex: number }
  | { type: 'closeDoc'; docId: string }
  | { type: 'rotatePage'; pageId: string; delta: number }
  | { type: 'crop'; pageId: string; crop: CropBox | null }
  | { type: 'cropPages'; pageIds: string[]; crop: CropBox | null }
  | { type: 'addBlank'; docId: string }
  | { type: 'patch'; patch: Partial<WorkspaceState> }
  | { type: 'replace'; state: WorkspaceState };

function sanitize(state: WorkspaceState): WorkspaceState {
  const selectedPageIds = state.selectedPageIds.filter((id) => Boolean(state.pages[id]));
  const activePageId = state.activePageId && state.pages[state.activePageId] ? state.activePageId : null;
  const activeDocumentId =
    state.activeDocumentId && state.documents.some((d) => d.id === state.activeDocumentId)
      ? state.activeDocumentId
      : (state.documents[0]?.id ?? null);
  if (
    selectedPageIds.length === state.selectedPageIds.length &&
    activePageId === state.activePageId &&
    activeDocumentId === state.activeDocumentId
  ) return state;
  return { ...state, selectedPageIds, activePageId, activeDocumentId };
}

export function reducer(state: WorkspaceState, action: Action): WorkspaceState {
  switch (action.type) {
    case 'import':
      return sanitize(importSources(state, action.sources));
    case 'swap':
      return sanitize(swapPages(state, action.a, action.b));
    case 'move':
      return sanitize(movePages(state, action));
    case 'copy':
      return sanitize(copyPages(state, action));
    case 'createDoc':
      return sanitize(createDocumentFromPages(state, action));
    case 'duplicate':
      return sanitize(duplicatePages(state, action.docId, action.pageIds));
    case 'deletePages':
      return sanitize(deletePages(state, action.docId, action.pageIds));
    case 'insertPages':
      return sanitize(insertSourcePages(state, action.source, action.toDocId));
    case 'reverse':
      return sanitize(reverseDocument(state, action.docId));
    case 'addMark': {
      const next = addMark(state, action.pageId, action.mark);
      return { ...next, activePageId: action.pageId, activeTool: 'select' };
    }
    case 'removeMark':
      return removeMark(state, action.pageId, action.markId);
    case 'addTextEdit':
      return addTextEdit(state, action.pageId, action.edit);
    case 'removeTextEdit':
      return removeTextEdit(state, action.pageId, action.editId);
    case 'undo':
      return sanitize(undo(state));
    case 'redo':
      return sanitize(redo(state));
    case 'select':
      return { ...state, selectedPageIds: action.pageIds, activePageId: action.activeId ?? action.pageIds[0] ?? null };
    case 'toggleSelect': {
      const exists = state.selectedPageIds.includes(action.pageId);
      if (!action.additive) return { ...state, selectedPageIds: [action.pageId], activePageId: action.pageId };
      return {
        ...state,
        selectedPageIds: exists ? state.selectedPageIds.filter((id) => id !== action.pageId) : [...state.selectedPageIds, action.pageId],
        activePageId: exists ? state.activePageId : action.pageId,
      };
    }
    case 'setActivePage':
      return { ...state, activePageId: action.pageId };
    case 'setActiveDoc':
      return { ...state, activeDocumentId: action.docId };
    case 'setTool':
      return { ...state, activeTool: action.tool };
    case 'setZoom':
      return { ...state, zoom: { ...state.zoom, [action.docId]: action.zoom } };
    case 'setColumnWidth':
      return { ...state, columnWidths: { ...state.columnWidths, [action.docId]: Math.max(160, Math.min(640, action.width)) } };
    case 'setEditorWidth':
      return { ...state, editorWidth: Math.max(320, Math.min(900, action.width)) };
    case 'setRenderQuality':
      return { ...state, renderQuality: action.quality === 2 ? 2 : 1 };
    case 'setFocusedDoc':
      return { ...state, focusedDocId: action.docId, activeDocumentId: action.docId ?? state.activeDocumentId };
    case 'setEditorMaximized':
      return { ...state, editorMaximized: action.value };
    case 'setThumbSize':
      return { ...state, thumbSizes: { ...state.thumbSizes, [action.docId]: Math.max(80, Math.min(320, action.size)) } };
    case 'renameDoc':
      return renameDocument(state, action.docId, action.name);
    case 'reorderDocs':
      return reorderDocuments(state, action.fromIndex, action.toIndex);
    case 'closeDoc':
      return sanitize(closeDocument(state, action.docId));
    case 'rotatePage':
      return rotatePage(state, action.pageId, action.delta);
    case 'crop':
      return setCrop(state, action.pageId, action.crop);
    case 'cropPages':
      return sanitize(cropPages(state, action.pageIds, action.crop));
    case 'addBlank':
      return sanitize(addBlankPage(state, action.docId));
    case 'patch':
      return patchState(state, action.patch);
    case 'replace':
      return sanitize(action.state);
    default:
      return state;
  }
}

export type { TransferAction };
export { createWorkspace };
