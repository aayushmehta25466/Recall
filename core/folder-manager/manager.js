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
