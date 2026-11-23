import { useEffect, useState } from 'react';
import type { Action } from '../core/store';
import { parseRanges } from '../core/ranges';
import { searchWorkspace, type SearchHit, type TextProvider } from '../core/search';
import type { WorkspaceState } from '../core/types';

export function SearchPanel({ state, dispatch, onClose, provider }: { state: WorkspaceState; dispatch: React.Dispatch<Action>; onClose: () => void; provider: TextProvider }) {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'current' | 'all'>('all');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void searchWorkspace(state, query, scope, provider).then((results) => {
        if (!cancelled) { setHits(results); setActive(0); }
      }).catch(() => { if (!cancelled) setHits([]); });
    }, 160);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [state, query, scope, provider]);

  const go = (hit: SearchHit) => {
    dispatch({ type: 'setActiveDoc', docId: hit.docId });
    dispatch({ type: 'select', pageIds: [hit.pageId], activeId: hit.pageId });
  };

  const step = (delta: number) => {
    if (!hits.length) return;
    const next = (active + delta + hits.length) % hits.length;
    setActive(next);
    go(hits[next]!);
  };

  return (
    <div className="tools-menu" role="search" style={{ right: 220, width: 340 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <input autoFocus type="search" placeholder="Search text…" aria-label="Search text" value={query} onChange={(event) => setQuery(event.target.value)} style={{ flex: 1, margin: 0 }} />
        <button className="btn btn-sm btn-quiet" aria-label="Previous result" onClick={() => step(-1)}>↑</button>
        <button className="btn btn-sm btn-quiet" aria-label="Next result" onClick={() => step(1)}>↓</button>
        <button className="btn btn-sm btn-quiet" aria-label="Close search" onClick={onClose}>×</button>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, marginBottom: 6 }}>
        <label><input type="radio" name="search-scope" checked={scope === 'all'} onChange={() => setScope('all')} /> All PDFs</label>
        <label><input type="radio" name="search-scope" checked={scope === 'current'} onChange={() => setScope('current')} /> Current PDF</label>
        <span style={{ marginLeft: 'auto', color: 'var(--text-2)' }}>{hits.length} results</span>
      </div>
      <div style={{ maxHeight: 320, overflow: 'auto' }}>
        {hits.map((hit, index) => (
          <button
            key={`${hit.pageId}-${index}`}
            className="tool-item"
            style={index === active ? { background: 'var(--surface-2)' } : undefined}
            onClick={() => { setActive(index); go(hit); }}
          >
            {hit.docName} · {hit.label}
            <small>{hit.snippet}</small>
          </button>
        ))}
        {query && hits.length === 0 && <div style={{ padding: 10, fontSize: 12, color: 'var(--text-2)' }}>No matches.</div>}
      </div>
    </div>
  );
}

export function PagesMenu({ state, dispatch, onClose, onCrop }: { state: WorkspaceState; dispatch: React.Dispatch<Action>; onClose: () => void; onCrop: () => void }) {
  const [range, setRange] = useState('');
  const doc = state.documents.find((item) => item.id === state.activeDocumentId);
  const selected = state.selectedPageIds.filter((id) => doc?.pageIds.includes(id));
  const run = (action: () => void) => { action(); onClose(); };

  return (
    <div className="tools-menu" role="menu" style={{ right: 340, width: 300 }}>
      <div style={{ fontSize: 11, color: 'var(--text-2)', padding: '2px 10px 6px' }}>
        {doc ? `${doc.name} · ${selected.length} selected` : 'No document open'}
      </div>
      <div style={{ display: 'flex', gap: 6, padding: '0 8px 8px' }}>
        <input
          type="text"
          aria-label="Page range"
          placeholder="e.g. 1-3, 6, 9-11"
          value={range}
          onChange={(event) => setRange(event.target.value)}
          style={{ flex: 1 }}
        />
        <button className="btn btn-sm" disabled={!doc} onClick={() => run(() => {
          if (!doc) return;
          const ids = parseRanges(range, doc.pageIds.length).map((index) => doc.pageIds[index]!);
          if (ids.length) dispatch({ type: 'select', pageIds: ids, activeId: ids[0] });
        })}>Select</button>
      </div>
      <button className="tool-item" role="menuitem" disabled={!doc || !selected.length} onClick={() => run(() => doc && dispatch({ type: 'duplicate', docId: doc.id, pageIds: selected }))}>Duplicate selected pages</button>
      <button className="tool-item" role="menuitem" disabled={!doc || !selected.length} onClick={() => run(() => doc && dispatch({ type: 'createDoc', pageIds: selected, fromDocId: doc.id }))}>Extract to new document</button>
      <button className="tool-item" role="menuitem" disabled={!doc || !selected.length} onClick={() => run(() => doc && dispatch({ type: 'deletePages', docId: doc.id, pageIds: selected }))}>Delete selected pages</button>
      <button className="tool-item" role="menuitem" disabled={!doc} onClick={() => run(onCrop)}>Crop pages…</button>
      <button className="tool-item" role="menuitem" disabled={!doc} onClick={() => run(() => doc && dispatch({ type: 'reverse', docId: doc.id }))}>Reverse document</button>
      <button className="tool-item" role="menuitem" disabled={!doc || !selected.length} onClick={() => run(() => selected.forEach((id) => dispatch({ type: 'rotatePage', pageId: id, delta: 90 })))}>Rotate selected 90°</button>
    </div>
  );
}
