import { ENGINE_ROOT_FOLDER } from './paths.js';
import { api } from '../../shared/platform.js';

export { getFolderPath } from './paths.js';

// Cache: title → folder ID, prevents race conditions during concurrent moves
const folderCache = new Map();
// In-flight creations keyed the same way. Without this, two concurrent callers
// both see "missing" and each create a folder → duplicate "Engine Organized".
const folderInFlight = new Map();

// Resolved Bookmarks Bar node, reused for every move. Without this, each of the
// (10 concurrent) bulk-sync moves re-fetched the whole bookmark tree.
let cachedBarNode = null;
// Shared in-flight resolution: concurrent callers must not each run the retry
// loop, which produced a screenful of "Could not find Bookmarks Bar" errors.
let barNodeInFlight = null;
// A missing bar is usually a not-yet-loaded bookmark model, not a one-off.
// Warn once per sync instead of once per bookmark.
let barLookupWarned = false;

/**
 * Helper to find or create a folder by title under a specific parent.
 * Caches results and dedupes concurrent creations.
 */
async function getOrCreateFolder(parentId, title) {
  const cacheKey = `${parentId}:${title}`;
  if (folderCache.has(cacheKey)) {
    // Verify cached folder still exists
    try {
      await api.bookmarks.get(folderCache.get(cacheKey));
      return folderCache.get(cacheKey);
    } catch {
      folderCache.delete(cacheKey); // Folder was deleted, recreate
    }
  }

  // Another caller is already creating this exact folder — reuse its result
  if (folderInFlight.has(cacheKey)) return folderInFlight.get(cacheKey);

  const promise = (async () => {
    const children = await api.bookmarks.getChildren(parentId);
    const existing = children.find(node => node.title === title && !node.url);
    if (existing) {
      folderCache.set(cacheKey, existing.id);
      return existing.id;
    }
    const created = await api.bookmarks.create({ parentId, title });
    folderCache.set(cacheKey, created.id);
    return created.id;
  })().finally(() => folderInFlight.delete(cacheKey));

  folderInFlight.set(cacheKey, promise);
  return promise;
}

// Known toolbar/bar folder IDs across engines.
// Chromium: "1". Firefox: "toolbar_____".
const BOOKMARKS_BAR_IDS = ['1', 'toolbar_____'];

// A cold service worker can briefly see a bookmark tree with no children at all
// (the profile's bookmark model isn't loaded yet). These waits cover that window.
const BAR_LOOKUP_ATTEMPTS = 4;
const BAR_LOOKUP_DELAY_MS = 150;

/** Pick the Bookmarks Bar node out of a tree snapshot. Sync, no logging. */
function findBookmarksBarNode(rootTree) {
  const root = rootTree?.[0];
  const children = root?.children || [];
  if (children.length === 0) return null;

  for (const id of BOOKMARKS_BAR_IDS) {
    const node = children.find(n => n.id === id);
    if (node) return node;
  }

  // The toolbar is the first folder child of the root in Chrome and Firefox
  return children.find(n => !n.url) || null;
}

/**
 * Resolve the Bookmarks Bar (toolbar) node.
 *
 * Chrome documents id "1", but that is not universal: Firefox uses
 * "toolbar_____", and a just-started service worker can briefly see a bookmark
 * tree whose children aren't populated yet. Retries, then falls back to the
 * first root folder, so a differing id can never silently disable every move.
 *
 * The resolved node is cached for the rest of the sync, and concurrent callers
 * share one resolution. `attempts`/`delayMs` are overridable so callers that
 * shouldn't wait (and tests) can use a shorter budget.
 */
export async function getBookmarksBarNode({
  attempts = BAR_LOOKUP_ATTEMPTS,
  delayMs = BAR_LOOKUP_DELAY_MS,
} = {}) {
  if (cachedBarNode) {
    try {
      await api.bookmarks.get(cachedBarNode.id);
      return cachedBarNode;
    } catch {
      cachedBarNode = null; // Bar gone (profile switched) — re-resolve below
    }
  }

  if (barNodeInFlight) return barNodeInFlight;

  barNodeInFlight = (async () => {
    let lastTree;
    for (let attempt = 0; attempt < attempts; attempt++) {
      lastTree = await api.bookmarks.getTree();
      const node = findBookmarksBarNode(lastTree);
      if (node) {
        cachedBarNode = { id: node.id, title: node.title };
        return cachedBarNode;
      }
      if (attempt < attempts - 1) {
        await new Promise(r => setTimeout(r, delayMs * (attempt + 1)));
      }
    }

    if (!barLookupWarned) {
      barLookupWarned = true;
      const children = lastTree?.[0]?.children || [];
      console.error(
        'Recall: could not locate Bookmarks Bar — bookmark tree came back empty. ' +
        'Any moves are queued and retried. Root children: ' +
        JSON.stringify(children.map(c => ({ id: c.id, title: c.title })))
      );
    }
    return null;
  })().finally(() => { barNodeInFlight = null; });

  return barNodeInFlight;
}

/**
 * Creates the folder hierarchy: Bookmarks Bar > Engine Organized > Category > [Group >] Leaf
 * Subcategory paths use " / " separator: "Web / Frontend" → Engine Organized / Development / Web / Frontend
 * Returns the final folder ID.
 */
export async function getTargetFolderId(category, subcategory) {
  const barNode = await getBookmarksBarNode();

  // getBookmarksBarNode() already logged the (once-per-sync) diagnostic
  if (!barNode) return null;

  const engineRootId = await getOrCreateFolder(barNode.id, ENGINE_ROOT_FOLDER);
  let currentId = await getOrCreateFolder(engineRootId, category);

  if (!subcategory) return currentId;

  // Split "Group / Leaf" into ["Group", "Leaf"] and create nested folders
  const parts = subcategory.split(' / ').map(s => s.trim()).filter(Boolean);
  for (const part of parts) {
    currentId = await getOrCreateFolder(currentId, part);
  }

  return currentId;
}

/**
 * Moves a bookmark into the correct category folder.
 *
 * Prefers the Chrome ID supplied by the caller (e.g. api.bookmarks.onCreated),
 * which is guaranteed to reference the node that was just created. Falls back to
 * a URL lookup for bulk sync, where no event ID exists and IDs can go stale.
 * Returns the target folder ID, or null when there is nothing to move to.
 */
export async function moveBookmarkToCategory(bookmarkUrl, category, subcategory, chromeId) {
  try {
    const targetFolderId = await getTargetFolderId(category, subcategory);
    if (!targetFolderId) return null;

    let bookmark = null;
    if (chromeId) {
      try {
        [bookmark] = await api.bookmarks.get(chromeId);
      } catch {
        bookmark = null; // Stale ID — fall back to URL lookup
      }
    }
    if (!bookmark) {
      // Find bookmark by URL — Chrome IDs can go stale between sync phases
      const results = await api.bookmarks.search({ url: bookmarkUrl });
      bookmark = results[0];
    }
    if (!bookmark) {
      console.warn('Bookmark not found in Chrome:', bookmarkUrl);
      return null;
    }

    await api.bookmarks.move(bookmark.id, { parentId: targetFolderId });
    return targetFolderId;
  } catch (error) {
    console.error('Failed to move bookmark:', error);
    return null;
  }
}

/**
 * Recursively delete empty folders throughout the bookmarks tree.
 * Keeps "Engine Organized" and its category/group structure intact.
 * Cleans up old empty folders anywhere (user's original structure).
 */
export async function cleanupEmptyFolders() {
  try {
    const barNode = await getBookmarksBarNode();
    if (!barNode) return;

    // Recursively find and delete empty folders
    async function cleanNode(nodeId) {
      const children = await api.bookmarks.getChildren(nodeId);
      for (const child of children) {
        if (child.url) continue; // Skip bookmarks, only process folders
        await cleanNode(child.id); // Recurse into subfolders first
        // After recursion, check if this folder is now empty
        const remaining = await api.bookmarks.getChildren(child.id);
        if (remaining.length === 0 && child.title !== ENGINE_ROOT_FOLDER) {
          await api.bookmarks.removeTree(child.id);
        }
      }
    }

    await cleanNode(barNode.id);
  } catch (e) {
    console.warn('Cleanup failed:', e);
  }
}

/**
 * Merge duplicate "Engine Organized" folders under the bookmark bar.
 * Moves all bookmarks from duplicates into the first one, then deletes the empties.
 */
export async function mergeDuplicateEngineFolders() {
  try {
    const barNode = await getBookmarksBarNode();

    if (!barNode) {
      // getBookmarksBarNode() already logged the actual tree structure
      return;
    }

    await mergeInNode(barNode);
  } catch (e) {
    console.warn('mergeDuplicateEngineFolders failed:', e);
  }
}

async function mergeInNode(parentNode) {
  const children = await api.bookmarks.getChildren(parentNode.id);
  const engineFolders = children.filter(n => n.title === ENGINE_ROOT_FOLDER && !n.url);

  console.log(`mergeInNode: found ${engineFolders.length} "Engine Organized" folders under "${parentNode.title}" (id=${parentNode.id})`);

  if (engineFolders.length <= 1) return;

  // Keep the first one, move everything from the rest into it
  const target = engineFolders[0];
  for (let i = 1; i < engineFolders.length; i++) {
    const duplicate = engineFolders[i];
    console.log(`Merging duplicate folder id=${duplicate.id} into id=${target.id}`);

    // Recursively move all descendants by URL lookup
    async function moveAllChildren(fromId, toId) {
      // Fresh lookup each time — IDs can change
      let kids;
      try {
        kids = await api.bookmarks.getChildren(fromId);
      } catch {
        return; // Folder already gone
      }
      for (const kid of kids) {
        try {
          if (kid.url) {
            // Bookmark: search by URL and move
            const found = await api.bookmarks.search({ url: kid.url });
            if (found.length) {
              await api.bookmarks.move(found[0].id, { parentId: toId });
            }
          } else {
            // Subfolder: move by ID, then recurse
            await api.bookmarks.move(kid.id, { parentId: toId });
          }
        } catch (e) {
          console.warn('Failed to move child during merge:', kid.title, e.message);
        }
      }
    }

    await moveAllChildren(duplicate.id, target.id);

    // Delete the now-empty duplicate
    try {
      const remaining = await api.bookmarks.getChildren(duplicate.id);
      if (remaining.length === 0) {
        await api.bookmarks.removeTree(duplicate.id);
        console.log(`Removed duplicate folder id=${duplicate.id}`);
      } else {
        console.warn(`Duplicate folder not empty after merge, skipping delete: ${remaining.length} items left`);
      }
    } catch (e) {
      console.warn('Failed to remove duplicate folder:', e.message);
    }
  }

  // Also clean up empty subfolders inside the target
  await cleanupEmptySubfolders(target.id);

  console.log('Merged duplicate Engine Organized folders');
}

async function cleanupEmptySubfolders(folderId) {
  let children;
  try {
    children = await api.bookmarks.getChildren(folderId);
  } catch {
    return;
  }
  for (const child of children) {
    if (child.url) continue; // Skip bookmarks
    await cleanupEmptySubfolders(child.id); // Recurse first
    // Check if empty after recursing
    try {
      const remaining = await api.bookmarks.getChildren(child.id);
      if (remaining.length === 0) {
        console.log(`Removing empty subfolder: "${child.title}" (id=${child.id})`);
        await api.bookmarks.removeTree(child.id);
      }
    } catch {
      // Folder already gone
    }
  }
}

/**
 * Clear the folder cache. Call between sync runs.
 */
export function clearFolderCache() {
  folderCache.clear();
  cachedBarNode = null;
  barLookupWarned = false;
}
