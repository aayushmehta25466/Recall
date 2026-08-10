/**
 * Factory function to create a standard Bookmark object.
 *
 * @param {Object} data
 * @returns {Object} A fully formatted bookmark object
 */
export function createBookmark(data = {}) {
  return {
    url: data.url || '',
    title: data.title || '',
    description: data.description || '',
    siteName: data.siteName || '',
    domain: data.domain || '',
    language: data.language || 'en',
    contentType: data.contentType || 'website',
    category: data.category || 'Uncategorized',
    subcategory: data.subcategory || '',
    tags: Array.isArray(data.tags) ? data.tags : [],
    keywords: Array.isArray(data.keywords) ? data.keywords : [],
    dateAdded: data.dateAdded || new Date().toISOString(),
    dateUpdated: data.dateUpdated || new Date().toISOString(),
    visitCount: data.visitCount || 0,
    // Chrome folder path (e.g. "Bookmarks Bar / Development / Frontend")
    chromeFolder: data.chromeFolder || '',
    // Trash fields
    isTrashed: data.isTrashed || false,
    trashedAt: data.trashedAt || null,
    // Sort/reorder fields
    sortOrder: data.sortOrder ?? 0,
    isPinned: data.isPinned || false,
    // Manual override tracking
    manualOverrides: data.manualOverrides || {
      category: false,
      folder: false
    },
  };
}
