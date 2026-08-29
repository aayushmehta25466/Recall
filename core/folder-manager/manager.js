// Cache: title → folder ID, prevents race conditions during concurrent moves
const folderCache = new Map();

/**
 * Helper to find or create a folder by title under a specific parent.
 * Caches results to avoid duplicate creation from concurrent calls.
 */
async function getOrCreateFolder(parentId, title) {
  const cacheKey = `${parentId}:${title}`;
  if (folderCache.has(cacheKey)) return folderCache.get(cacheKey);

  const children = await chrome.bookmarks.getChildren(parentId);
  const existing = children.find(node => node.title === title && !node.url);
  if (existing) {
    folderCache.set(cacheKey, existing.id);
    return existing.id;
  }
  const created = await chrome.bookmarks.create({ parentId, title });
  folderCache.set(cacheKey, created.id);
  return created.id;
}

/**
 * Returns the Bookmarks Bar node by Chrome's guaranteed ID "1".
 * Returns null if not found (never falls back to a different node).
 */
function getBookmarksBarNode(rootTree) {
  const root = rootTree[0];
  return root.children?.find(n => n.id === '1') || null;
}

/**
 * Creates the folder hierarchy: Bookmarks Bar > Engine Organized > Category > [Group >] Leaf
 * Subcategory paths use " / " separator: "Web / Frontend" → Engine Organized / Development / Web / Frontend
 * Returns the final folder ID.
 */
export async function getTargetFolderId(category, subcategory) {
  const rootTree = await chrome.bookmarks.getTree();
  const barNode = getBookmarksBarNode(rootTree);

  if (!barNode) {
    console.error('Could not find Bookmarks Bar folder');
    return null;
  }

  const engineRootId = await getOrCreateFolder(barNode.id, 'Engine Organized');
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
 * Returns the source parent ID so we can delete the original after.
 */
export async function moveBookmarkToCategory(bookmarkId, category, subcategory) {
  try {
    const targetFolderId = await getTargetFolderId(category, subcategory);
    if (!targetFolderId) return null;

    // Get the bookmark to find its current parent
    const [bookmark] = await chrome.bookmarks.get(bookmarkId);
    const sourceParentId = bookmark.parentId;

    await chrome.bookmarks.move(bookmarkId, { parentId: targetFolderId });
    return sourceParentId;
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
    const rootTree = await chrome.bookmarks.getTree();
    const barNode = getBookmarksBarNode(rootTree);
    if (!barNode) return;

    // Recursively find and delete empty folders
    async function cleanNode(nodeId) {
      const children = await chrome.bookmarks.getChildren(nodeId);
      for (const child of children) {
        if (child.url) continue; // Skip bookmarks, only process folders
        await cleanNode(child.id); // Recurse into subfolders first
        // After recursion, check if this folder is now empty
        const remaining = await chrome.bookmarks.getChildren(child.id);
        if (remaining.length === 0 && child.title !== 'Engine Organized') {
          await chrome.bookmarks.removeTree(child.id);
        }
      }
    }

    await cleanNode(barNode.id);
  } catch (e) {
    console.warn('Cleanup failed:', e);
  }
}

/**
 * Clear the folder cache. Call between sync runs.
 */
export function clearFolderCache() {
  folderCache.clear();
}
