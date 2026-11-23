import { useRef, useState } from 'react';

type Props = {
  onFiles: (files: File[]) => void;
  onSamples: () => void;
  onRestore: () => void;
  hasDraft: boolean;
};

export function EmptyState({ onFiles, onSamples, onRestore, hasDraft }: Props) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="empty">
      <div className="empty-card">
        <div className="drop-icon">▤</div>
        <h1>Open PDFs</h1>
        <p>
          Open several documents in one workspace, then move, copy, and swap pages between them.
          Everything stays on your device — no account, no upload, no watermark.
        </p>
        <div
          className={`drop-area${dragging ? ' is-dragging' : ''}`}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            onFiles(Array.from(event.dataTransfer.files));
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Drop PDF files here</div>
          <div style={{ fontSize: 13, color: 'var(--text-2)' }}>or choose files from your computer</div>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            className="sr-only"
            aria-label="Choose PDF files"
            onChange={(event) => {
              onFiles(Array.from(event.target.files ?? []));
              event.target.value = '';
            }}
          />
          <div className="empty-actions">
            <button className="btn btn-primary" onClick={() => inputRef.current?.click()}>Choose files</button>
            <button className="btn" onClick={onSamples}>Try sample files</button>
            {hasDraft && <button className="btn btn-quiet" onClick={onRestore}>Restore draft</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
