import { extractMetadata } from '../../core/metadata-extractor/extractor.js';
import { inferContentType } from '../../core/metadata-extractor/inferrence.js';
import { classifyFast, runBulkSync } from '../../core/sync-engine/bulk.js';
import { createBookmark } from '../../shared/types/bookmark.js';
import { saveBookmark, getBookmark, updateBookmark, trashBookmark, restoreBookmark, emptyTrash, purgeOldTrash, getTrashedBookmarks, getAllBookmarks, saveBookmarks } from '../../database/indexeddb/db.js';
import { searchBookmarks } from '../../core/search-index/search.js';
import { getSettings } from '../../shared/settings.js';

console.log('Bookmark Search Engine: Background worker initialized.');

let isSyncing = false;

// Safety: reset isSyncing if it gets stuck (e.g. service worker killed mid-sync)
// 10 minutes — sync needs time for network fetches across 100+ bookmarks
setTimeout(() => {
  if (isSyncing) {
    console.warn('isSyncing flag stuck after 10 min, resetting');
    isSyncing = false;
  }
}, 600000);

// Auto-run bulk sync on first install
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    console.log('First install detected — running bulk sync...');
    const settings = await getSettings();
    if (settings.autoOrganize) {
      isSyncing = true;
      await runBulkSync(true);
      isSyncing = false;
    }
  }
  if (details.reason === 'update') {
    const settings = await getSettings();
    if (settings.trashAutoPurgeDays > 0) {
      const maxAge = settings.trashAutoPurgeDays * 24 * 60 * 60 * 1000;
      const purged = await purgeOldTrash(maxAge);
      if (purged > 0) console.log(`Auto-purged ${purged} old trashed bookmarks.`);
    }
  }
});

/**
 * New bookmark: instant save with fast rules. AI batch handles rest later.
 */
async function processNewBookmark(id, bookmark) {
  if (!bookmark.url) return;

  const settings = await getSettings();
  if (!settings.autoOrganize) return;

  if (settings.duplicatePolicy === 'keep_oldest') {
    const existing = await getBookmark(bookmark.url);
    if (existing) return;
  }

  try {
    // Fetch HTML for metadata extraction (fast, non-blocking)
    let html = '';
    try {
      const res = await fetch(bookmark.url, { redirect: 'follow' });
      if (res.ok) {
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('text/html')) html = await res.text();
      }
    } catch { /* ignore fetch errors */ }

    const metadata = extractMetadata(html, bookmark.url);
    const contentType = inferContentType(metadata, bookmark.url);
    // Fast rules only — no AI, no delay
    const { category, subcategory } = classifyFast(metadata, bookmark.url, settings);

    const processedBookmark = createBookmark({
      url: bookmark.url,
      title: metadata.title || bookmark.title,
      description: metadata.description,
      siteName: metadata.siteName,
      domain: metadata.domain,
      language: metadata.language,
      author: metadata.author,
      keywords: metadata.keywords,
      contentType,
      category,
      subcategory,
      dateAdded: new Date(bookmark.dateAdded || Date.now()).toISOString()
    });

    await saveBookmark(processedBookmark);
    // Don't move in Chrome — user organizes manually or bulk sync handles it
  } catch (error) {
    console.error('Failed to process bookmark:', bookmark.url, error);
  }
}

// Listen for new bookmarks
chrome.bookmarks.onCreated.addListener(async (id, bookmark) => {
  // Don't process if sync is running (handled by runBulkSync)
  if (isSyncing) return;
  processNewBookmark(id, bookmark);
});

// Listen for bookmark deletions — clean up IndexedDB (skip during bulk sync)
chrome.bookmarks.onRemoved.addListener(async (id, removeInfo) => {
  // Don't trash bookmarks that were moved by our sync process
  if (isSyncing) return;

  if (removeInfo.node.url) {
    const existing = await getBookmark(removeInfo.node.url);
    if (existing && !existing.isTrashed) {
      await trashBookmark(removeInfo.node.url);
    }
  }
});

// Listen for bookmark changes (title, URL updates)
chrome.bookmarks.onChanged.addListener(async (id, changeInfo) => {
  // Find the bookmark by Chrome ID — we need to look it up
  try {
    const [bookmark] = await chrome.bookmarks.get(id);
    if (bookmark?.url && changeInfo.title) {
      await updateBookmark(bookmark.url, { title: changeInfo.title });
    }
  } catch { /* bookmark may not be in our DB */ }
});

// Keep service worker alive when options page holds a port open
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'sync-keepalive') {
    console.log('Keepalive port connected');
    port.onDisconnect.addListener(() => console.log('Keepalive port disconnected'));
  }
});

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received message:', request.type);

  if (request.type === 'SEARCH') {
    searchBookmarks(request.query).then(results => {
      console.log(`Search returned ${results.length} results`);
      sendResponse({ results });
    }).catch(e => {
      console.error('Search failed:', e);
      sendResponse({ results: [] });
    });
    return true;
  }

  if (request.type === 'START_BULK_SYNC') {
    console.log('Starting bulk sync from message...');
    isSyncing = true;
    runBulkSync(true).then(() => {
      isSyncing = false;
      console.log('Bulk sync finished, sending response');
      sendResponse({ success: true });
    }).catch(e => {
      isSyncing = false;
      console.error('Bulk sync failed:', e);
      sendResponse({ success: false, error: e.message });
    });
    return true;
  }

  if (request.type === 'TRASH_BOOKMARK') {
    trashBookmark(request.url).then(() => sendResponse({ success: true }));
    return true;
  }

  if (request.type === 'RESTORE_BOOKMARK') {
    restoreBookmark(request.url).then(() => sendResponse({ success: true }));
    return true;
  }

  if (request.type === 'EMPTY_TRASH') {
    emptyTrash().then(count => sendResponse({ count }));
    return true;
  }

  if (request.type === 'GET_TRASH_COUNT') {
    getTrashedBookmarks().then(items => sendResponse({ count: items.length }));
    return true;
  }

  if (request.type === 'UPDATE_BOOKMARK') {
    updateBookmark(request.url, request.fields).then(result => sendResponse({ result }));
    return true;
  }

  if (request.type === 'EXPORT_BOOKMARKS') {
    getAllBookmarks().then(bookmarks => sendResponse({ bookmarks }));
    return true;
  }

  if (request.type === 'IMPORT_BOOKMARKS') {
    saveBookmarks(request.bookmarks).then(() => sendResponse({ success: true }));
    return true;
  }

  // Return true for any unrecognized message to prevent channel close errors
  return true;
});
