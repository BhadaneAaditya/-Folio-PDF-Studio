import type { CropBox, PageInstance } from './types';

export type CropPreset = 'original' | 'a4' | 'letter' | 'custom';

export function computeCrop(
  page: PageInstance,
  preset: CropPreset,
  margins: number,
  custom?: { width: number; height: number },
): CropBox | null {
  if (preset === 'original') return null;
  const target = preset === 'a4' ? { width: 595, height: 842 }
    : preset === 'letter' ? { width: 612, height: 792 }
    : (custom ?? { width: page.width, height: page.height });
  const pageRatio = page.width / page.height;
  const targetRatio = target.width / Math.max(1, target.height);
  let width = page.width;
  let height = page.height;
  if (targetRatio > pageRatio) height = page.width / targetRatio;
  else width = page.height * targetRatio;

  const left = (page.width - width) / 2 + margins;
  const bottom = (page.height - height) / 2 + margins;
  return {
    left: Math.max(0, left),
    bottom: Math.max(0, bottom),
    right: Math.min(page.width, left + width - margins * 2),
    top: Math.min(page.height, bottom + height - margins * 2),
  };
}
