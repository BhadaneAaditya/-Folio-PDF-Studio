export type FitMode = 'page' | 'width' | 'height';

/** Zoom factor that fits a page inside the available stage, with padding. */
export function computeFitZoom(
  pageWidth: number,
  pageHeight: number,
  stageWidth: number,
  stageHeight: number,
  mode: FitMode,
  padding = 48,
): number {
  const availableWidth = Math.max(80, stageWidth - padding);
  const availableHeight = Math.max(80, stageHeight - padding);
  const widthZoom = availableWidth / Math.max(1, pageWidth);
  const heightZoom = availableHeight / Math.max(1, pageHeight);
  if (mode === 'width') return clampZoom(widthZoom);
  if (mode === 'height') return clampZoom(heightZoom);
  return clampZoom(Math.min(widthZoom, heightZoom));
}

export function clampZoom(value: number): number {
  return Math.max(0.1, Math.min(8, Math.round(value * 100) / 100));
}

export const ZOOM_PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
