# Architecture — Recall

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Extension | Manifest V3 | Required for Chrome Web Store, service worker background |
| UI Framework | Tailwind CSS v4 | Utility-first, no PostCSS config needed with Vite plugin |
| Build | Vite 8 | Fast, multi-entry rollup, native ESM |
| Storage | IndexedDB via `idb` | Bulk data (bookmarks), compound indexes, no 5MB limit |
| Search | MiniSearch | Local BM25, fuzzy matching, no server required |
| AI | OpenRouter | Multi-model access, Gemini 2.5 Flash Lite cheap + fast |
| Testing | Jest 30 | `--experimental-vm-modules` for ESM support |

## Why Not...

- **chrome.storage**: 5MB limit, no compound indexes, slow for bulk reads
- **Algolia/Typesense**: Requires server, overkill for local bookmarks
- **Direct OpenAI/Gemini API**: OpenRouter gives model flexibility
- **React/Vue**: Overkill for extension UI, vanilla JS + Tailwind足够
- **PostCSS**: Tailwind v4 has native Vite plugin, no config needed

## Manifest V3 Constraints

- Service worker (not persistent background page)
- No DOM access in background
- `chrome.sidePanel` API for sidebar
- `chrome.tabGroups` for tab grouping
- Message passing between popup/sidepanel/options ↔ background

## IndexedDB Schema

```
Database: recall-db (v3)
Store: bookmarks
  keyPath: url
  indexes:
    - category
    - dateAdded
    - isTrashed (0 or 1, not boolean)
    - sortOrder
    - category_isTrashed (compound)
```

## Build Output

```
dist/
├── extension/
│   ├── popup/popup.html
│   ├── sidepanel/sidepanel.html
│   └── options/options.html
├── background.js
├── popup.js
├── sidepanel.js
├── options.js
└── ui.css
```
