# Project Progress — Recall

## Current Version: v1.0.0

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
- [x] Vite multi-entry build
- [x] Tailwind CSS v4 with claymorphism theme
- [x] GitHub Actions CI/CD (pr-check.yml, release.yml)
- [x] CRX generation for distribution

### Bug Fixes
- [x] Multiple Engine Organized folders (race condition + fallback bug)
- [x] Sync engine detects already-organized bookmarks
- [x] Responsive options page with hamburger menu
- [x] Bulkbar wrapping on small screens
- [x] Keyboard shortcut (Ctrl+Shift+K — UI removed, not working yet)

### Dead Code Cleanup
- [x] Removed semantic search module (unused)
- [x] Removed tag suggester module (unused)
- [x] Removed 6 dead functions from search.js, categories.js, db.js
- [x] Removed dead settings (semanticSearch)

## What's Next (v1.1)

- [ ] Fix keyboard shortcut (Ctrl+Shift+K)
- [ ] Sidebar view mode settings
- [ ] Keyboard navigation improvements
- [ ] Bookmark tags editor in bulk bar
- [ ] Custom category creation
- [ ] Firefox support

## Test Status

- **38 tests passing** (5 test suites)
- Search, taxonomy, extractor, inference, detector

## Build Status

- Clean build, no warnings (except Vite __dirname deprecation)
- `dist/` ready for Chrome loading
