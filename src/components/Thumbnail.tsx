import { useEffect, useRef, useState } from 'react';
import { renderPage } from '../core/pdfjs';
import type { PageInstance } from '../core/types';

type Props = {
  page: PageInstance;
  selected: boolean;
  focused: boolean;
  onSelect: (event: React.MouseEvent) => void;
  onDragStart: (event: React.DragEvent) => void;
  onDragOver: (event: React.DragEvent) => void;
  onDrop: (event: React.DragEvent) => void;
  size: number;
};

export function Thumbnail({ page, selected, focused, onSelect, onDragStart, onDragOver, onDrop, size }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !canvasRef.current) return;
    let cancelled = false;
    if (!page.sourceId) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        canvas.width = 160;
        canvas.height = 207;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#ccc';
        ctx.strokeRect(10, 10, 140, 187);
      }
      return;
    }
    const canvas = canvasRef.current;
    const cssWidth = canvas.clientWidth || 220;
    const dpr = typeof window === 'undefined' ? 1 : (window.devicePixelRatio || 1);
    renderPage(page.sourceId, page.sourcePageIndex, canvas, (cssWidth * dpr) / page.width, { deviceScale: 1, cssSize: false })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [visible, page.sourceId, page.sourcePageIndex, size]);

  const pct = (value: number, total: number) => `${(value / total) * 100}%`;

  return (
    <div ref={wrapRef} className="thumb-wrap" data-page-id={page.id} style={{ width: size }}>
      <button
        type="button"
        className={`thumb${selected ? ' is-selected' : ''}${focused ? ' is-focused' : ''}`}
        onClick={onSelect}
        draggable
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        aria-pressed={selected}
        aria-label={`Page ${page.label}${page.marks.length ? `, ${page.marks.length} markup` : ''}`}
      >
        <canvas ref={canvasRef} aria-hidden="true" />
        <span className="thumb-label">{page.label}</span>
        {error && <span className="thumb-label" style={{ right: 6, left: 'auto', background: '#b91c1c' }}>!</span>}
        <span className="thumb-marks">
          {page.marks.map((mark) =>
            mark.kind === 'highlight' ? (
              <span
                key={mark.id}
                className="thumb-mark"
                style={{
                  left: pct(mark.rect.x1, page.width),
                  right: pct(page.width - mark.rect.x2, page.width),
                  top: pct(page.height - mark.rect.y2, page.height),
                  bottom: pct(mark.rect.y1, page.height),
                }}
              />
            ) : null,
          )}
        </span>
      </button>
    </div>
  );
}
