# Data Flow — Recall

## 1. New Bookmark Created

```
chrome.bookmarks.onCreated
  → background.js: processNewBookmark()
    → fetchHtml(url)
    → extractMetadata(html, url)     → { title, description, domain, keywords... }
    → inferContentType(metadata, url) → "GitHub Repo" | "Blog" | "Website"...
    → classifyFast(metadata, url, settings)
      → getDomainMapping(domain)     → instant match?
      → getScoreForKeywords(text)    → keyword scoring
      → classifyWithAI(metadata)     → OpenRouter API (if no match)
    → saveBookmark(bookmarkObj)      → IndexedDB
    → moveChromeBookmark()           → Chrome folder "Engine Organized"
```

## 2. Bulk Sync (Organize All)

```
runBulkSync()
  → getAll Chrome bookmarks via chrome.bookmarks.getTree()
  → flattenTree() → flat array with chromeFolder paths
  → processBookmark() for each:
    → Check if already in "Engine Organized" folder → extract category
    → Check IndexedDB for existing category
    → If neither: fetch + classify (same as new bookmark)
    → saveBookmark() to IndexedDB
  → Phase 2: moveChromeBookmark() for all needing moves
  → cleanupEmptyFolders()
```

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
  → moveBookmarkToCategory(bookmarkId, category, subcategory)
    → chrome.bookmarks.move()
  → updateBookmark(url, { chromeFolder: newPath })
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
