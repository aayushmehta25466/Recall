# Architecture Decisions — Recall

## ADR-001: Manifest V3 over V2

**Decision**: Use Manifest V3
**Status**: Accepted
**Context**: Chrome Web Store requires MV3 for new extensions. MV2 is deprecated.
**Consequences**:
- Service worker (not persistent background page)
- No DOM access in background
- Must use message passing for UI ↔ background communication
- `chrome.sidePanel` API available

## ADR-002: IndexedDB over chrome.storage

**Decision**: Use IndexedDB via `idb` library for bookmark storage
**Status**: Accepted
**Context**: chrome.storage has 5MB limit, no compound indexes, slow for bulk reads.
**Consequences**:
- No size limit for bookmarks
- Compound indexes for efficient queries (`category_isTrashed`)
- Async API via `idb` wrapper
- Must handle schema migrations (v1→v2→v3)

## ADR-003: MiniSearch over External Search

**Decision**: Use MiniSearch for local BM25 search
**Status**: Accepted
**Context**: Want offline search, no server dependency, fast local indexing.
**Consequences**:
- BM25 ranking with field boosting
- Fuzzy matching (20% tolerance)
- Index rebuilt on startup and after bulk operations
- No external service dependency

## ADR-004: OpenRouter over Direct AI APIs

**Decision**: Use OpenRouter for AI classification
**Status**: Accepted
**Context**: Want model flexibility, not locked to one provider.
**Consequences**:
- Default: Gemini 2.5 Flash Lite (cheap, fast)
- User can configure any OpenRouter model
- Single API endpoint for all models
- `reasoning: { exclude: true }` for Gemini thinking tokens

## ADR-005: Tailwind CSS v4 via Vite Plugin

**Decision**: Use Tailwind v4 with `@tailwindcss/vite` plugin
**Status**: Accepted
**Context**: No PostCSS config needed, native Vite integration.
**Consequences**:
- No `tailwind.config.js` needed
- CSS-first configuration
- Faster builds than v3
- Shared class constants in `shared/ui.js`

## ADR-006: Factory Functions over Classes

**Decision**: Use factory functions for data models
**Status**: Accepted
**Context**: Simpler, more functional, easier to test.
**Consequences**:
- `createBookmark(data)` returns plain object
- No `new` keyword, no `this` binding
- Easy to mock in tests
- Consistent with functional programming style

## ADR-007: Folder Cache for Race Conditions

**Decision**: Cache folder IDs in `getOrCreateFolder`
**Status**: Accepted
**Context**: Concurrent bookmark moves created duplicate "Engine Organized" folders.
**Consequences**:
- `folderCache` Map prevents duplicate creation
- Must clear between sync runs (`clearFolderCache()`)
- Eliminates TOCTOU race condition

## ADR-008: ID-Based Bookmark Bar Lookup

**Decision**: Use Chrome ID "1" for bookmark bar, no fallback
**Status**: Accepted
**Context**: Fallback logic returned different nodes, causing multiple root folders.
**Consequences**:
- Always targets the same bookmark bar
- Returns null if ID "1" not found (fail-safe)
- No more scattered "Engine Organized" folders
