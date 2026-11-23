import { useRef, useState } from 'react';
import type { Action } from '../core/store';
import type { OutputDocument, PageInstance, WorkspaceState } from '../core/types';
import { describeSource } from '../core/pdfjs';
import { imageFileToPdf } from '../core/importPages';
import { uid } from '../core/workspace';
import { Thumbnail } from './Thumbnail';

export type DragPayload = { pageIds: string[]; fromDocId: string };

type Props = {
  doc: OutputDocument;
  state: WorkspaceState;
  dispatch: React.Dispatch<Action>;
  focusedPageId: string | null;
  marker: { docId: string; index: number } | null;
  setMarker: (value: { docId: string; index: number } | null) => void;
  onDragPayload: () => DragPayload | null;
  onDragStartPayload: (payload: DragPayload) => void;
  onDropPages: (payload: DragPayload, toDocId: string, anchorPageId: string | null, position: 'before' | 'after') => void;
  width: number;
  onResize: (width: number) => void;
  thumbSize: number;
  onThumbSize: (size: number) => void;
};

export function Column({ doc, state, dispatch, focusedPageId, marker, setMarker, onDragPayload, onDragStartPayload, onDropPages, width, onResize, thumbSize, onThumbSize }: Props) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(doc.name);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedCount = doc.pageIds.filter((id) => state.selectedPageIds.includes(id)).length;
  const isActive = state.activeDocumentId === doc.id;
  const dirty = doc.pageIds.some((id) => state.pages[id]?.marks.length || state.pages[id]?.rotation || state.pages[id]?.crop);

  const handleDragOverThumb = (event: React.DragEvent, index: number) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    setMarker({ docId: doc.id, index: after ? index + 1 : index });
  };

  const handleDropThumb = (event: React.DragEvent) => {
    event.preventDefault();
    const payload = onDragPayload();
    const currentMarker = marker;
    if (payload && currentMarker?.docId === doc.id) {
      const anchor = currentMarker.index >= doc.pageIds.length ? null : (doc.pageIds[currentMarker.index] ?? null);
      onDropPages(payload, doc.id, anchor, 'before');
    }
    setMarker(null);
  };

  const handleDropColumn = (event: React.DragEvent) => {
    event.preventDefault();
    const payload = onDragPayload();
    if (payload) onDropPages(payload, doc.id, null, 'after');
    setMarker(null);
  };

  const commitName = () => {
    const name = draftName.trim();
    if (name && name !== doc.name) dispatch({ type: 'renameDoc', docId: doc.id, name });
    else setDraftName(doc.name);
    setEditing(false);
  };

  const addFromDevice = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      try {
        const raw = new Uint8Array(await file.arrayBuffer());
        const isImage = /^image\/(png|jpe?g)$/i.test(file.type);
        const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
        if (!isImage && !isPdf) continue;
        const bytes = isImage ? await imageFileToPdf(raw, file.type) : raw;
        const source = await describeSource(uid('src'), isImage ? `${file.name.replace(/\.[^.]+$/, '')}.pdf` : file.name, bytes);
        dispatch({ type: 'insertPages', source, toDocId: doc.id });
      } catch (error) {
        console.error('Could not add page from device', error);
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <section
      className={`column${isActive ? ' is-active' : ''}${marker?.docId === doc.id ? ' is-drop' : ''}${state.focusedDocId === doc.id ? ' is-focused-col' : ''}`}
      style={{ flexBasis: width, width }}
      aria-label={`Document ${doc.name}, ${doc.pageIds.length} pages`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDropColumn}
    >
      <div
        className="column-resize"
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize ${doc.name} column`}
        tabIndex={0}
        onPointerDown={(event) => {
          event.preventDefault();
          const startX = event.clientX;
          const startWidth = width;
          const move = (pointer: PointerEvent) => onResize(startWidth + (pointer.clientX - startX));
          const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') { event.preventDefault(); onResize(width - 20); }
          if (event.key === 'ArrowRight') { event.preventDefault(); onResize(width + 20); }
        }}
      />
      <header className="column-header">
        <div className="column-title-row">
          <span className="column-dot" style={{ background: doc.accent }} />
          {editing ? (
            <input
              className="column-name"
              value={draftName}
              autoFocus
              aria-label="Document name"
              onChange={(event) => setDraftName(event.target.value)}
              onBlur={commitName}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitName();
                if (event.key === 'Escape') { setDraftName(doc.name); setEditing(false); }
              }}
            />
          ) : (
            <button
              className="column-name"
              style={{ textAlign: 'left', cursor: 'text' }}
              onDoubleClick={() => setEditing(true)}
              onClick={() => dispatch({ type: 'setActiveDoc', docId: doc.id })}
              title="Double-click to rename"
            >
              {doc.name}
            </button>
          )}
          <button className="btn btn-quiet btn-icon btn-sm" aria-label={`Rename ${doc.name}`} onClick={() => setEditing(true)}>✎</button>
          <button className="btn btn-quiet btn-icon btn-sm" aria-label={`Close ${doc.name}`} onClick={() => dispatch({ type: 'closeDoc', docId: doc.id })}>×</button>
        </div>
        <div className="column-meta">
          <span className="badge">{doc.pageIds.length} {doc.pageIds.length === 1 ? 'page' : 'pages'}</span>
          {selectedCount > 0 && <span className="badge">{selectedCount} selected</span>}
          {dirty && <span className="badge dirty">Edited</span>}
          <span style={{ marginLeft: 8, display: 'flex', alignItems: 'center', gap: 2 }} title="Page preview size">
            <button className="btn btn-quiet btn-icon btn-sm" aria-label="Make thumbnails smaller" onClick={() => onThumbSize(thumbSize - 20)}>−</button>
            <span className="badge">{thumbSize}px</span>
            <button className="btn btn-quiet btn-icon btn-sm" aria-label="Make thumbnails larger" onClick={() => onThumbSize(thumbSize + 20)}>+</button>
          </span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
            <button
              className="btn btn-quiet btn-icon btn-sm"
              aria-label={state.focusedDocId === doc.id ? `Restore column ${doc.name}` : `Maximize column ${doc.name}`}
              title={state.focusedDocId === doc.id ? 'Restore columns' : 'Maximize this column'}
              onClick={() => dispatch({ type: 'setFocusedDoc', docId: state.focusedDocId === doc.id ? null : doc.id })}
            >{state.focusedDocId === doc.id ? '⤡' : '⤢'}</button>
            <button className="btn btn-quiet btn-icon btn-sm" aria-label="Move column left" onClick={() => dispatch({ type: 'reorderDocs', fromIndex: state.documents.indexOf(doc), toIndex: Math.max(0, state.documents.indexOf(doc) - 1) })}>‹</button>
            <button className="btn btn-quiet btn-icon btn-sm" aria-label="Move column right" onClick={() => dispatch({ type: 'reorderDocs', fromIndex: state.documents.indexOf(doc), toIndex: Math.min(state.documents.length - 1, state.documents.indexOf(doc) + 1) })}>›</button>
          </span>
        </div>
      </header>

      <div className="page-list" role="list">
        {doc.pageIds.length === 0 && <div className="column-empty">Empty document — drop pages here or add a blank page.</div>}
        {doc.pageIds.map((pageId, index) => {
          const page = state.pages[pageId] as PageInstance | undefined;
          if (!page) return null;
          return (
            <div key={pageId} role="listitem" className="page-item">
              {marker?.docId === doc.id && marker.index === index && <div className="insert-marker" aria-hidden="true" />}
              <button
                className="page-delete page-maximize"
                aria-label={`Maximize ${page.label}`}
                title="Maximize this page"
                onClick={() => {
                  dispatch({ type: 'select', pageIds: [pageId], activeId: pageId });
                  dispatch({ type: 'setEditorMaximized', value: true });
                }}
              >⤢</button>
              <button
                className="page-delete"
                aria-label={`Remove ${page.label}`}
                title="Delete page"
                onClick={() => dispatch({ type: 'deletePages', docId: doc.id, pageIds: [pageId] })}
              >×</button>
              <Thumbnail
                page={page}
                selected={state.selectedPageIds.includes(pageId)}
                focused={focusedPageId === pageId}
                onSelect={(event) => {
                  const additive = event.metaKey || event.ctrlKey || event.shiftKey;
                  dispatch({ type: 'toggleSelect', pageId, additive });
                  dispatch({ type: 'setActiveDoc', docId: doc.id });
                }}
                onDragStart={(event) => {
                  const payload: DragPayload = {
                    fromDocId: doc.id,
                    pageIds: state.selectedPageIds.includes(pageId) ? state.selectedPageIds.filter((id) => doc.pageIds.includes(id)) : [pageId],
                  };
                  event.dataTransfer.setData('application/x-folio-pages', JSON.stringify(payload));
                  event.dataTransfer.effectAllowed = 'move';
                  onDragStartPayload(payload);
                }}
                onDragOver={(event) => handleDragOverThumb(event, index)}
                onDrop={handleDropThumb}
                size={thumbSize}
              />
            </div>
          );
        })}
        {marker?.docId === doc.id && marker.index >= doc.pageIds.length && doc.pageIds.length > 0 && (
          <div className="insert-marker" aria-hidden="true" />
        )}
      </div>
      <div className="column-actions">
        <button className="btn btn-quiet btn-sm" onClick={() => dispatch({ type: 'addBlank', docId: doc.id })}>+ Blank page</button>
        <button className="btn btn-quiet btn-sm" onClick={() => fileInputRef.current?.click()}>From device</button>
        <button
          className="btn btn-sm"
          disabled={selectedCount === 0}
          title="Delete selected pages"
          onClick={() => dispatch({ type: 'deletePages', docId: doc.id, pageIds: state.selectedPageIds.filter((id) => doc.pageIds.includes(id)) })}
        >Delete{selectedCount ? ` (${selectedCount})` : ''}</button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,application/pdf,.pdf"
          multiple
          className="sr-only"
          aria-label={`Choose files for column ${doc.name}`}
          onChange={(event) => void addFromDevice(event.target.files)}
        />
      </div>
    </section>
  );
}
