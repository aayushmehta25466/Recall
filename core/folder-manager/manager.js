// Cache: title → folder ID, prevents race conditions during concurrent moves
const folderCache = new Map();

/**
 * Helper to find or create a folder by title under a specific parent.
 * Caches results to avoid duplicate creation from concurrent calls.
 */
async function getOrCreateFolder(parentId, title) {
  const cacheKey = `${parentId}:${title}`;
  if (folderCache.has(cacheKey)) {
    // Verify cached folder still exists
    try {
      await chrome.bookmarks.get(folderCache.get(cacheKey));
      return folderCache.get(cacheKey);
    } catch {
      folderCache.delete(cacheKey); // Folder was deleted, recreate
    }
  }

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
 * Merge duplicate "Engine Organized" folders under the bookmark bar.
 * Moves all bookmarks from duplicates into the first one, then deletes the empties.
 */
export async function mergeDuplicateEngineFolders() {
  try {
    const rootTree = await chrome.bookmarks.getTree();
    const barNode = getBookmarksBarNode(rootTree);
    if (!barNode) return;

    const children = await chrome.bookmarks.getChildren(barNode.id);
    const engineFolders = children.filter(n => n.title === 'Engine Organized' && !n.url);

    if (engineFolders.length <= 1) return;

    console.log(`Found ${engineFolders.length} "Engine Organized" folders, merging...`);

    // Keep the first one, move everything from the rest into it
    const target = engineFolders[0];
    for (let i = 1; i < engineFolders.length; i++) {
      const duplicate = engineFolders[i];
      const dupChildren = await chrome.bookmarks.getChildren(duplicate.id);

      // Move each child (bookmark or subfolder) into the target
      for (const child of dupChildren) {
        try {
          await chrome.bookmarks.move(child.id, { parentId: target.id });
        } catch (e) {
          console.warn('Failed to move child during merge:', child.title, e);
        }
      }

      // Delete the now-empty duplicate
      try {
        await chrome.bookmarks.removeTree(duplicate.id);
      } catch (e) {
        console.warn('Failed to remove duplicate folder:', e);
      }
    }

    console.log('Merged duplicate Engine Organized folders');
  } catch (e) {
    console.warn('mergeDuplicateEngineFolders failed:', e);
  }
}

/**
 * Clear the folder cache. Call between sync runs.
 */
export function clearFolderCache() {
  folderCache.clear();
}
