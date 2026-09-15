import { normalizeUrl } from '../duplicate-detector/detector.js';
import { getActiveBookmarks, trashBookmark } from '../../database/indexeddb/db.js';

/**
 * Collect every normalized bookmark URL present in a chrome.bookmarks tree.
 */
export function collectLiveUrls(tree) {
  const urls = new Set();
  (function walk(nodes) {
    for (const node of nodes || []) {
      if (node.url) urls.add(normalizeUrl(node.url));
      if (node.children) walk(node.children);
    }
  })(tree);
  return urls;
}

/**
 * Trash IndexedDB bookmarks whose URL no longer exists in Chrome.
 *
 * This is the safety net for native deletions the event stream misses: deleting a
 * folder fires onRemoved only for the folder (not its contents), and a delete that
 * lands mid-sync is otherwise dropped. Comparing the DB against the live tree
 * catches all of them in one pass.
 *
 * Returns { checked, trashed, skipped? }. An empty tree is treated as "not loaded
 * yet" and skipped, so a cold service worker can never trash the whole library.
 */
export async function reconcileRemovedBookmarks(tree, { onTrashed } = {}) {
  const liveUrls = collectLiveUrls(tree);
  if (liveUrls.size === 0) {
    return { checked: 0, trashed: 0, skipped: 'empty-tree' };
  }

  const active = await getActiveBookmarks();
  let trashed = 0;
  for (const bookmark of active) {
    if (liveUrls.has(normalizeUrl(bookmark.url))) continue;
    await trashBookmark(bookmark.url);
    onTrashed?.(bookmark);
    trashed++;
  }
  return { checked: active.length, trashed };
}
