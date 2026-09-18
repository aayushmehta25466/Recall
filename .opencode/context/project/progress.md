# Project Progress — Recall

## Current Version: v1.0.1

**Status**: Released, pushed to GitHub with tag

## What's Done

### Core Features
- [x] AI auto-categorization with hierarchical taxonomy
- [x] BM25 full-text search (MiniSearch)
- [x] Chrome Side Panel UI
- [x] Bulk operations (select, move, tag, export, open, delete)
- [x] Tab grouping (5 tabs/batch, named groups)
- [x] Duplicate detection (URL normalization)
- [x] Trash with auto-purge
- [x] Export/Import JSON
- [x] Search history (last 20 queries)

### Infrastructure
- [x] Manifest V3 with service worker
- [x] IndexedDB with compound indexes
- [x] **Extension.js v4.1.10** (cross-browser build system)
- [x] Tailwind CSS v4 with claymorphism theme
- [x] GitHub Actions CI/CD (pr-check.yml, release.yml)
- [x] Extension.dev MCP server configured

### Bug Fixes
- [x] Multiple Engine Organized folders (race condition + fallback bug)
- [x] Sync engine detects already-organized bookmarks
- [x] Responsive options page with hamburger menu
- [x] Bulkbar wrapping on small screens
- [x] Keyboard shortcut (Ctrl+Shift+K — UI removed, not working yet)
- [x] Stale Chrome bookmark ID errors (now uses URL lookup)
- [x] Empty folders after merge (recursive cleanup added)
- [x] Rebranded to Recall across all files
- [x] New bookmarks auto-move to Chrome folder on creation (was: indexed only)
- [x] New bookmarks ALWAYS file under "Engine Organized" — fast-rule misses go to
      "Engine Organized / Uncategorized" instead of staying in the user's root.
      Move uses the fresh onCreated Chrome ID; DB `chromeFolder` mirrors it.
      AI is never auto-run on creation (stays a manual "Categorize with AI" action).
- [x] New-bookmark auto-organize made reliable. `background.js` now registers every
      MV3 event listener **synchronously at module top**, before any startup work, and
      guards optional APIs (`chrome.sidePanel?.…`, `chrome.commands?.…`). Previously a
      throwing optional-API call (`sidePanel.setPanelBehavior(...).catch(...)`) aborted
      module evaluation, so `onCreated` was never attached — bookmarks were indexed by
      the install sync but never moved. A failed creation move now retries immediately
      (0/400/1200 ms) before falling back to the persisted queue, and each saved
      bookmark is added to the MiniSearch index on save (`indexBookmark`).
- [x] Duplicate policy no longer blocks filing an already-indexed-but-unplaced
      bookmark. `processNewBookmark()` previously returned whenever the URL existed
      in IndexedDB under `keep_oldest`, so re-saving a bookmark the install sync had
      only indexed (never moved) silently did nothing. It now skips only when the
      existing record is already inside the engine tree (`parseEngineFolderPath`),
      reuses its stored category otherwise (no network), and logs every branch
      (`processing … (parentId=…)`, `reusing stored category`, `move attempt N/M failed`,
      `new bookmark FILED → …`).
- [x] Deletion made correct end-to-end:
      - `handleBookmarkRemoved` always processes deletions (the `isSyncing` early-return
        is gone); it verifies the URL is really gone from Chrome (so a sync move can't
        look like a delete), soft-deletes it, and prunes the search index
        (`removeFromIndex`).
      - **Deleting a folder now trashes its contents.** Chrome fires `onRemoved` once for
        a folder, not its contents, so a folder removal schedules a debounced
        reconciliation (`reconcileRemovedBookmarks`) that trashes every active DB bookmark
        whose URL is gone from Chrome. Same pass runs on worker startup, after install
        sync, and after each bulk sync — the safety net for any missed event. An empty
        tree is skipped so a cold worker can't wipe the library.
      - **Restore recreates the Chrome bookmark** in its category folder when it is
        missing (was: DB-only "phantom"), and re-indexes it.
      - **Options** routes trash / restore / empty-trash through the background worker
        (`TRASH_BOOKMARK`, `RESTORE_BOOKMARK`, `EMPTY_TRASH`) so Chrome and the
        worker-owned search index stay in sync; `EMPTY_TRASH` rebuilds the index.
      - New `core/sync-engine/reconcile.js`; tests in `tests/reconcile.test.js`.
- [x] UI-trash now also removes the Chrome bookmark (was: DB-only until Empty Trash),
      so Trash/Restore are symmetric — Restore recreates it in its category folder.
- [x] Legacy-store fix: DB v4 migration backfills `isTrashed: 0` on records written
      before the field existed (`normalizeTrashFields`). Those records matched neither
      the 0 nor the 1 index entry, so they were invisible to Home, search, and
      reconciliation. `getActiveBookmarks()` simplified to the plain index query.
- [x] UI density pass:
      - Options sidebar `w-[260px]` → `208px`, tighter nav rows/icons; tagline removed.
      - Sidepanel restructured: header holds icon actions (home/settings/organize/trash/
        close) so the separate quick-actions row is gone; stats collapsed to one dim line
        with a `Select all` link; category filters are a single horizontally-scrolling
        chip rail; search padding tightened.
      - The bulk-action toolbar in both popup and sidepanel now appears **only when a
        bookmark is selected** (`updateActionBar()` owns visibility); a compact
        `Select all` affordance keeps bulk-select reachable from zero selection.
      - Removed the "AI bookmark organizer" tagline (all three pages) and the `(Alt+B)`
        search hint.
      - Settings checkboxes are now toggle switches (`role="switch"` + `aria-checked`
        synced via `syncSwitch`); selection lists keep native checkboxes.
      - Fixed the sidepanel category chip active state (the click handler toggled a
        stale `.active` class; a shared `renderCategoryFilters()` now repaints it) and
        the empty search box now lists the whole library instead of blanking.
      - The chip rail keeps a thin (4px) visible horizontal scrollbar plus
        wheel-to-horizontal scrolling, so mouse users can reach off-screen categories
        — a hidden bar left no drag affordance and Chrome needs Shift+wheel for a
        horizontal container. (`#categoryFilters` rules in `popup.css` are deliberately
        unlayered so they can override the global scrollbar rule.)
- [x] AI on save (opt-in): new `autoAiCategorize` setting (default **off**, AI section
      toggle). Review tab's "Categorize with AI" button is disabled (greyed, tooltip) when
      there is nothing uncategorized, owned by `setBatchButtonState()` in `loadReview()`.
      Tests: `tests/classify-bookmark.test.js`.
- [x] Auto-AI now runs the **batch** workflow, not a per-bookmark call.
      - Creation passes `useAI: false` — fast rules only. Anything that lands
        `Uncategorized` is queued via `autoAi.schedule()` (`core/ai-classifier/autoQueue.js`),
        which runs `runBatchCategorize` (15 URLs/request) over **every** uncategorized
        bookmark. Paying the ~1.5k-token taxonomy prompt once per 15 URLs instead of once
        per bookmark is the whole point.
      - Guards, each with its own log: setting off, no API key, `isSyncing`,
        **`hasWork()` false (so a no-op never costs a token)**, lock held. Debounced 4 s
        (a burst of saves = one run); a denied lock re-schedules instead of overlapping.
      - `shared/aiLock.js` (`chrome.storage.local`, 5-min TTL) serializes the worker's
        auto-run and the options page's manual Review run — same IndexedDB, two contexts.
      - The worker broadcasts `AI_BATCH_PROGRESS`; the Review tab mirrors it in the
        existing progress bar.
      - Tests: `tests/autoQueue.test.js` (debounce, all guards, lock deferral, error,
        one-extra-run-after-a-mid-run-schedule).
- [x] Bookmarks-bar lookup no longer assumes id "1": tries known ids
      (`1`, `toolbar_____`), retries a not-yet-loaded tree, then falls back to the
      root's first folder — and logs the real root children when it can't resolve.
- [x] `onCreated` always organizes immediately, even during a bulk sync. The
      `isSyncing` gate that dropped/queued new bookmarks is gone — that gate is
      why saved bookmarks only got organized after a manual "Organize Now".
      Install sync resets `isSyncing` in a `finally`; failed moves still retry.
- [x] Failed native moves persist in `chrome.storage.local`
      (`core/folder-manager/moveQueue.js`) and retry on worker startup / after
      sync, dropping after 5 attempts — no more silently lost moves.
- [x] Bulk sync moves already-categorized but unplaced bookmarks (was: skipped as "done")
- [x] Already-organized bookmarks are never re-fetched, re-classified, or re-moved
      during sync. New `parseEngineFolderPath()` (`core/folder-manager/paths.js`) trusts
      anything under `Engine Organized`: the root is found anywhere in the path
      (case-insensitive, so a Firefox `toolbar_____` prefix can't defeat it) and an
      unrecognized category folder resolves to `Uncategorized` — never AI. AI now runs
      only for bookmarks outside the tree with no DB category, and re-running sync over
      an organized library is a no-op (zero fetch/AI/move). A DB-categorized bookmark the
      user has placed in a folder is left alone. `flattenTree()` uses a depth rule so the
      bar never enters `chromeFolder`. Tests: `tests/bulk-sync.test.js`, `paths` cases in
      `tests/folder-manager.test.js`.
- [x] Self-hosted Nunito (variable, weights 400–800) in `extension/fonts/`,
      bundled to `assets/`; removed the remote Google Fonts `<link>`/`preconnect`
      tags from popup/options/sidepanel — MV3 CSP was silently dropping the font

### Dead Code Cleanup
- [x] Removed semantic search module (unused)
- [x] Removed tag suggester module (unused)
- [x] Removed 6 dead functions from search.js, categories.js, db.js
- [x] Removed dead settings (semanticSearch)

### Extension.js Migration
- [x] Installed Extension.js v4.1.10
- [x] Created extension.config.js
- [x] Moved manifest.json to project root
- [x] Updated package.json scripts
- [x] Build successful for Chrome (1.0 MB output)
- [x] All 38 tests passing
- [x] Context files updated

### Cross-browser targets — Firefox + Opera
- [x] **Popup ↔ side panel parity.** Both surfaces are now one implementation:
      `shared/ui/searchPanel.js` → `mountSearchPanel({ variant })`, mounted by 3-line
      entry files. `extension/popup/popup.html` and `extension/sidepanel/sidepanel.html`
      are the same structure (verified: identical `id` sets in the built output), differing
      only in `<body>` sizing. `variant` covers the real differences: close button
      (`closeSidebar()` vs `window.close()`), canvas, auto-focus. The old duplicated
      ~500-line `popup.js` / `sidepanel.js` are gone, so they can't drift again.
- [x] `shared/platform.js` — `api` = lazily-resolved `browser ?? chrome`, `caps`
      (`sidePanel` / `tabGroups`), promise `sendMessage` / `storageGet|Set|Remove`,
      `broadcast`, and `closeSidebar` / `toggleSidebar` (routing to `sidebarAction` on Gecko).
- [x] Build targets: `build:chrome`, `build:firefox`, `build:opera`, `build:all`
      (`--browser=chrome,firefox,opera --zip`), plus `dev:firefox` / `dev:opera`.
      Zips land in `dist/<browser>/`.
- [x] One source, per-engine manifests via browser-prefixed keys:
      `chromium:permissions` / `chromium:background` / `chromium:side_panel` and
      `firefox:permissions` / `firefox:background` / `firefox:sidebar_action`.
      Verified: the Firefox manifest drops `sidePanel` and uses `background.scripts` +
      `sidebar_action`; Chrome keeps `sidePanel` + `background.service_worker`.
- [x] Firefox AMO readiness: `browser_specific_settings.gecko.data_collection_permissions`
      (`required: ["none"]`, `optional: ["bookmarksInfo", "websiteContent"]` for the opt-in AI
      path). `strict_min_version` raised to **140.0** — tab groups need 139, but the built-in
      data-consent experience needs 140. `addons-linter` reports 0 warnings / 0 errors.
- [x] Firefox runtime migration: **46 awaited `chrome.*` calls** moved to the `api` proxy
      (`manager.js` 21, `background.js` 19, `options.js` 5, `bulk.js` 1) — MDN is explicit that
      Firefox's `chrome` namespace is callback-based, so `await chrome.*` returned `undefined`
      there. Sidebar calls now go through `toggleSidebar()` / `closeSidebar()` (sidePanel →
      sidebarAction), and the fire-and-forget `sendMessage(...).catch()` calls became
      `broadcast()`. Remaining `chrome.*` use is callback-style messaging / listeners / `connect`,
      which both engines support.
- [x] Release pipeline fixed: `release.yml` now builds **all three targets**, syncs the tag
      version into **every** manifest (not just Chrome), removes the build's own zip before
      packaging (it used to publish a nested zip — a store-review rejection), attaches
      per-browser zips, and reads a curated body from `RELEASE_NOTES.md`. `pr-check.yml` builds
      all targets, verifies per-engine manifests, and runs on Node 22 (Extension.js needs ≥ 22.12).
- [x] Version bumped to **2.0.0** in `package.json` + `manifest.json`; `recall-*.zip` gitignored.

## What's Next (v1.1)

- [ ] Test Chrome build in browser (load dist/chrome/)
- [ ] Fix keyboard shortcut (Ctrl+Shift+K)
- [ ] Add Firefox manifest keys
- [ ] Add API fallbacks for Firefox (sidePanel, tabGroups)
- [ ] Test Firefox build
- [ ] Update CI/CD for multi-browser builds
- [ ] Keyboard navigation improvements
- [ ] Bookmark tags editor in bulk bar
- [ ] Custom category creation

## Test Status

- **93 tests passing** (12 test suites)
- Search, taxonomy, extractor, inference, detector, folder-manager, moveQueue, bulk-sync, reconcile, db-normalize, classify-bookmark, autoQueue

## Build Status

- Extension.js build successful
- Output: `dist/chrome/` (Chrome + Edge + Brave)
- Ready for browser testing
