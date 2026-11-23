import { useEffect, useRef, useState } from 'react';
import { renderPage, textInRect } from '../core/pdfjs';
import type { TextDraft } from './Dialogs';
import type { PageInstance, SourceDocument, WorkspaceState } from '../core/types';
import type { Action } from '../core/store';
import { uid } from '../core/workspace';
import { clampZoom, computeFitZoom, ZOOM_PRESETS, type FitMode } from '../core/viewer';

type Props = {
  page: PageInstance;
  source?: SourceDocument;
  state: WorkspaceState;
  dispatch: React.Dispatch<Action>;
  onToast: (message: string) => void;
  onEditText: (draft: TextDraft) => void;
  width: number;
  onResize: (width: number) => void;
  maximized: boolean;
  onToggleMaximize: () => void;
};

type Drag = { x1: number; y1: number; x2: number; y2: number };

export function EditorPane({ page, source, state, dispatch, onToast, onEditText, width, onResize, maximized, onToggleMaximize }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const zoom = state.zoom[state.activeDocumentId ?? ''] ?? 1;
  const scale = zoom;
  const displayWidth = page.width * scale;
  const displayHeight = page.height * scale;
  const activeDoc = state.documents.find((doc) => doc.id === state.activeDocumentId);
  const pageIds = activeDoc?.pageIds ?? [];
  const pageIndex = pageIds.indexOf(page.id);
  const setZoom = (value: number) => dispatch({ type: 'setZoom', docId: state.activeDocumentId ?? '', zoom: clampZoom(value) });
  const fit = (mode: FitMode) => {
    const stage = stageRef.current;
    setZoom(computeFitZoom(page.width, page.height, stage?.clientWidth ?? 520, stage?.clientHeight ?? 600, mode));
  };
  const goToPage = (index: number) => {
    const id = pageIds[index];
    if (id) dispatch({ type: 'select', pageIds: [id], activeId: id });
  };
  const zoomIsPreset = ZOOM_PRESETS.some((preset) => Math.abs(preset - zoom) < 0.001);

  useEffect(() => {
    if (!page.sourceId || !canvasRef.current) return;
    let cancelled = false;
    setError(false);
    const dpr = typeof window === 'undefined' ? 1 : (window.devicePixelRatio || 1);
    renderPage(page.sourceId, page.sourcePageIndex, canvasRef.current, scale, { deviceScale: dpr * state.renderQuality })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [page.sourceId, page.sourcePageIndex, scale, state.renderQuality]);

  const eventPoint = (event: React.PointerEvent): { x: number; y: number } => {
    const rect = surfaceRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const finishDrag = async () => {
    if (!drag) return;
    const x1 = Math.min(drag.x1, drag.x2) / scale;
    const x2 = Math.max(drag.x1, drag.x2) / scale;
    const y1 = page.height - Math.max(drag.y1, drag.y2) / scale;
    const y2 = page.height - Math.min(drag.y1, drag.y2) / scale;
    const rect = { x1, y1, x2, y2 };
    if (x2 - x1 > 3 && y2 - y1 > 3) {
      if (state.activeTool === 'highlight') {
        dispatch({
          type: 'addMark',
          pageId: page.id,
          mark: { id: uid('mark'), kind: 'highlight', rect, color: [1, 0.84, 0.2], opacity: 0.45, text: 'Highlight' },
        });
        onToast('Highlight added — it travels with this page.');
      } else if (state.activeTool === 'edit') {
        if (!page.sourceId) { onToast('Add a digital text area to a page from a PDF first.'); }
        else {
          const found = await textInRect(page.sourceId, page.sourcePageIndex, rect);
          onEditText({ rect, original: found.text, baselineX: found.baselineX, baselineY: found.baselineY, fontSize: found.fontSize });
        }
      }
    }
    setDrag(null);
  };

  const tools = [
    { id: 'select', label: 'Select' },
    { id: 'edit', label: 'Edit text' },
    { id: 'highlight', label: 'Highlight' },
    { id: 'underline', label: 'Underline' },
    { id: 'draw', label: 'Draw' },
    { id: 'note', label: 'Note' },
  ];

  return (
    <aside className={`editor${maximized ? ' is-maximized' : ''}`} aria-label="Page editor" style={{ width, flexBasis: width }}>
      <div
        className="editor-resize"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize editor pane"
        tabIndex={0}
        onPointerDown={(event) => {
          event.preventDefault();
          const startX = event.clientX;
          const startWidth = width;
          const move = (pointer: PointerEvent) => onResize(startWidth - (pointer.clientX - startX));
          const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') { event.preventDefault(); onResize(width + 20); }
          if (event.key === 'ArrowRight') { event.preventDefault(); onResize(width - 20); }
        }}
      />
      <div className="editor-head">
        <div style={{ minWidth: 0 }}>
          <div className="editor-title">{page.label} — editing</div>
          <div className="editor-sub">
            {source ? `${source.name} · original page ${page.sourcePageIndex + 1}` : 'Blank page'}
          </div>
        </div>
        <div className="toolbar-spacer" />
        <button className="btn btn-quiet btn-icon" aria-label={maximized ? 'Minimize editor' : 'Maximize editor'} title={maximized ? 'Minimize editor' : 'Maximize editor'} onClick={onToggleMaximize}>{maximized ? '⤡' : '⤢'}</button>
        <button className="btn btn-quiet btn-icon" aria-label="Close editor" onClick={() => dispatch({ type: 'select', pageIds: [] })}>×</button>
      </div>

      <div className="tool-strip" role="toolbar" aria-label="Markup tools">
        {tools.map((tool) => (
          <button
            key={tool.id}
            className={`tool${state.activeTool === tool.id ? ' is-active' : ''}`}
            aria-pressed={state.activeTool === tool.id}
            onClick={() => {
              dispatch({ type: 'setTool', tool: tool.id });
              if (!['select', 'highlight', 'edit'].includes(tool.id)) onToast(`${tool.label} tool is planned for a later milestone.`);
            }}
          >
            {tool.label}
          </button>
        ))}
        <button className="tool" onClick={() => dispatch({ type: 'rotatePage', pageId: page.id, delta: 90 })}>Rotate 90°</button>
      </div>

      {page.textEdits.length > 0 && (
        <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {page.textEdits.map((edit) => (
            <button key={edit.id} className="btn btn-sm" title="Remove text edit" onClick={() => dispatch({ type: 'removeTextEdit', pageId: page.id, editId: edit.id })}>
              “{edit.original}” → “{edit.replacement}” ×
            </button>
          ))}
        </div>
      )}

      <div className="editor-stage" ref={stageRef}>
        <div
          ref={surfaceRef}
          className="page-surface"
          data-tool={state.activeTool}
          style={{ width: displayWidth, height: displayHeight, transform: `rotate(${page.rotation}deg)` }}
          onPointerDown={(event) => {
            if (state.activeTool !== 'highlight' && state.activeTool !== 'edit') return;
            event.currentTarget.setPointerCapture(event.pointerId);
            const point = eventPoint(event);
            setDrag({ x1: point.x, y1: point.y, x2: point.x, y2: point.y });
          }}
          onPointerMove={(event) => {
            if (!drag) return;
            const point = eventPoint(event);
            setDrag({ ...drag, x2: point.x, y2: point.y });
          }}
          onPointerUp={() => void finishDrag()}
          onPointerCancel={() => setDrag(null)}
        >
          {page.sourceId ? (
            <canvas ref={canvasRef} aria-label={`Rendered page ${page.label}`} />
          ) : (
            <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: '#999' }}>Blank page</div>
          )}
          {error && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: '#fff', color: '#b91c1c' }}>Could not render this page.</div>}
          <div className="mark-overlay">
            {page.crop && (
              <div
                className="crop-outline"
                style={{
                  left: `${(page.crop.left / page.width) * 100}%`,
                  width: `${((page.crop.right - page.crop.left) / page.width) * 100}%`,
                  top: `${((page.height - page.crop.top) / page.height) * 100}%`,
                  height: `${((page.crop.top - page.crop.bottom) / page.height) * 100}%`,
                }}
              />
            )}
            {page.marks.map((mark) =>
              mark.kind === 'highlight' ? (
                <span
                  key={mark.id}
                  className="highlight"
                  style={{
                    left: `${(mark.rect.x1 / page.width) * 100}%`,
                    width: `${((mark.rect.x2 - mark.rect.x1) / page.width) * 100}%`,
                    top: `${((page.height - mark.rect.y2) / page.height) * 100}%`,
                    height: `${((mark.rect.y2 - mark.rect.y1) / page.height) * 100}%`,
                    background: `rgba(255, 214, 51, ${mark.opacity})`,
                  }}
                />
              ) : null,
            )}
          </div>
          {drag && (
            <div
              className="drag-rect"
              style={{
                left: Math.min(drag.x1, drag.x2),
                top: Math.min(drag.y1, drag.y2),
                width: Math.abs(drag.x2 - drag.x1),
                height: Math.abs(drag.y2 - drag.y1),
              }}
            />
          )}
        </div>
      </div>

      <div className="viewer-bar" role="toolbar" aria-label="Page viewing controls">
        <div className="viewer-group">
          <button className="btn btn-quiet btn-sm" aria-label="Previous page" disabled={pageIndex <= 0} onClick={() => goToPage(pageIndex - 1)}>‹</button>
          <input
            type="number"
            className="viewer-page-input"
            min={1}
            max={pageIds.length}
            value={pageIndex + 1}
            aria-label="Current page"
            onChange={(event) => goToPage(Number(event.target.value) - 1)}
          />
          <span className="viewer-total">/ {pageIds.length}</span>
          <button className="btn btn-quiet btn-sm" aria-label="Next page" disabled={pageIndex >= pageIds.length - 1} onClick={() => goToPage(pageIndex + 1)}>›</button>
        </div>
        <div className="viewer-group">
          <button className="btn btn-quiet btn-sm" aria-label="Zoom out" onClick={() => setZoom(zoom - 0.25)}>−</button>
          <select
            className="viewer-zoom"
            aria-label="Zoom level"
            value={zoomIsPreset ? String(zoom) : 'custom'}
            onChange={(event) => {
              const value = event.target.value;
              if (value === 'fit-page') fit('page');
              else if (value === 'fit-width') fit('width');
              else setZoom(Number(value));
            }}
          >
            {!zoomIsPreset && <option value="custom">{Math.round(zoom * 100)}%</option>}
            {ZOOM_PRESETS.map((preset) => <option key={preset} value={preset}>{Math.round(preset * 100)}%</option>)}
            <option value="fit-page">Fit page</option>
            <option value="fit-width">Fit width</option>
          </select>
          <button className="btn btn-quiet btn-sm" aria-label="Zoom in" onClick={() => setZoom(zoom + 0.25)}>+</button>
        </div>
        <div className="viewer-group viewer-group-end">
          <button className="btn btn-quiet btn-sm" title="Fit page" onClick={() => fit('page')}>Fit page</button>
          <button className="btn btn-quiet btn-sm" title="Fit width" onClick={() => fit('width')}>Fit width</button>
          <button
            className={`btn btn-sm${state.renderQuality === 2 ? ' btn-primary' : ''}`}
            aria-label="High quality rendering"
            aria-pressed={state.renderQuality === 2}
            title="Render at 2× resolution for sharper text"
            onClick={() => dispatch({ type: 'setRenderQuality', quality: state.renderQuality === 2 ? 1 : 2 })}
          >HQ</button>
          <button className="btn btn-quiet btn-sm" aria-label="Print" onClick={() => window.print()}>Print</button>
          <button className="btn btn-quiet btn-sm" aria-label="Fullscreen" onClick={() => void document.querySelector('.editor')?.requestFullscreen()}>Full</button>
        </div>
      </div>
      <div className="viewer-status">{displayWidth.toFixed(0)} × {displayHeight.toFixed(0)} pt · {Math.round(zoom * 100)}% · {state.renderQuality}× render</div>
    </aside>
  );
}
