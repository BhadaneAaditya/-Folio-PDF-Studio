import { useEffect, useState } from 'react';
import type { ExportItem } from '../core/exportPdf';
import { computeCrop, type CropPreset } from '../core/crop';
import type { Action } from '../core/store';
import type { Rect, SourceDocument, WorkspaceState } from '../core/types';
import { buildDocumentPdf } from '../core/exportPdf';
import {
  applyExportCompression,
  compressLossless,
  DEFAULT_EXPORT_COMPRESSION,
  formatBytes,
  pickSmaller,
  type ExportCompression,
} from '../core/compress';
import { compressRaster } from '../core/compressRaster';
import { registerProxy } from '../core/pdfjs';
import { uid } from '../core/workspace';
import { estimateTextWidth } from '../core/textEdit';

export type TextDraft = {
  rect: Rect;
  original: string;
  baselineX: number;
  baselineY: number;
  fontSize: number;
};

export function TextEditDialog({
  draft,
  pageId,
  dispatch,
  onClose,
  onToast,
}: {
  draft: TextDraft;
  pageId: string;
  dispatch: React.Dispatch<Action>;
  onClose: () => void;
  onToast: (message: string) => void;
}) {
  const [originalText, setOriginalText] = useState(draft.original);
  const [replacement, setReplacement] = useState(draft.original);
  const [size, setSize] = useState(Math.round(draft.fontSize));
  const [color, setColor] = useState('#1d1d1f');
  const width = draft.rect.x2 - draft.rect.x1;
  const estimated = estimateTextWidth(replacement, size);
  const hexToRgb = (hex: string): [number, number, number] => [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ];

  return (
    <Modal title="Edit text in place" subtitle="The selected text is removed from the page content stream and replaced with searchable text." onClose={onClose}>
      <div style={{ display: 'grid', gap: 12 }}>
        <label>Current text
          <input type="text" value={originalText} onChange={(event) => setOriginalText(event.target.value)} placeholder="Type the exact text to replace" style={{ width: '100%', marginTop: 4 }} />
        </label>
        <label>Replace with
          <textarea autoFocus value={replacement} onChange={(event) => setReplacement(event.target.value)} rows={2} style={{ width: '100%', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--surface-solid)', color: 'var(--text)' }} />
        </label>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <label>Size <input type="number" min={4} max={200} value={size} onChange={(event) => setSize(Number(event.target.value))} style={{ width: 70, marginLeft: 4 }} /></label>
          <label>Color <input type="color" value={color} onChange={(event) => setColor(event.target.value)} style={{ width: 44, height: 30, marginLeft: 4, padding: 0, border: 0, background: 'transparent' }} /></label>
        </div>
        {replacement !== originalText && estimated > width * 1.05 && (
          <div style={{ background: 'rgba(180,83,9,0.1)', border: '1px solid rgba(180,83,9,0.25)', borderRadius: 10, padding: 10, fontSize: 12 }}>
            Font substitution: Helvetica is used for replacement text. Estimated width {estimated.toFixed(0)} pt exceeds the {width.toFixed(0)} pt area — the text will be scaled down to fit.
          </div>
        )}
        {!originalText && (
          <div style={{ fontSize: 12, color: 'var(--text-2)' }}>No digital text was found here. This could be a scanned page or an unsupported font encoding; OCR is required to change visible words in an image.</div>
        )}
      </div>
      <div className="modal-actions">
        <button className="btn btn-primary" disabled={!replacement || !originalText} onClick={() => {
          dispatch({
            type: 'addTextEdit',
            pageId,
            edit: {
              id: uid('edit'),
              rect: draft.rect,
              original: originalText,
              replacement,
              fontSize: size,
              color: hexToRgb(color),
              baselineX: draft.baselineX,
              baselineY: draft.baselineY,
            },
          });
          onToast('Text edit queued — it will be written into the exported PDF.');
          onClose();
        }}>Apply edit</button>
      </div>
    </Modal>
  );
}

export function CompressionDialog({
  state,
  dispatch,
  onClose,
  onToast,
}: {
  state: WorkspaceState;
  dispatch: React.Dispatch<Action>;
  onClose: () => void;
  onToast: (message: string) => void;
}) {
  const doc = state.documents.find((item) => item.id === state.activeDocumentId) ?? state.documents[0];
  const [mode, setMode] = useState<'lossless' | 'raster'>('lossless');
  const [dpi, setDpi] = useState(110);
  const [quality, setQuality] = useState(0.7);
  const [original, setOriginal] = useState<Uint8Array | null>(null);
  const [result, setResult] = useState<{ bytes: Uint8Array; keptOriginal: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (doc) void buildDocumentPdf(state, doc.id).then(setOriginal).catch(() => onToast('Could not prepare this document for compression.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id]);

  const preview = async () => {
    if (!original) return;
    setBusy(true);
    try {
      const candidate = mode === 'lossless' ? await compressLossless(original) : await compressRaster(original, dpi, quality);
      const bytes = pickSmaller(original, candidate);
      setResult({ bytes, keptOriginal: bytes === original });
    } catch (error) {
      onToast(`Compression failed: ${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!doc || !result) return;
    try {
      const pages = doc.pageIds.map((id) => state.pages[id]!);
      const source: SourceDocument = {
        id: uid('src'),
        name: `${doc.name}-compressed.pdf`,
        bytes: result.bytes.slice(),
        pageCount: pages.length,
        labels: pages.map((page) => page.label),
        widths: pages.map((page) => page.width),
        heights: pages.map((page) => page.height),
        rotations: pages.map((page) => page.baseRotation),
      };
      await registerProxy(source.id, source.bytes);
      dispatch({ type: 'import', sources: [source] });
      onToast('Compressed copy opened as a new document.');
      onClose();
    } catch (error) {
      onToast(`Could not open the compressed copy: ${(error as Error).message}`);
    }
  };

  return (
    <Modal title="Compress PDF" subtitle="A compressed copy is opened as a new document; the original stays editable." onClose={onClose}>
      <div style={{ display: 'grid', gap: 12 }}>
        <label>Method
          <select value={mode} onChange={(event) => { setMode(event.target.value as 'lossless' | 'raster'); setResult(null); }} style={{ marginLeft: 8 }}>
            <option value="lossless">Lossless structure + metadata cleanup</option>
            <option value="raster">Reduce image resolution (JPEG)</option>
          </select>
        </label>
        {mode === 'raster' && (
          <>
            <label>Resolution <input type="number" min={50} max={300} value={dpi} onChange={(event) => setDpi(Number(event.target.value))} style={{ width: 80, marginLeft: 8 }} /> dpi</label>
            <label>Image quality <input type="range" min={0.2} max={0.95} step={0.05} value={quality} onChange={(event) => setQuality(Number(event.target.value))} style={{ marginLeft: 8 }} /> {Math.round(quality * 100)}%</label>
            <div style={{ background: 'rgba(180,83,9,0.1)', border: '1px solid rgba(180,83,9,0.25)', borderRadius: 10, padding: 10, fontSize: 12 }}>
              Image-only output: text and vector artwork will no longer be selectable or editable.
            </div>
          </>
        )}
        <div style={{ fontSize: 13 }}>
          Before: <strong>{original ? formatBytes(original.length) : '…'}</strong>
          {result && <> &nbsp;→&nbsp; After: <strong>{formatBytes(result.bytes.length)}</strong> {result.keptOriginal && <span style={{ color: '#b45309' }}>(compression increased size — original kept)</span>}</>}
        </div>
      </div>
      <div className="modal-actions">
        <button className="btn" disabled={!original || busy} onClick={() => void preview()}>{busy ? 'Working…' : 'Preview size'}</button>
        <button className="btn btn-primary" disabled={!result} onClick={() => void apply()}>Open compressed copy</button>
      </div>
    </Modal>
  );
}

export function Modal({ title, subtitle, children, onClose }: { title: string; subtitle?: string; children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const handle = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {subtitle && <p className="sub">{subtitle}</p>}
        {children}
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export function ExportDialog({
  items,
  mergedCount,
  onDownloadOne,
  onDownloadZip,
  onDownloadMerged,
  onClose,
}: {
  items: ExportItem[];
  mergedCount: number;
  onDownloadOne: (item: ExportItem, option: ExportCompression) => void;
  onDownloadZip: (option: ExportCompression) => void;
  onDownloadMerged: (option: ExportCompression) => void;
  onClose: () => void;
}) {
  const [option, setOption] = useState<ExportCompression>(DEFAULT_EXPORT_COMPRESSION);
  const [preview, setPreview] = useState<{ before: number; after: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const empty = items.filter((item) => item.empty);
  const before = items.reduce((sum, item) => sum + item.bytes.length, 0);

  const previewSize = async () => {
    setBusy(true);
    try {
      let after = 0;
      for (const item of items) {
        if (item.empty) continue;
        after += (await applyExportCompression(item.bytes, option, compressRaster)).length;
      }
      setPreview({ before, after });
    } catch (error) {
      setPreview(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Review your export" subtitle="Every revised document is written as a fresh PDF. Choose what to download." onClose={onClose}>
      {empty.length > 0 && (
        <div style={{ background: 'rgba(180,83,9,0.1)', border: '1px solid rgba(180,83,9,0.25)', borderRadius: 10, padding: 10, fontSize: 12, marginBottom: 12 }}>
          {empty.length} empty document{empty.length > 1 ? 's' : ''} ({empty.map((e) => e.filename).join(', ')}) will be included as zero-page files. Add pages or exclude them before exporting if needed.
        </div>
      )}
      <div className="export-compression">
        <div className="export-compression-row">
          <label htmlFor="export-compression-mode">Compress at download</label>
          <select
            id="export-compression-mode"
            value={option.mode}
            onChange={(event) => { setOption({ ...option, mode: event.target.value as ExportCompression['mode'] }); setPreview(null); }}
          >
            <option value="none">None — original quality</option>
            <option value="lossless">Lossless (object streams, metadata)</option>
            <option value="raster">Raster (reduce image resolution)</option>
          </select>
        </div>
        {option.mode === 'raster' && (
          <div className="export-compression-row">
            <label>Resolution <input type="number" min={50} max={300} value={option.dpi} onChange={(event) => setOption({ ...option, dpi: Number(event.target.value) })} style={{ width: 72, marginLeft: 6 }} /> dpi</label>
            <label>Quality <input type="range" min={0.2} max={0.95} step={0.05} value={option.quality} onChange={(event) => setOption({ ...option, quality: Number(event.target.value) })} style={{ margin: '0 6px' }} /> {Math.round(option.quality * 100)}%</label>
          </div>
        )}
        {option.mode === 'raster' && (
          <div className="export-hint">Raster output is image-only: text and vector artwork will no longer be selectable or editable.</div>
        )}
        <div className="export-compression-row">
          <button className="btn btn-sm" disabled={busy || option.mode === 'none' || !items.length} onClick={() => void previewSize()}>
            {busy ? 'Calculating…' : 'Preview size'}
          </button>
          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
            {preview
              ? `${formatBytes(preview.before)} → ${formatBytes(preview.after)}${preview.after >= preview.before ? ' (original kept where smaller)' : ''}`
              : `${formatBytes(before)} total before compression`}
          </span>
        </div>
      </div>
      <div>
        {items.map((item) => (
          <div className="file-row" key={item.docId}>
            <span>
              <strong>{item.filename}</strong>
              <br />
              <span className="sub" style={{ margin: 0 }}>{item.pageCount} page{item.pageCount === 1 ? '' : 's'} · {formatBytes(item.bytes.length)}</span>
            </span>
            <button className="btn btn-sm" disabled={item.empty} onClick={() => onDownloadOne(item, option)}>Download</button>
          </div>
        ))}
      </div>
      <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
        <button className="btn" onClick={() => onDownloadMerged(option)} disabled={mergedCount === 0}>Merge into one PDF ({mergedCount} pages)</button>
        <button className="btn btn-primary" onClick={() => onDownloadZip(option)}>Download all as ZIP</button>
      </div>
    </Modal>
  );
}

export function CropDialog({ state, dispatch, onClose }: { state: WorkspaceState; dispatch: React.Dispatch<Action>; onClose: () => void }) {
  const doc = state.documents.find((item) => item.id === state.activeDocumentId);
  const selected = state.selectedPageIds.filter((id) => doc?.pageIds.includes(id));
  const [scope, setScope] = useState<'selected' | 'document'>(selected.length ? 'selected' : 'document');
  const [preset, setPreset] = useState<CropPreset>('original');
  const [margins, setMargins] = useState(0);
  const [customWidth, setCustomWidth] = useState(595);
  const [customHeight, setCustomHeight] = useState(842);
  const pageIds = scope === 'selected' ? selected : (doc?.pageIds ?? []);
  const preview = pageIds.length && doc ? computeCrop(state.pages[pageIds[0]!]!, preset, margins, { width: customWidth, height: customHeight }) : null;

  const apply = (crop: typeof preview) => {
    if (pageIds.length) dispatch({ type: 'cropPages', pageIds, crop });
    onClose();
  };

  return (
    <Modal title="Crop pages" subtitle="Marks stay in PDF page coordinates, so they remain aligned after cropping." onClose={onClose}>
      <div style={{ display: 'grid', gap: 12 }}>
        <label>Apply to
          <select value={scope} onChange={(event) => setScope(event.target.value as 'selected' | 'document')} style={{ marginLeft: 8 }}>
            <option value="selected">Selected pages ({selected.length})</option>
            <option value="document">Whole document ({doc?.pageIds.length ?? 0})</option>
          </select>
        </label>
        <label>Target
          <select value={preset} onChange={(event) => setPreset(event.target.value as CropPreset)} style={{ marginLeft: 8 }}>
            <option value="original">Original dimensions (default)</option>
            <option value="a4">A4 (595 × 842 pt)</option>
            <option value="letter">Letter (612 × 792 pt)</option>
            <option value="custom">Custom size</option>
          </select>
        </label>
        {preset === 'custom' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <label>Width <input type="number" min={1} value={customWidth} onChange={(event) => setCustomWidth(Number(event.target.value))} style={{ width: 90, marginLeft: 4 }} /></label>
            <label>Height <input type="number" min={1} value={customHeight} onChange={(event) => setCustomHeight(Number(event.target.value))} style={{ width: 90, marginLeft: 4 }} /></label>
          </div>
        )}
        <label>Margins (pt) <input type="number" min={0} value={margins} onChange={(event) => setMargins(Number(event.target.value))} style={{ width: 90, marginLeft: 4 }} /></label>
        <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
          {preset === 'original' ? 'Original dimensions are preserved.' : preview
            ? `Preview crop: ${preview.left.toFixed(0)}, ${preview.bottom.toFixed(0)} → ${preview.right.toFixed(0)}, ${preview.top.toFixed(0)} pt, centred proportionally.`
            : 'No pages selected.'}
        </div>
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={() => apply(null)}>Reset crop</button>
        <button className="btn btn-primary" disabled={!pageIds.length} onClick={() => apply(preview)}>Apply crop</button>
      </div>
    </Modal>
  );
}

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const shortcuts: [string, string][] = [
    ['O', 'Open PDF files'],
    ['S', 'Try sample files'],
    ['M', 'Focus Move transfer'],
    ['C', 'Focus Copy transfer'],
    ['X', 'Focus Swap transfer'],
    ['↑ / ↓', 'Focus previous / next page'],
    ['Space', 'Toggle selection of focused page'],
    ['Enter', 'Open focused page in the editor'],
    ['Cmd/Ctrl + Z', 'Undo'],
    ['Cmd/Ctrl + Shift + Z', 'Redo'],
    ['E', 'Review export'],
    ['?', 'Show this help'],
    ['Esc', 'Clear selection / close dialog'],
  ];
  return (
    <Modal title="Keyboard shortcuts" subtitle="Every transfer can be completed without a mouse." onClose={onClose}>
      <div className="shortcut-grid">
        {shortcuts.map(([key, label]) => (
          <div key={key} style={{ display: 'contents' }}>
            <kbd>{key}</kbd>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}

export const TOOL_CATALOG: { name: string; detail: string; milestone: number }[] = [
  { name: 'Open & organize pages', detail: 'Move, copy, swap, reorder, rename', milestone: 1 },
  { name: 'Highlight', detail: 'Real PDF highlight annotation', milestone: 1 },
  { name: 'Search PDFs', detail: 'Search current or all open documents', milestone: 2 },
  { name: 'Merge / split / extract', detail: 'Page range assembly', milestone: 2 },
  { name: 'Crop & resize', detail: 'Margins, A4 / Letter presets', milestone: 2 },
  { name: 'Markup tools', detail: 'Text, draw, notes, shapes, signatures', milestone: 2 },
  { name: 'Forms', detail: 'Fill, create, flatten fields', milestone: 2 },
  { name: 'Edit existing content', detail: 'Replace text and images', milestone: 3 },
  { name: 'OCR', detail: 'Searchable scans, English / Hindi / Marathi', milestone: 3 },
  { name: 'Convert', detail: 'Images, Office, text, tables, DOCX / PPTX', milestone: 3 },
  { name: 'Compress', detail: 'Image quality controls, size preview', milestone: 3 },
  { name: 'Compare & batch', detail: 'Side-by-side diff, batch operations', milestone: 3 },
  { name: 'Redact', detail: 'Permanent content removal + cleanup', milestone: 3 },
  { name: 'Security & signatures', detail: 'Passwords, validation, certificate signing', milestone: 3 },
  { name: 'Review & sign', detail: 'Expiring links, comments, signing order', milestone: 4 },
];

export function ToolsMenu({ query, setQuery, onClose }: { query: string; setQuery: (value: string) => void; onClose: () => void }) {
  const filtered = TOOL_CATALOG.filter((tool) => `${tool.name} ${tool.detail}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="tools-menu" role="menu">
      <input autoFocus type="text" placeholder="Search tools…" aria-label="Search tools" value={query} onChange={(event) => setQuery(event.target.value)} />
      {filtered.map((tool) => (
        <button key={tool.name} className="tool-item" role="menuitem" onClick={onClose}>
          {tool.name}
          <small>{tool.detail} · Milestone {tool.milestone}</small>
        </button>
      ))}
      {filtered.length === 0 && <div style={{ padding: 10, fontSize: 12, color: 'var(--text-2)' }}>No tools match “{query}”.</div>}
    </div>
  );
}
