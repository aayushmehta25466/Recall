import { getActiveBookmarks, updateBookmark } from '../../database/indexeddb/db.js';

// Shared data layer for the options page. All panel markup and interaction now
// live in React (HomePanel / ReviewPanel / TrashPanel / SettingsPanel /
// DataPanel / RulesPanel); this module keeps only the bookmark cache that the
// bulk actions need. It touches no DOM at all.

// ─── Bookmarks data layer ───
let allBookmarks = [];
let editMode = false;

export function isEditMode() { return editMode; }
export function setEditMode(v) { editMode = v; }

// HomePanel registers itself here so loadBookmarks() can push fresh data into
// it the way the old renderCurrentView() did.
let homeRefresh = null;
export function setHomeRefresh(fn) { homeRefresh = fn; }

export async function loadBookmarks() {
  try {
    allBookmarks = await getActiveBookmarks();
  } catch (e) {
    console.error('Failed to load bookmarks:', e);
    allBookmarks = [];
  }
  homeRefresh?.(allBookmarks);
  return allBookmarks;
}

// Assign category (+ optional subcategory path override) in IndexedDB and move
// the Chrome bookmark into the matching folder. Shared by the Home bulk Move
// and Review panel Assign.
export async function assignCategory(urls, cat, subPath = null) {
  const { getTargetFolderId } = await import('../../core/folder-manager/manager.js');
  for (const url of urls) {
    const b = allBookmarks.find((x) => x.url === url);
    const sub = subPath ?? b?.subcategory ?? '';
    await updateBookmark(url, {
      category: cat,
      subcategory: sub,
      'manualOverrides.category': true,
      'manualOverrides.subcategory': true,
    });
    if (b) {
      try {
        const results = await chrome.bookmarks.search({ url: b.url });
        if (results.length === 0) continue;
        const chromeId = results[0].id;
        const targetFolderId = await getTargetFolderId(cat, sub);
        if (targetFolderId) {
          await chrome.bookmarks.move(chromeId, { parentId: targetFolderId });
        }
      } catch (e) {
        console.warn('Chrome move failed:', e);
      }
    }
  }
}

await loadBookmarks();
