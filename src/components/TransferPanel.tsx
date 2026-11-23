import { useEffect, useRef, useState } from 'react';
import type { Action } from '../core/store';
import type { TransferAction, WorkspaceState } from '../core/types';

type Props = {
  state: WorkspaceState;
  dispatch: React.Dispatch<Action>;
  preset: TransferAction;
  onToast: (message: string) => void;
  onAnnounce: (message: string) => void;
};

export function TransferPanel({ state, dispatch, preset, onToast, onAnnounce }: Props) {
  const [sourceDocId, setSourceDocId] = useState('');
  const [destDocId, setDestDocId] = useState('');
  const [anchorPageId, setAnchorPageId] = useState('');
  const [position, setPosition] = useState<'before' | 'after'>('before');
  const actionRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (state.activeDocumentId) setSourceDocId(state.activeDocumentId);
  }, [state.activeDocumentId]);

  useEffect(() => {
    if (!destDocId) {
      const other = state.documents.find((d) => d.id !== state.activeDocumentId);
      setDestDocId(other?.id ?? state.activeDocumentId ?? '');
    }
  }, [state.activeDocumentId, state.documents, destDocId]);

  useEffect(() => {
    if (preset) actionRef.current?.focus();
  }, [preset]);

  const sourceDoc = state.documents.find((d) => d.id === sourceDocId);
  const destDoc = state.documents.find((d) => d.id === destDocId);
  const selected = state.selectedPageIds.filter((id) => sourceDoc?.pageIds.includes(id));

  const run = (action: Extract<TransferAction, 'move' | 'copy' | 'swap'>) => {
    if (!sourceDoc || !destDoc || selected.length === 0) {
      onToast('Select pages in the source document first.');
      return;
    }
    const labels = selected.map((id) => state.pages[id]?.label).join(', ');
    if (action === 'swap') {
      if (selected.length !== 1 || !anchorPageId) {
        onToast('Select one page and a swap target.');
        return;
      }
      dispatch({ type: 'swap', a: { docId: sourceDoc.id, pageId: selected[0]! }, b: { docId: destDoc.id, pageId: anchorPageId } });
      const message = `Swapped ${labels} with ${state.pages[anchorPageId]?.label}.`;
      onToast(message);
      onAnnounce(message);
      return;
    }
    dispatch({
      type: action,
      pageIds: selected,
      fromDocId: sourceDoc.id,
      toDocId: destDoc.id,
      anchorPageId: anchorPageId || null,
      position,
    });
    const message = `${action === 'move' ? 'Moved' : 'Copied'} ${labels} to ${destDoc.name}${anchorPageId ? ` ${position} ${state.pages[anchorPageId]?.label}` : ' at the end'}.`;
    onToast(message);
    onAnnounce(message);
  };

  return (
    <section className="transfer" aria-label="Page transfer controls">
      <div className="transfer-section">
        <label className="field-label" htmlFor="transfer-source">Source document</label>
        <select id="transfer-source" value={sourceDocId} onChange={(event) => { setSourceDocId(event.target.value); dispatch({ type: 'setActiveDoc', docId: event.target.value }); }}>
          {state.documents.map((doc) => <option key={doc.id} value={doc.id}>{doc.name}</option>)}
        </select>
      </div>
      <div className="transfer-section" style={{ minWidth: 150 }}>
        <span className="field-label">Selected pages</span>
        <div className="transfer-summary" style={{ color: 'var(--text)' }}>
          {selected.length ? selected.map((id) => state.pages[id]?.label).join(', ') : 'None — click a thumbnail'}
        </div>
      </div>
      <div className="transfer-section">
        <label className="field-label" htmlFor="transfer-dest">Destination</label>
        <select id="transfer-dest" value={destDocId} onChange={(event) => setDestDocId(event.target.value)}>
          {state.documents.map((doc) => <option key={doc.id} value={doc.id}>{doc.name}</option>)}
        </select>
      </div>
      <div className="transfer-section">
        <label className="field-label" htmlFor="transfer-anchor">{preset === 'swap' ? 'Swap with' : 'Insert relative to'}</label>
        <select id="transfer-anchor" value={anchorPageId} onChange={(event) => setAnchorPageId(event.target.value)}>
          <option value="">End of document</option>
          {destDoc?.pageIds.map((id) => <option key={id} value={id}>{state.pages[id]?.label}</option>)}
        </select>
      </div>
      {preset !== 'swap' && (
        <div className="transfer-section">
          <label className="field-label" htmlFor="transfer-position">Position</label>
          <select id="transfer-position" value={position} onChange={(event) => setPosition(event.target.value as 'before' | 'after')}>
            <option value="before">Before</option>
            <option value="after">After</option>
          </select>
        </div>
      )}
      <div className="transfer-actions">
        <button ref={actionRef} className={`btn ${preset === 'move' ? 'btn-primary' : ''}`} onClick={() => run('move')}>Move</button>
        <button className={`btn ${preset === 'copy' ? 'btn-primary' : ''}`} onClick={() => run('copy')}>Copy</button>
        <button className={`btn ${preset === 'swap' ? 'btn-primary' : ''}`} onClick={() => run('swap')}>Swap</button>
      </div>
    </section>
  );
}
