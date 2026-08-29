import MiniSearch from 'minisearch';
import { getActiveBookmarks } from '../../database/indexeddb/db.js';

// MiniSearch index instance (singleton)
let searchIndex = null;
let indexVersion = 0; // Increment when bookmarks change

// MiniSearch configuration
const SEARCH_OPTIONS = {
  fields: ['title', 'url', 'description', 'category', 'subcategory', 'tags', 'keywords'],
  storeFields: ['url', 'title'], // Store url and title for fast access
  searchOptions: {
    boost: {
      title: 2,      // Title matches are most relevant
      tags: 1.5,     // Tags are important
      keywords: 1.5, // Keywords are important
      category: 1,   // Category matches are useful
      url: 0.5,      // URL matches are less important
      description: 0.3, // Description matches are least important
    },
    fuzzy: 0.2,           // 20% tolerance for typos
    prefix: true,         // Match prefixes ("react" matches "reactjs")
    combineWith: 'AND',   // All terms must match
  },
};

/**
 * Build or rebuild the search index from all active bookmarks.
 * Call this once on startup and after bulk operations.
 */
export async function buildSearchIndex() {
  const bookmarks = await getActiveBookmarks();

  searchIndex = new MiniSearch(SEARCH_OPTIONS);

  // Add all bookmarks with full text
  const documents = bookmarks.map(b => ({
    id: b.url, // Use URL as unique ID
    title: b.title || '',
    url: b.url || '',
    description: b.description || '',
    category: b.category || '',
    subcategory: b.subcategory || '',
    tags: (b.tags || []).join(' '),
    keywords: (b.keywords || []).join(' '),
  }));

  searchIndex.addAll(documents);
  indexVersion++;

  return { count: documents.length, version: indexVersion };
}

/**
 * Search bookmarks with BM25 ranking, fuzzy matching, and typo tolerance.
 * Returns ranked results with scores.
 */
export async function searchBookmarks(query) {
  // Get all active bookmarks for empty query or fallback
  const bookmarks = await getActiveBookmarks();

  // Empty query: return all active bookmarks
  if (!query || query.trim() === '') {
    return bookmarks
      .sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded))
      .map(b => ({ ...b, _score: 0 }));
  }

  // Build index if not exists
  if (!searchIndex) {
    await buildSearchIndex();
  }

  const q = query.trim();

  // Search with MiniSearch (BM25 + fuzzy)
  let results = searchIndex.search(q, SEARCH_OPTIONS.searchOptions);

  // If no results with AND, try OR for better recall
  if (results.length === 0) {
    results = searchIndex.search(q, {
      ...SEARCH_OPTIONS.searchOptions,
      combineWith: 'OR',
    });
  }

  // Map results back to full bookmark objects
  const resultMap = new Map();
  for (const r of results) {
    resultMap.set(r.id, r.score);
  }

  // Get full bookmark objects from IndexedDB
  const resultUrls = results.map(r => r.id);
  const resultBookmarks = bookmarks.filter(b => resultUrls.includes(b.url));

  // Add scores and sort by score
  return resultBookmarks
    .map(b => ({ ...b, _score: resultMap.get(b.url) || 0 }))
    .sort((a, b) => b._score - a._score);
}

/**
 * Clear the search index.
 */
export function clearSearchIndex() {
  searchIndex = null;
  indexVersion = 0;
}
