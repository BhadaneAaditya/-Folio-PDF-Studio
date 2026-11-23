import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import JSZip from 'jszip';
import { Column, type DragPayload } from './components/Column';
import { EditorPane } from './components/EditorPane';
import { EmptyState } from './components/EmptyState';
import { CompressionDialog, CropDialog, ExportDialog, ShortcutsDialog, TextEditDialog, ToolsMenu, type TextDraft } from './components/Dialogs';
import { PagesMenu, SearchPanel } from './components/Panels';
import { TransferPanel } from './components/TransferPanel';
import { createWorkspace, reducer } from './core/store';
import { describeSource, pageText } from './core/pdfjs';
import { createAllSamples } from './core/samples';
import { buildAllExports, buildPdfForPageIds, type ExportItem } from './core/exportPdf';
import { applyExportCompression, type ExportCompression } from './core/compress';
import { compressRaster } from './core/compressRaster';
import { downloadBytes } from './core/download';
import { clearDraft, exportProject, importProject, loadDraft, saveDraft } from './core/storage';
import type { SourceDocument, TransferAction, WorkspaceState } from './core/types';
import { uid } from './core/workspace';

export default function App() {
  const [state, dispatch] = useReducer(reducer, createWorkspace());
  const [focusedPageId, setFocusedPageId] = useState<string | null>(null);
  const [marker, setMarker] = useState<{ docId: string; index: number } | null>(null);
  const [preset, setPreset] = useState<TransferAction>('move');
  const [toast, setToast] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [exportItems, setExportItems] = useState<ExportItem[] | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [showProject, setShowProject] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showPages, setShowPages] = useState(false);
  const [showCrop, setShowCrop] = useState(false);
  const [showCompress, setShowCompress] = useState(false);
  const [textDraft, setTextDraft] = useState<{ pageId: string; draft: TextDraft } | null>(null);
  const [toolQuery, setToolQuery] = useState('');
  const [hasDraft, setHasDraft] = useState(false);
  const dragPayloadRef = useRef<DragPayload | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  const announce = useCallback((message: string) => setAnnouncement(message), []);

  useEffect(() => {
    void loadDraft().then((draft) => setHasDraft(Boolean(draft)));
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        dispatch({ type: event.shiftKey ? 'redo' : 'undo' });
        announce(event.shiftKey ? 'Redone' : 'Undone');
        return;
      }
      if (mod) return;

      const allPages = state.documents.flatMap((doc) => doc.pageIds);
      const focusIndex = focusedPageId ? allPages.indexOf(focusedPageId) : -1;
      switch (event.key) {
        case 'o': case 'O':
          event.preventDefault();
          fileInputRef.current?.click();
          break;
        case 's': case 'S':
          if (!state.documents.length) { event.preventDefault(); void loadSamples(); }
          break;
        case 'm': case 'M':
          event.preventDefault(); setPreset('move'); showToast('Move: choose a destination and press Move.');
          break;
        case 'c': case 'C':
          event.preventDefault(); setPreset('copy'); showToast('Copy: choose a destination and press Copy.');
          break;
        case 'x': case 'X':
          event.preventDefault(); setPreset('swap'); showToast('Swap: choose a target and press Swap.');
          break;
        case 'e': case 'E':
          if (state.documents.length) { event.preventDefault(); void openExport(); }
          break;
        case 'f': case 'F':
          if (state.documents.length) { event.preventDefault(); setShowSearch(true); }
          break;
        case '?':
          event.preventDefault(); setShowShortcuts(true);
          break;
        case 'ArrowDown': case 'ArrowUp': {
          if (!allPages.length) break;
          event.preventDefault();
          const delta = event.key === 'ArrowDown' ? 1 : -1;
          const next = Math.max(0, Math.min(allPages.length - 1, focusIndex + delta));
          const id = allPages[next]!;
          setFocusedPageId(id);
          document.querySelector<HTMLButtonElement>(`[data-page-id="${id}"] .thumb`)?.focus();
          break;
        }
        case ' ':
          if (focusedPageId) {
            event.preventDefault();
            const owner = state.documents.find((doc) => doc.pageIds.includes(focusedPageId!));
            if (owner && owner.id !== state.activeDocumentId) dispatch({ type: 'setActiveDoc', docId: owner.id });
            dispatch({ type: 'toggleSelect', pageId: focusedPageId, additive: true });
          }
          break;
        case 'Enter':
          if (focusedPageId) {
            event.preventDefault();
            dispatch({ type: 'select', pageIds: [focusedPageId], activeId: focusedPageId });
          }
          break;
        case 'Escape':
          setShowShortcuts(false);
          setShowTools(false);
          setShowSearch(false);
          setShowPages(false);
          setShowProject(false);
          setExportItems(null);
          dispatch({ type: 'select', pageIds: [] });
          dispatch({ type: 'setFocusedDoc', docId: null });
          dispatch({ type: 'setEditorMaximized', value: false });
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.documents, focusedPageId, showToast, announce]);

  const importFiles = async (files: File[]) => {
    const pdfs = files.filter((file) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name));
    if (pdfs.length === 0) { showToast('Choose PDF files.'); return; }
    try {
      const sources: SourceDocument[] = [];
      for (const file of pdfs) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        sources.push(await describeSource(uid('src'), file.name, bytes));
      }
      dispatch({ type: 'import', sources });
      showToast(`Opened ${sources.length} document${sources.length === 1 ? '' : 's'}.`);
      announce(`Opened ${sources.length} documents.`);
    } catch (error) {
      showToast(`Could not open ${pdfs[0]?.name ?? 'file'}: ${(error as Error).message}`);
    }
  };

  const loadSamples = useCallback(async () => {
    try {
      const samples = await createAllSamples();
      const sources: SourceDocument[] = [];
      for (const sample of samples) sources.push(await describeSource(uid('src'), sample.name, sample.bytes, sample.labels));
      dispatch({ type: 'import', sources });
      showToast('Opened four sample documents A, B, C and D.');
      announce('Opened four sample documents.');
    } catch (error) {
      showToast(`Could not create samples: ${(error as Error).message}`);
    }
  }, [showToast, announce]);

  const openExport = async () => {
    try {
      setExportItems(await buildAllExports(state));
    } catch (error) {
      showToast(`Export preview failed: ${(error as Error).message}`);
    }
  };

  const handleDropPages = (payload: DragPayload, toDocId: string, anchorPageId: string | null, position: 'before' | 'after') => {
    dispatch({ type: 'move', pageIds: payload.pageIds, fromDocId: payload.fromDocId, toDocId, anchorPageId, position });
    announce(`Moved ${payload.pageIds.length} page(s).`);
    dragPayloadRef.current = null;
  };

  const restoreDraft = async () => {
    try {
      const draft = await loadDraft();
      if (!draft) return;
      dispatch({ type: 'replace', state: { ...createWorkspace(), ...draft, past: [], future: [] } as WorkspaceState });
      showToast('Draft restored.');
    } catch (error) {
      showToast(`Could not restore draft: ${(error as Error).message}`);
    }
  };

  const activePageId = state.activePageId;
  const activePage = activePageId ? state.pages[activePageId] : undefined;
  const activeSource = activePage ? state.sources[activePage.sourceId] : undefined;
  const mergedCount = useMemo(() => state.documents.reduce((sum, doc) => sum + doc.pageIds.length, 0), [state.documents]);

  return (
    <div className="app">
      <header className="toolbar">
        <div className="brand"><span className="brand-mark">F</span><span>Folio PDF Studio</span></div>
        <button className="btn" onClick={() => fileInputRef.current?.click()}>Open PDFs</button>
        <button className="btn btn-quiet" onClick={() => void loadSamples()}>Samples</button>
        <div className="toolbar-spacer" />
        <button className="btn btn-quiet btn-icon" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!state.past.length} onClick={() => dispatch({ type: 'undo' })}>↶</button>
        <button className="btn btn-quiet btn-icon" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!state.future.length} onClick={() => dispatch({ type: 'redo' })}>↷</button>
        <button className="btn btn-quiet" onClick={() => setShowSearch((value) => !value)} aria-expanded={showSearch}>Search</button>
        <button className="btn btn-quiet" onClick={() => setShowPages((value) => !value)} aria-expanded={showPages}>Pages</button>
        <button className="btn btn-quiet" disabled={!state.documents.length} onClick={() => setShowCompress(true)}>Compress</button>
        <button className="btn btn-quiet" onClick={() => setShowProject((value) => !value)} aria-expanded={showProject}>Project</button>
        <button className="btn btn-quiet" onClick={() => setShowTools((value) => !value)} aria-expanded={showTools}>Tools</button>
        <button className="btn btn-quiet" onClick={() => setShowShortcuts(true)} title="Keyboard shortcuts (?)">⌘</button>
        <button className="btn" onClick={() => void saveDraft(state).then(() => showToast('Draft saved locally.'))}>Save draft</button>
        <button className="btn btn-primary" disabled={!state.documents.length} onClick={() => void openExport()}>Export</button>
        {showPages && <PagesMenu state={state} dispatch={dispatch} onClose={() => setShowPages(false)} onCrop={() => setShowCrop(true)} />}
        {showSearch && <SearchPanel state={state} dispatch={dispatch} onClose={() => setShowSearch(false)} provider={pageText} />}
        {showProject && (
          <div className="tools-menu" role="menu" style={{ right: 120 }}>
            <button className="tool-item" role="menuitem" onClick={() => { void saveDraft(state).then(() => showToast('Draft saved locally.')); setShowProject(false); }}>Save draft</button>
            <button className="tool-item" role="menuitem" onClick={() => { void restoreDraft(); setShowProject(false); }}>Restore draft</button>
            <button className="tool-item" role="menuitem" onClick={() => { void clearDraft().then(() => { setHasDraft(false); showToast('Local data cleared.'); }); setShowProject(false); }}>Discard draft / clear local data</button>
            <button className="tool-item" role="menuitem" onClick={() => { downloadBytes(new TextEncoder().encode(exportProject(state)), 'folio-project.json', 'application/json'); setShowProject(false); }}>Export editable project (JSON)</button>
            <button className="tool-item" role="menuitem" onClick={() => { projectInputRef.current?.click(); setShowProject(false); }}>Import editable project (JSON)</button>
          </div>
        )}
        {showTools && <ToolsMenu query={toolQuery} setQuery={setToolQuery} onClose={() => setShowTools(false)} />}
      </header>

      <div className={`workspace${state.editorMaximized ? ' editor-maximized' : ''}`}>
        {state.documents.length === 0 ? (
          <EmptyState hasDraft={hasDraft} onFiles={(files) => void importFiles(files)} onSamples={() => void loadSamples()} onRestore={() => void restoreDraft()} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, minHeight: 0 }}>
            <div className={`columns${state.focusedDocId ? ' is-focused' : ''}`}>
              {state.documents.map((doc) => (
                <Column
                  key={doc.id}
                  doc={doc}
                  state={state}
                  dispatch={dispatch}
                  focusedPageId={focusedPageId}
                  marker={marker}
                  setMarker={setMarker}
                  onDragPayload={() => dragPayloadRef.current}
                  onDragStartPayload={(payload) => { dragPayloadRef.current = payload; }}
                  onDropPages={handleDropPages}
                  width={state.columnWidths[doc.id] ?? 244}
                  onResize={(value) => dispatch({ type: 'setColumnWidth', docId: doc.id, width: value })}
                  thumbSize={state.thumbSizes[doc.id] ?? 220}
                  onThumbSize={(value) => dispatch({ type: 'setThumbSize', docId: doc.id, size: value })}
                />
              ))}
            </div>
            <TransferPanel state={state} dispatch={dispatch} preset={preset} onToast={showToast} onAnnounce={announce} />
          </div>
        )}
        {activePage && (
          <EditorPane
            page={activePage}
            source={activeSource}
            state={state}
            dispatch={dispatch}
            onToast={showToast}
            onEditText={(draft) => setTextDraft({ pageId: activePage.id, draft })}
            width={state.editorWidth}
            onResize={(value) => dispatch({ type: 'setEditorWidth', width: value })}
            maximized={state.editorMaximized}
            onToggleMaximize={() => dispatch({ type: 'setEditorMaximized', value: !state.editorMaximized })}
          />
        )}
      </div>

      <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" multiple className="sr-only" aria-label="Open PDF files" onChange={(event) => { void importFiles(Array.from(event.target.files ?? [])); event.target.value = ''; }} />
      <input ref={projectInputRef} type="file" accept="application/json" className="sr-only" aria-label="Import project" onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) void file.text().then((text) => { dispatch({ type: 'replace', state: { ...createWorkspace(), ...importProject(text), past: [], future: [] } as WorkspaceState }); showToast('Project imported.'); });
        event.target.value = '';
      }} />
      <div aria-live="polite" className="sr-only">{announcement}</div>
      {toast && <div className="toast" role="status">{toast}</div>}
      {showCrop && <CropDialog state={state} dispatch={dispatch} onClose={() => setShowCrop(false)} />}
      {showCompress && <CompressionDialog state={state} dispatch={dispatch} onClose={() => setShowCompress(false)} onToast={showToast} />}
      {textDraft && (
        <TextEditDialog
          draft={textDraft.draft}
          pageId={textDraft.pageId}
          dispatch={dispatch}
          onToast={showToast}
          onClose={() => setTextDraft(null)}
        />
      )}
      {showShortcuts && <ShortcutsDialog onClose={() => setShowShortcuts(false)} />}
      {exportItems && (
        <ExportDialog
          items={exportItems}
          mergedCount={mergedCount}
          onClose={() => setExportItems(null)}
          onDownloadOne={(item, option: ExportCompression) => {
            void applyExportCompression(item.bytes, option, compressRaster).then((bytes) => downloadBytes(bytes, item.filename));
          }}
          onDownloadZip={(option: ExportCompression) => {
            void buildAllExports(state).then(async (items) => {
              const zip = new JSZip();
              for (const item of items) zip.file(item.filename, await applyExportCompression(item.bytes, option, compressRaster));
              downloadBytes(await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }), 'folio-documents.zip', 'application/zip');
            });
          }}
          onDownloadMerged={(option: ExportCompression) => {
            void buildPdfForPageIds(state, state.documents.flatMap((doc) => doc.pageIds))
              .then((bytes) => applyExportCompression(bytes, option, compressRaster))
              .then((bytes) => downloadBytes(bytes, 'folio-merged.pdf'));
          }}
        />
      )}
    </div>
  );
}
