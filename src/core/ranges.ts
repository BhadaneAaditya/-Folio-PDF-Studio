/** Parse user-entered page ranges such as "1-3, 6, 9-11" into zero-based indices. */
export function parseRanges(input: string, pageCount: number): number[] {
  const result = new Set<number>();
  for (const raw of input.split(/[,;]/)) {
    const token = raw.trim();
    if (!token) continue;
    const match = /^(\d+)\s*(?:[-–]\s*(\d+))?$/.exec(token);
    if (!match) continue;
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : start;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 1 || end < start) continue;
    for (let page = Math.max(1, start); page <= Math.min(pageCount, end); page += 1) result.add(page - 1);
  }
  return [...result].sort((a, b) => a - b);
}

export function formatRanges(indices: number[]): string {
  if (indices.length === 0) return '';
  const pages = indices.map((index) => index + 1).sort((a, b) => a - b);
  const parts: string[] = [];
  let start = pages[0]!;
  let end = pages[0]!;
  for (const page of pages.slice(1)) {
    if (page === end + 1) { end = page; continue; }
    parts.push(start === end ? `${start}` : `${start}-${end}`);
    start = end = page;
  }
  parts.push(start === end ? `${start}` : `${start}-${end}`);
  return parts.join(', ');
}
