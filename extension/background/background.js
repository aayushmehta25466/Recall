import { extractMetadata } from '../../core/metadata-extractor/extractor.js';
import { inferContentType } from '../../core/metadata-extractor/inferrence.js';
import { classifyBookmark, runBulkSync } from '../../core/sync-engine/bulk.js';
import { enqueueFailedMove, retryPendingMoves } from '../../core/folder-manager/moveQueue.js';
import { createBookmark } from '../../shared/types/bookmark.js';
import { moveBookmarkToCategory, getFolderPath, getTargetFolderId } from '../../core/folder-manager/manager.js';
import { parseEngineFolderPath } from '../../core/folder-manager/paths.js';
import { reconcileRemovedBookmarks } from '../../core/sync-engine/reconcile.js';
import { saveBookmark, getBookmark, updateBookmark, trashBookmark, restoreBookmark, emptyTrash, purgeOldTrash, getTrashedBookmarks, getAllBookmarks, saveBookmarks } from '../../database/indexeddb/db.js';
import { searchBookmarks, buildSearchIndex, indexBookmark, removeFromIndex } from '../../core/search-index/search.js';
import { runBatchCategorize, getUncategorizedBookmarks } from '../../core/ai-classifier/batchCategorizer.js';
import { createAutoCategorizeQueue } from '../../core/ai-classifier/autoQueue.js';
import { acquireAiBatchLock, releaseAiBatchLock } from '../../shared/aiLock.js';
import { api, broadcast, toggleSidebar } from '../../shared/platform.js';
import { getSettings } from '../../shared/settings.js';

console.log('Recall: Background worker initialized.');

let isSyncing = false;

/**
 * Auto-AI on save.
 *
 * Bookmark creation only runs the fast rules; anything that lands in
 * "Uncategorized" is handed to the *batch* workflow here, so the fixed taxonomy
 * prompt is paid once per 15 URLs instead of once per bookmark.
 */
const autoAi = createAutoCategorizeQueue({
  runBatch: runBatchCategorize,
  getSettings,
  isSyncing: () => isSyncing,
  hasWork: async () => (await getUncategorizedBookmarks()).length > 0,
  acquireLock: acquireAiBatchLock,
  releaseLock: releaseAiBatchLock,
  log: (event, a, b) => {
    switch (event) {
      case 'off':
        console.log('Recall: auto-AI off (setting disabled)');
        break;
      case 'no-key':
        console.warn('Recall: auto-AI skipped — no OpenRouter API key');
        break;
      case 'syncing':
        console.log('Recall: auto-AI skipped — sync in progress');
        break;
      case 'nothing':
        console.log('Recall: auto-AI skipped — nothing uncategorized');
        break;
      case 'locked':
        console.log('Recall: auto-AI skipped — another batch is running');
        break;
      case 'progress':
        console.log(`Recall: auto-AI ${a}/${b}`);
        broadcastAiProgress(a, b, false);
        break;
      case 'done':
        console.log(`Recall: auto-AI finished — ${a}/${b} categorized`);
        broadcastAiProgress(b, b, true);
        break;
      case 'error':
        console.error('Recall: auto-AI failed:', a);
        break;
    }
  },
});

/** Let an open Options page mirror a batch the worker started. */
function broadcastAiProgress(current, total, done) {
  broadcast({ type: 'AI_BATCH_PROGRESS', current, total, done });
}

// ─────────────────────────────────────────────────────────────────────────────
// EVENT LISTENERS — registered synchronously, before any other work.
//
// An MV3 service worker's module body runs once; if anything throws before a
// listener is attached, that listener never exists for the life of the worker.
// Keeping registration first (and guarding optional APIs with `?.`) means a
// missing chrome.sidePanel / chrome.commands can never disable bookmark
// handling — which is what silently stopped new bookmarks from being organized.
// ─────────────────────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(handleInstalled);
api.bookmarks.onCreated.addListener(handleBookmarkCreated);
api.bookmarks.onRemoved.addListener(handleBookmarkRemoved);
api.bookmarks.onChanged.addListener(handleBookmarkChanged);
chrome.runtime.onConnect.addListener(handleConnect);
chrome.runtime.onMessage.addListener(handleMessage);
try {
  chrome.commands?.onCommand?.addListener(handleCommand);
} catch (e) {
  console.warn('Recall: commands API unavailable:', e);
}

// Startup work — runs only after the listeners above are attached.
init();

// ─────────────────────────────────────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────────────────────────────────────

async function init() {
  console.log(`Recall: background v${chrome.runtime.getManifest().version} ready (auto-organize active).`);

  // Safety: reset isSyncing if it gets stuck (e.g. service worker killed mid-sync)
  // 10 minutes — sync needs time for network fetches across 100+ bookmarks
  setTimeout(() => {
    if (isSyncing) {
      console.warn('isSyncing flag stuck after 10 min, resetting');
      isSyncing = false;
    }
  }, 600000);

  try {
    api.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true })
      ?.catch?.(() => console.log('Side panel not supported, using popup fallback'));
  } catch (e) {
    console.warn('Side panel unavailable:', e);
  }

  try {
    const { count } = await buildSearchIndex();
    console.log(`Search index built on startup: ${count} bookmarks`);
  } catch (e) {
    console.error('Failed to build search index on startup:', e);
  }

  // Catch up on deletions made while the worker was asleep
  await reconcileNow('startup');

  // Retry any moves that failed before the worker restarted
  await retryFailedMoves();
}

/**
 * Compare IndexedDB against the live Chrome tree and trash anything that no longer
 * exists in Chrome (folder deletions, deletions dropped mid-sync, missed events).
 * Skipped while a sync is running; never acts on an empty/loading tree.
 */
async function reconcileNow(reason) {
  if (isSyncing) return;
  try {
    const tree = await api.bookmarks.getTree();
    const { checked, trashed, skipped } = await reconcileRemovedBookmarks(tree, {
      onTrashed: (bookmark) => removeFromIndex(bookmark.url),
    });
    if (trashed > 0) {
      console.log(`Recall: reconcile (${reason}) trashed ${trashed}/${checked} bookmarks missing from Chrome`);
    } else if (skipped) {
      console.log(`Recall: reconcile (${reason}) skipped: ${skipped}`);
    }
  } catch (e) {
    console.warn('Reconcile failed:', e);
  }
}

let reconcileTimer = null;
/** A removed folder takes its contents with it — reconcile shortly after to catch them. */
function scheduleReconcile() {
  if (reconcileTimer) clearTimeout(reconcileTimer);
  reconcileTimer = setTimeout(() => {
    reconcileTimer = null;
    reconcileNow('folder-removed');
  }, 600);
}

/** Retry native moves that failed earlier (persisted across worker restarts). */
async function retryFailedMoves() {
  try {
    const { retried, succeeded, dropped } = await retryPendingMoves(moveBookmarkToCategory);
    if (retried > 0) {
      console.log(`Move retry: ${succeeded}/${retried} succeeded, ${dropped} dropped`);
    }
  } catch (e) {
    console.warn('Move retry failed:', e);
  }
}

/**
 * Move a newly created bookmark into its category folder, retrying briefly.
 *
 * A cold service worker can momentarily see an empty bookmark tree, so a single
 * failed attempt must not leave the bookmark unarranged until the next startup.
 */
async function moveNewBookmarkWithRetry(url, category, subcategory, chromeId) {
  const delays = [0, 400, 1200];
  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt]) await new Promise(r => setTimeout(r, delays[attempt]));
    const folderId = await moveBookmarkToCategory(url, category, subcategory, chromeId);
    if (folderId) {
      if (attempt > 0) console.log(`Recall: move succeeded on attempt ${attempt + 1} for ${url}`);
      return folderId;
    }
    console.warn(`Recall: move attempt ${attempt + 1}/${delays.length} failed for ${url} (target ${category} / ${subcategory || '—'})`);
  }
  return null;
}

/**
 * New bookmark: classify with fast rules, file it natively inside the
 * "Engine Organized" tree, then update the search index.
 *
 * Fast rules decide the category; when they can't, the bookmark is still moved
 * into "Engine Organized / Uncategorized" so it never litters the user's tree.
 * AI is opt-in: it only runs here when the `autoAiCategorize` setting is on and
 * an OpenRouter key is set — otherwise classification stays a manual action
 * ("Categorize with AI" in Options).
 */
async function processNewBookmark(id, bookmark) {
  if (!bookmark.url) return;
  const url = bookmark.url;
  console.log(`Recall: processing "${bookmark.title}" (id=${id}, parent=${bookmark.parentId ?? '?'}) → ${url}`);

  const settings = await getSettings();
  if (!settings.autoOrganize) {
    console.log('Recall: auto-organize disabled — skipping', url);
    return;
  }

  const existing = await getBookmark(url);

  // Duplicate policy: only skip a live record that is ALREADY placed. A record
  // that exists in IndexedDB but was never filed (chromeFolder empty — e.g. an
  // earlier move failed, or the install sync only indexed it) must still be
  // organized. Otherwise re-saving a bookmark silently does nothing.
  if (settings.duplicatePolicy === 'keep_oldest' && existing && !existing.isTrashed) {
    if (parseEngineFolderPath(existing.chromeFolder)) {
      console.log(`Recall: "${bookmark.title}" already organized at "${existing.chromeFolder}" — skipping`);
      return;
    }
    console.log(`Recall: "${bookmark.title}" is indexed but not filed (chromeFolder="${existing.chromeFolder || ''}") — organizing now`);
  }

  try {
    let category, subcategory, metadata = null, contentType = '';
    const storedCategory = existing?.category && existing.category !== 'Uncategorized'
      ? existing.category : null;

    if (storedCategory) {
      // Already classified in IndexedDB — reuse it, no network needed.
      category = storedCategory;
      subcategory = existing.subcategory || '';
      contentType = existing.contentType || '';
      console.log(`Recall: reusing stored category for ${url} → ${category} / ${subcategory || '—'}`);
    } else {
      // Fetch HTML for metadata extraction (fast, non-blocking)
      let html = '';
      try {
        const res = await fetch(url, { redirect: 'follow' });
        if (res.ok) {
          const ct = res.headers.get('content-type') || '';
          if (ct.includes('text/html')) html = await res.text();
        }
      } catch { /* ignore fetch errors */ }

      metadata = extractMetadata(html, url);
      contentType = inferContentType(metadata, url);
      // Fast rules ONLY. AI for saved bookmarks runs through the batch queue below,
      // which pays the (large, fixed) taxonomy prompt once per 15 URLs.
      ({ category, subcategory } = await classifyBookmark(metadata, url, settings, { useAI: false }));
      category = category || 'Uncategorized';
      console.log(
        category === 'Uncategorized'
          ? `Recall: no fast match for ${url} → Uncategorized`
          : `Recall: fast-classified ${url} → ${category} / ${subcategory || '—'}`
      );
    }

    // Always move into the native hierarchy right away, using the fresh Chrome ID
    // handed to us by onCreated (no stale-ID URL search needed).
    const targetFolderId = await moveNewBookmarkWithRetry(url, category, subcategory, id);
    if (!targetFolderId) {
      // Persist the failure so it gets retried instead of being lost
      await enqueueFailedMove({ url, category, subcategory, reason: 'onCreated move failed' });
    }

    const processedBookmark = createBookmark({
      url,
      title: metadata?.title || bookmark.title,
      description: metadata?.description,
      siteName: metadata?.siteName,
      domain: metadata?.domain,
      language: metadata?.language,
      author: metadata?.author,
      keywords: metadata?.keywords,
      contentType,
      category,
      subcategory,
      // Keep IndexedDB in step with the native tree (empty when the move failed)
      chromeFolder: targetFolderId ? getFolderPath(category, subcategory) : '',
      dateAdded: new Date(bookmark.dateAdded || Date.now()).toISOString()
    });

    await saveBookmark(processedBookmark);
    // Make it searchable immediately (the index is otherwise only rebuilt on sync)
    indexBookmark(processedBookmark);

    // Hand it to the AI batch workflow when the user opted in. The batch picks up
    // every uncategorized bookmark, so this one is included.
    if (settings.autoAiCategorize && category === 'Uncategorized') {
      console.log('Recall: auto-AI queued — will run in 4s');
      autoAi.schedule();
    }

    if (targetFolderId) {
      console.log(`Recall: new bookmark FILED → ${getFolderPath(category, subcategory)}`);
    } else {
      console.log(`Recall: new bookmark indexed but NOT filed (queued for retry) → ${url}`);
    }
  } catch (error) {
    console.error('Failed to process bookmark:', url, error);
  }
}

async function handleInstalled(details) {
  if (details.reason === 'install') {
    console.log('First install detected — running bulk sync...');
    const settings = await getSettings();
    if (settings.autoOrganize) {
      isSyncing = true;
      try {
        await runBulkSync(true);
      } catch (e) {
        console.error('Initial bulk sync failed:', e);
      } finally {
        // Always clear the flag, even if the sync throws
        isSyncing = false;
      }
      await retryFailedMoves();
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
  // Reconcile (catch any deletions) then build the search index
  await reconcileNow('installed');
  try {
    const { count } = await buildSearchIndex();
    console.log(`Search index built: ${count} bookmarks`);
  } catch (e) {
    console.error('Failed to build search index:', e);
  }
}

// Always organize immediately — including during a running bulk sync.
// runBulkSync() snapshots the tree when it starts, so it can never see nodes
// created afterwards; gating on isSyncing only left new bookmarks unarranged
// until the next manual "Organize Now".
function handleBookmarkCreated(id, bookmark) {
  if (!bookmark.url) return; // folders created by our own folder setup
  console.log(`Bookmark created — organizing: ${bookmark.url} (parentId=${bookmark.parentId ?? 'unknown'})`);
  processNewBookmark(id, bookmark);
}

// Listen for bookmark deletions. A bookmark is trashed immediately; a removed
// folder takes its contents with it, which Chrome does not report node-by-node,
// so we reconcile shortly after to catch everything that was inside it.
async function handleBookmarkRemoved(id, removeInfo) {
  const node = removeInfo.node;

  if (node.url) {
    // A sync move can surface here as a removal — only act if it's really gone.
    try {
      const stillThere = await api.bookmarks.search({ url: node.url });
      if (stillThere.length > 0) return;
    } catch { /* fall through and trash */ }

    const existing = await getBookmark(node.url);
    if (existing && !existing.isTrashed) {
      await trashBookmark(node.url);
      removeFromIndex(node.url);
      console.log(`Recall: removed in Chrome → trashed: ${node.url}`);
    }
    return;
  }

  scheduleReconcile();
}

/**
 * Bring a trashed bookmark back: activate the DB record, recreate the Chrome
 * bookmark in its category folder when it is gone, and re-index it.
 */
async function restoreBookmarkEverywhere(url) {
  const restored = await restoreBookmark(url);
  if (!restored) return null;

  try {
    const existing = await api.bookmarks.search({ url });
    if (existing.length === 0) {
      const category = restored.category || 'Uncategorized';
      const subcategory = restored.subcategory || '';
      const parentId = await getTargetFolderId(category, subcategory);
      if (parentId) {
        await api.bookmarks.create({ parentId, title: restored.title || url, url });
        await updateBookmark(url, { chromeFolder: getFolderPath(category, subcategory) });
        console.log(`Recall: restored bookmark recreated in Chrome → ${getFolderPath(category, subcategory)}`);
      }
    }
  } catch (e) {
    console.warn('Failed to recreate bookmark in Chrome:', url, e);
  }

  indexBookmark((await getBookmark(url)) || restored);
  return restored;
}

// Listen for bookmark changes (title, URL updates)
async function handleBookmarkChanged(id, changeInfo) {
  // Find the bookmark by Chrome ID — we need to look it up
  try {
    const [bookmark] = await api.bookmarks.get(id);
    if (bookmark?.url && changeInfo.title) {
      await updateBookmark(bookmark.url, { title: changeInfo.title });
    }
  } catch { /* bookmark may not be in our DB */ }
}

async function handleCommand(command) {
  if (command !== 'toggle-sidebar') return;
  try {
    // Routes to sidePanel on Chromium and sidebarAction on Gecko.
    await toggleSidebar();
  } catch (e) {
    console.warn('Failed to toggle sidebar:', e);
  }
}

// Keep service worker alive when options page holds a port open
function handleConnect(port) {
  if (port.name === 'sync-keepalive') {
    console.log('Keepalive port connected');
    port.onDisconnect.addListener(() => console.log('Keepalive port disconnected'));
  }
}

function handleMessage(request, sender, sendResponse) {
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

  if (request.type === 'GET_SYNC_STATUS') {
    sendResponse({ isSyncing });
    return true;
  }

  if (request.type === 'OPEN_IN_TAB_GROUP') {
    const { urls } = request;
    (async () => {
      const [currentTab] = await api.tabs.query({ active: true, currentWindow: true });
      const CHUNK_SIZE = 5;
      let groupId = null;

      for (let i = 0; i < urls.length; i += CHUNK_SIZE) {
        const chunk = urls.slice(i, i + CHUNK_SIZE);
        const tabIds = [];

        for (const url of chunk) {
          const tab = await api.tabs.create({ url, active: false, index: currentTab.index + 1 });
          tabIds.push(tab.id);
        }

        // First chunk: create the group
        if (groupId === null) {
          try {
            let groupNum = 1;
            try {
              const existingGroups = await api.tabGroups.query({});
              const usedNums = existingGroups
                .map(g => g.title?.match(/^Group (\d+)$/)?.[1])
                .filter(Boolean)
                .map(Number);
              while (usedNums.includes(groupNum)) groupNum++;
            } catch {}
            groupId = await api.tabs.group({ tabIds });
            await api.tabGroups.update(groupId, { title: `Group ${groupNum}`, collapsed: false });
          } catch (e) {
            console.warn('Tab grouping failed:', e);
          }
        } else {
          // Subsequent chunks: add to existing group
          try {
            await api.tabs.group({ groupId, tabIds });
          } catch (e) {
            console.warn('Adding tabs to group failed:', e);
          }
        }

        // Delay between chunks to avoid memory spike
        if (i + CHUNK_SIZE < urls.length) {
          await new Promise(r => setTimeout(r, 100));
        }
      }

      sendResponse({ success: true });
    })();
    return true;
  }

  if (request.type === 'START_BULK_SYNC') {
    console.log('Starting bulk sync from message...');
    isSyncing = true;
    runBulkSync(true).then(async () => {
      isSyncing = false;
      await retryFailedMoves();
      await reconcileNow('post-sync');
      console.log('Bulk sync finished, rebuilding search index...');
      try {
        const { count } = await buildSearchIndex();
        console.log(`Search index rebuilt: ${count} bookmarks`);
      } catch (e) {
        console.error('Failed to rebuild search index:', e);
      }
      sendResponse({ success: true });
    }).catch(async (e) => {
      isSyncing = false;
      await retryFailedMoves();
      console.error('Bulk sync failed:', e);
      sendResponse({ success: false, error: e.message });
    });
    return true;
  }

  if (request.type === 'TRASH_BOOKMARK') {
    (async () => {
      await trashBookmark(request.url);
      removeFromIndex(request.url);
      // Trash means gone from Chrome too; Restore recreates it
      // (restoreBookmarkEverywhere).
      try {
        const hits = await api.bookmarks.search({ url: request.url });
        for (const node of hits) await api.bookmarks.remove(node.id);
      } catch (e) {
        console.warn('Chrome remove failed:', request.url, e);
      }
      sendResponse({ success: true });
    })();
    return true;
  }

  if (request.type === 'RESTORE_BOOKMARK') {
    restoreBookmarkEverywhere(request.url)
      .then(() => sendResponse({ success: true }))
      .catch(e => {
        console.error('Restore failed:', e);
        sendResponse({ success: false, error: e.message });
      });
    return true;
  }

  if (request.type === 'EMPTY_TRASH') {
    emptyTrash().then(async (count) => {
      try {
        await buildSearchIndex();
      } catch (e) {
        console.warn('Index rebuild after empty trash failed:', e);
      }
      sendResponse({ count });
    });
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

  // SYNC_PROGRESS is a broadcast — don't return true, no response needed
  if (request.type === 'SYNC_PROGRESS') return false;
}
