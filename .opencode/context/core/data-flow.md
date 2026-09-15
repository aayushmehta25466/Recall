# Data Flow — Recall

## 1. New Bookmark Created

```
chrome.bookmarks.onCreated (always processed — even during a bulk sync)
  → background.js: processNewBookmark(id, bookmark)
    → fetch HTML → extractMetadata → inferContentType
    → classifyBookmark (fast rules → AI only when settings.autoAiCategorize is on)
    → ALWAYS moveBookmarkToCategory(url, category, subcategory, id)
        real match  → Chrome folder "Engine Organized / <Category> / ..."
        no match    → Chrome folder "Engine Organized / Uncategorized"
    → saveBookmark(bookmarkObj)      → IndexedDB (chromeFolder mirrors the move)
```

- The move uses the fresh Chrome ID from `onCreated`; `moveBookmarkToCategory`
  only falls back to a URL lookup when that ID is stale (bulk sync path).
- **AI is opt-in on creation.** Fast rules run first; only if they return
  `Uncategorized` *and* the `autoAiCategorize` setting is on *and* an OpenRouter key is
  set does it call the model. Otherwise the manual "Categorize with AI" action (Options →
  Review) is the way to classify. Bulk sync keeps its own AI fallback (`useAI: true`).
- Every new bookmark therefore lands inside the native "Engine Organized" tree;
  nothing is left in the user's root folders while waiting for classification.
- A failed move is recorded in the persisted retry queue (see Move retry queue below)
  instead of being lost.

## 2. Bulk Sync (Organize All)

```
runBulkSync()
  → getAll Chrome bookmarks via chrome.bookmarks.getTree()
  → flattenTree() → flat array with chromeFolder paths
     (the root + its immediate children — the bar — never enter the path, so the
      stored shape matches getFolderPath() on Chrome "1" and Firefox "toolbar_____")
  → processBookmark() decides in this order:
     → parseEngineFolderPath(chromeFolder) hit? → mirror the folder's category/
       subcategory into IndexedDB, return null. NO fetch, NO AI, NO move.
     → Real category already in IndexedDB? → keep it, NO fetch/AI. Queue a move
       only if the bookmark sits in no folder at all (chromeFolder === ''); one the
       user has placed somewhere is respected as-is.
     → Otherwise (outside the tree, no category): fetch + classifyBookmark
       (fast rules → AI fallback) → queue Phase 2 move.
  → Phase 2: moveBookmarkToCategory() for all queued (respects moveInChrome flag)
  → cleanupEmptyFolders()
  → mergeDuplicateEngineFolders()
```

**Idempotency invariant:** anything under the `Engine Organized` tree is trusted
verbatim. The engine root may appear anywhere in the path (a browser bar folder may
prefix it) and matching is case-insensitive; an unrecognized category folder resolves
to `Uncategorized` and is **never** sent to AI. AI therefore runs *only* for bookmarks
outside the tree that have no DB category. Re-running the sync over an already-organized
library performs zero fetches, zero AI calls, and zero moves.

The path helpers live in `core/folder-manager/paths.js` (`ENGINE_ROOT_FOLDER`,
`getFolderPath`, `parseEngineFolderPath`) so both the folder manager and the sync engine
share one definition.

### Move retry queue

| Module | Purpose |
|--------|---------|
| `core/folder-manager/moveQueue.js` | Persisted in `chrome.storage.local`. Failed native moves (`moveBookmarkToCategory()` → null) are recorded and retried by `retryFailedMoves()` on worker startup and after each sync; entries are dropped after `MAX_MOVE_ATTEMPTS` (5). |

There is deliberately **no** mid-sync queue: `onCreated` always organizes immediately. `runBulkSync()` snapshots the tree when it starts, so it never sees nodes created afterwards — gating on `isSyncing` only delayed or dropped them, and they stayed unarranged until a manual "Organize Now". The install-time sync still resets `isSyncing` in a `finally`, and `getOrCreateFolder()` dedupes in-flight creations so a new bookmark can't race the sync into duplicate "Engine Organized" folders.

## 3. Search Flow

```
User types query
  → sidepanel.js / popup.js
  → chrome.runtime.sendMessage({ type: 'SEARCH', query })
  → background.js: searchBookmarks(query)
    → MiniSearch.search(query, { fuzzy: 0.2, prefix: true })
    → AND results (fallback to OR if empty)
    → Map back to full bookmark objects from IndexedDB
    → Sort by score
  → Return results to UI
```

## 4. Manual Category Move

```
User selects bookmarks → clicks Move
  → options.js: bulkMoveBtn click
  → getTargetFolderId(category, subcategory)
    → getBookmarksBarNode() → Chrome ID "1"
    → getOrCreateFolder() with cache
  → moveBookmarkToCategory(url, category, subcategory)   // by URL (fresh IDs unavailable)
    → chrome.bookmarks.move()
  → updateBookmark(url, { chromeFolder: getFolderPath(category, subcategory) })
```

## 5. Tab Grouping

```
User clicks Open (multiple selected)
  → options.js: bulkOpenBtn click
  → chrome.runtime.sendMessage({ type: 'OPEN_IN_TAB_GROUP', urls })
  → background.js:
    → Create tabs in chunks of 5 (100ms delay)
    → chrome.tabs.group() → create group
    → chrome.tabGroups.update() → name "Group N"
    → Add remaining tabs to group
```

## 6. Removal & Trash Flow

```
Native delete (Chrome bookmark manager)
  → chrome.bookmarks.onRemoved
    → bookmark node (has url):
        → still findable by URL? → it was a move, not a delete → ignore
        → else trashBookmark(url)        → IndexedDB isTrashed = 1
             + removeFromIndex(url)      → MiniSearch doc dropped
        → shows in Options → Trash (getTrashedBookmarks)
    → folder node (no url):
        → scheduleReconcile()  (~600 ms debounce)
             → chrome.bookmarks.getTree()
             → reconcileRemovedBookmarks(tree)
                any active DB bookmark whose URL is gone from Chrome → trashed
                (+ index pruned). An empty tree is skipped as "not loaded yet".

Reconciliation also runs on: worker startup, after install sync, after each bulk sync.

Restore (Options → Trash → Restore)
  → RESTORE_BOOKMARK message → background
    → restoreBookmark(url)   → isTrashed = 0
    → recreate in Chrome if missing (chrome.bookmarks.create into its category folder)
    → indexBookmark(url)
```

Deletes are **soft** (`isTrashed = 1`): the record stays for the Trash tab and is purged
only by `emptyTrash()` / `purgeOldTrash()` (auto-purge after `trashAutoPurgeDays`).
Trashing from the extension UI (`TRASH_BOOKMARK`) also removes the Chrome bookmark, and
Restore recreates it — so both directions stay symmetric.
Chrome fires `onRemoved` **once for a deleted folder, not its contents**, which is why
reconciliation — not the event alone — is what catches everything inside it. Options
routes trash/restore/empty through the background so Chrome and the worker-owned
MiniSearch index stay in step.

## Key Functions

| Function | File | Purpose |
|----------|------|---------|
| `classifyFast` | `core/sync-engine/bulk.js` | Fast local classification (domain + keywords) |
| `classifyWithAI` | `core/ai-classifier/classifier.js` | OpenRouter API classification |
| `getTargetFolderId` | `core/folder-manager/manager.js` | Create/find Chrome folder hierarchy |
| `searchBookmarks` | `core/search-index/search.js` | BM25 search via MiniSearch |
| `buildSearchIndex` | `core/search-index/search.js` | Build/rebuild MiniSearch index |
| `saveBookmark` | `database/indexeddb/db.js` | Save to IndexedDB |
| `getActiveBookmarks` | `database/indexeddb/db.js` | Non-trashed bookmarks |
| `reconcileRemovedBookmarks` | `core/sync-engine/reconcile.js` | Trash DB bookmarks absent from the live Chrome tree |
| `indexBookmark` / `removeFromIndex` | `core/search-index/search.js` | Keep the MiniSearch index in step on add/remove |
