# Learnings — Recall

## Chrome Extension Development

### Manifest V3 Gotchas
- Service worker dies after 30 seconds of inactivity — must use `chrome.runtime.connect` keepalive port
- `chrome.tabGroups` not available in options/popup pages — must delegate to background via message passing
- Inline `onclick` handlers blocked by CSP — use `addEventListener` in JS modules
- `chrome.bookmarks.getTree()` returns nested structure — must flatten for bulk operations

### Chrome Bookmark API
- Bookmark bar ID is always `"1"` — never use folder name lookup (causes duplicates)
- `chrome.bookmarks.move()` moves both Chrome bookmark and updates path
- Empty folders left behind after moves — must cleanup manually
- `chrome.bookmarks.onCreated` fires before IndexedDB save completes — race condition

### IndexedDB
- `idb` library makes async/await possible — raw IndexedDB is callback hell
- Compound indexes enable efficient multi-field queries (`category_isTrashed`)
- Schema migrations must handle existing data (boolean → numeric for `isTrashed`)
- No size limit unlike `chrome.storage` (5MB cap)

### Search
- MiniSearch BM25 with prefix matching beats simple `includes()` for fuzzy search
- Field boosting (title 2x, tags 1.5x) significantly improves relevance
- AND mode too strict for short queries — fallback to OR when no results
- Index rebuild on startup is fast enough (<100ms for 1000 bookmarks)

## AI Integration

### OpenRouter API
- Gemini models require `reasoning: { exclude: true }` to prevent thinking-token burn
- Batch processing (15 bookmarks/request) much faster than individual calls
- LRU cache (500 entries) prevents re-classifying same domain/content
- JSON extraction from AI responses needs robust parsing (sometimes extra text)

### Prompt Engineering
- Hierarchical taxonomy (Category > Group > Leaf) gives better results than flat categories
- Include "Uncategorized" as fallback — AI shouldn't force classifications
- Domain rules + keyword scoring catch 70% of bookmarks before AI needed
- Validate AI output against taxonomy — don't trust blindly

## Build & Tooling

### Vite
- Multi-entry rollup works great for extension pages (popup, sidepanel, options)
- `modulePreload: false` required for extension compatibility
- Tailwind v4 via `@tailwindcss/vite` — no PostCSS config needed
- `__dirname` deprecation warning in Vite 8 — cosmetic, doesn't affect output

### Testing
- Jest requires `--experimental-vm-modules` for ESM support
- Mock Chrome APIs in `tests/setup.js` — real APIs unavailable in Node
- `jsdom` environment for DOM testing without browser
- 38 tests cover core logic (taxonomy, search, extractor, detector)

## UI/UX

### Tailwind CSS v4
- CSS-first configuration — no `tailwind.config.js`
- Utility classes only — no inline styles or vanilla CSS
- Shared class constants (`BTN`, `CARD`, `BADGE`) ensure consistency
- Responsive design with `sm:`, `md:` breakpoints

### Claymorphism Theme
- Soft shadows + rounded corners = friendly aesthetic
- `shared/ui.js` centralizes all design tokens
- Dark mode via `prefers-color-scheme` media query
- Consistent spacing with `p-space-*` and `m-space-*` tokens

## What I'd Do Differently

1. **Start with context files** — should have created `.opencode/context/` from day one
2. **More ADRs earlier** — documenting decisions as they happen, not after
3. **Test coverage first** — more tests before features would catch regressions faster
4. **Firefox consideration** — MV3 differences should have been researched upfront
5. **Keyboard shortcuts** — test on Mac first (Alt+R produces ® on Mac)
