import { getActiveBookmarks } from '../../database/indexeddb/db.js';
import { getSettings } from '../../shared/settings.js';
import { semanticSearch } from '../search-engine/semantic.js';

/**
 * Search bookmarks. Local keyword search first, semantic AI fallback if few results.
 * Only returns non-trashed bookmarks.
 */
export async function searchBookmarks(query) {
  const bookmarks = await getActiveBookmarks();

  if (!query || query.trim() === '') {
    return bookmarks.sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded)).slice(0, 50);
  }

  const q = query.toLowerCase();

  // Local keyword search
  const scored = bookmarks.map(b => {
    let score = 0;
    if ((b.title || '').toLowerCase().includes(q)) score += 10;
    if ((b.url || '').toLowerCase().includes(q)) score += 5;
    if ((b.keywords || []).some(k => k.toLowerCase().includes(q))) score += 5;
    if ((b.tags || []).some(t => t.toLowerCase().includes(q))) score += 5;
    if ((b.category || '').toLowerCase().includes(q) || (b.subcategory || '').toLowerCase().includes(q)) score += 3;
    if ((b.description || '').toLowerCase().includes(q)) score += 1;
    return { bookmark: b, score };
  });

  const localResults = scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score).map(s => s.bookmark);

  // Semantic fallback: if few results and query is long enough
  if (localResults.length < 3 && query.split(/\s+/).length >= 3) {
    try {
      const settings = await getSettings();
      const semanticResults = await semanticSearch(query, settings);
      if (semanticResults.length > 0) {
        // Merge: local first, then semantic (dedupe by URL)
        const seen = new Set(localResults.map(b => b.url));
        for (const b of semanticResults) {
          if (!seen.has(b.url)) {
            localResults.push(b);
            seen.add(b.url);
          }
        }
      }
    } catch { /* semantic search is optional, ignore errors */ }
  }

  return localResults;
}
