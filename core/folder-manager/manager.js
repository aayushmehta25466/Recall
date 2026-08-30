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
 * Looks up by URL (not Chrome ID) to avoid stale ID errors.
 */
export async function moveBookmarkToCategory(bookmarkUrl, category, subcategory) {
  try {
    const targetFolderId = await getTargetFolderId(category, subcategory);
    if (!targetFolderId) return null;

    // Find bookmark by URL — Chrome IDs can go stale between sync phases
    const results = await chrome.bookmarks.search({ url: bookmarkUrl });
    if (!results.length) {
      console.warn('Bookmark not found in Chrome:', bookmarkUrl);
      return null;
    }

    const bookmark = results[0];
    await chrome.bookmarks.move(bookmark.id, { parentId: targetFolderId });
    return bookmark.parentId;
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

    if (!barNode) {
      console.error('mergeDuplicateEngineFolders: bookmark bar not found, trying ID "1" directly');
      // Fallback: try to get node "1" directly
      try {
        const [node] = await chrome.bookmarks.get('1');
        if (!node) return;
        await mergeInNode(node);
      } catch (e) {
        console.error('mergeDuplicateEngineFolders: could not get node "1":', e);
      }
      return;
    }

    await mergeInNode(barNode);
  } catch (e) {
    console.warn('mergeDuplicateEngineFolders failed:', e);
  }
}

async function mergeInNode(parentNode) {
  const children = await chrome.bookmarks.getChildren(parentNode.id);
  const engineFolders = children.filter(n => n.title === 'Engine Organized' && !n.url);

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
        kids = await chrome.bookmarks.getChildren(fromId);
      } catch {
        return; // Folder already gone
      }
      for (const kid of kids) {
        try {
          if (kid.url) {
            // Bookmark: search by URL and move
            const found = await chrome.bookmarks.search({ url: kid.url });
            if (found.length) {
              await chrome.bookmarks.move(found[0].id, { parentId: toId });
            }
          } else {
            // Subfolder: move by ID, then recurse
            await chrome.bookmarks.move(kid.id, { parentId: toId });
          }
        } catch (e) {
          console.warn('Failed to move child during merge:', kid.title, e.message);
        }
      }
    }

    await moveAllChildren(duplicate.id, target.id);

    // Delete the now-empty duplicate
    try {
      const remaining = await chrome.bookmarks.getChildren(duplicate.id);
      if (remaining.length === 0) {
        await chrome.bookmarks.removeTree(duplicate.id);
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
    children = await chrome.bookmarks.getChildren(folderId);
  } catch {
    return;
  }
  for (const child of children) {
    if (child.url) continue; // Skip bookmarks
    await cleanupEmptySubfolders(child.id); // Recurse first
    // Check if empty after recursing
    try {
      const remaining = await chrome.bookmarks.getChildren(child.id);
      if (remaining.length === 0) {
        console.log(`Removing empty subfolder: "${child.title}" (id=${child.id})`);
        await chrome.bookmarks.removeTree(child.id);
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
}
