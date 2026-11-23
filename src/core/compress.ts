import { PDFDocument } from 'pdf-lib';

/** Structural compression: object streams + metadata cleanup, with no visual change. */
export async function compressLossless(bytes: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  doc.setSubject('');
  doc.setKeywords([]);
  doc.setProducer('Folio PDF Studio');
  return doc.save({ useObjectStreams: true });
}

/** Return the smaller of two candidates so compression can never make the file larger. */
export function pickSmaller(original: Uint8Array, candidate: Uint8Array): Uint8Array {
  return candidate.length < original.length ? candidate : original;
}

export type ExportCompression = {
  mode: 'none' | 'lossless' | 'raster';
  dpi: number;
  quality: number;
};

export const DEFAULT_EXPORT_COMPRESSION: ExportCompression = { mode: 'none', dpi: 110, quality: 0.7 };

export type RasterCompressor = (bytes: Uint8Array, dpi: number, quality: number) => Promise<Uint8Array>;

/** Apply the chosen compression at download time, never returning a larger file. */
export async function applyExportCompression(
  bytes: Uint8Array,
  option: ExportCompression,
  raster?: RasterCompressor,
): Promise<Uint8Array> {
  if (option.mode === 'none') return bytes;
  let candidate = bytes;
  if (option.mode === 'lossless') candidate = await compressLossless(bytes);
  else if (raster) candidate = await raster(bytes, option.dpi, option.quality);
  return pickSmaller(bytes, candidate);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
