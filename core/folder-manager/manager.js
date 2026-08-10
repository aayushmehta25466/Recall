/**
 * Helper to find or create a folder by title under a specific parent.
 */
async function getOrCreateFolder(parentId, title) {
  const children = await chrome.bookmarks.getChildren(parentId);
  const existing = children.find(node => node.title === title && !node.url);
  if (existing) return existing.id;
  const created = await chrome.bookmarks.create({ parentId, title });
  return created.id;
}

/**
 * Returns the Bookmarks Bar node (first root child).
 * This is where organized bookmarks should go.
 */
function getBookmarksBarNode(rootTree) {
  const root = rootTree[0];
  // First child is always the Bookmarks Bar
  return root.children[0];
}

/**
 * Creates the folder hierarchy: Bookmarks Bar > Engine Organized > Category > Subcategory
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
  const catFolderId = await getOrCreateFolder(engineRootId, category);

  if (!subcategory) return catFolderId;
  return getOrCreateFolder(catFolderId, subcategory);
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
 * After all bookmarks are organized, clean up empty source folders.
 */
export async function cleanupEmptyFolders() {
  try {
    const rootTree = await chrome.bookmarks.getTree();
    const barNode = getBookmarksBarNode(rootTree);
    if (!barNode) return;

    // Don't delete the Engine Organized folder itself
    const engineRoot = (await chrome.bookmarks.getChildren(barNode.id))
      .find(n => n.title === 'Engine Organized');
    if (!engineRoot) return;

    // Check each category folder under Engine Organized
    const categories = await chrome.bookmarks.getChildren(engineRoot.id);
    for (const cat of categories) {
      const children = await chrome.bookmarks.getChildren(cat.id);
      // If category folder is empty, delete it
      if (children.length === 0) {
        await chrome.bookmarks.removeTree(cat.id);
      }
    }
  } catch (e) {
    console.warn('Cleanup failed:', e);
  }
}
