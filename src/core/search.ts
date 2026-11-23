import type { WorkspaceState } from './types';

export type SearchHit = {
  docId: string;
  docName: string;
  pageId: string;
  label: string;
  snippet: string;
  matchIndex: number;
};

export type TextProvider = (sourceId: string, pageIndex: number) => Promise<string>;

export async function searchWorkspace(
  state: WorkspaceState,
  query: string,
  scope: 'current' | 'all',
  provider?: TextProvider,
): Promise<SearchHit[]> {
  const term = query.trim().toLowerCase();
  if (!term) return [];
  const documents = scope === 'current'
    ? state.documents.filter((doc) => doc.id === state.activeDocumentId)
    : state.documents;
  const textProvider: TextProvider = provider ?? (async () => '');
  const hits: SearchHit[] = [];
  for (const doc of documents) {
    for (const pageId of doc.pageIds) {
      const page = state.pages[pageId];
      if (!page?.sourceId) continue;
      const text = await textProvider(page.sourceId, page.sourcePageIndex);
      const lower = text.toLowerCase();
      let from = 0;
      let matchIndex = 0;
      while (matchIndex < 20) {
        const at = lower.indexOf(term, from);
        if (at < 0) break;
        hits.push({
          docId: doc.id,
          docName: doc.name,
          pageId,
          label: page.label,
          snippet: text.slice(Math.max(0, at - 28), at + term.length + 42).replace(/\s+/g, ' ').trim(),
          matchIndex,
        });
        from = at + term.length;
        matchIndex += 1;
      }
    }
  }
  return hits;
}
