# Agent Guide: Recall

Chrome extension (Manifest V3) for semantic bookmark search and auto-categorization.

## Commands

- `npm run dev` — Vite dev server
- `npm run build` — builds to `dist/`
- `npm test` — runs Jest (requires `--experimental-vm-modules`, already in script)

## Architecture

| Directory | Purpose |
|-----------|---------|
| `extension/` | UI: `popup/` (search), `options/` (settings), `background/` (service worker) |
| `core/` | Business logic: `metadata-extractor/`, `taxonomy/`, `search-index/`, `folder-manager/`, `sync-engine/`, `duplicate-detector/` |
| `database/` | IndexedDB layer (`database/indexeddb/db.js`) via `idb` library |
| `shared/types/` | Data models (`bookmark.js`, `taxonomy.js`) |
| `tests/` | Jest tests for core modules |

## Key Quirks

- **ESM everywhere** — `"type": "module"` in package.json, all imports use `.js` extensions
- **Tailwind CSS v4** — uses `@tailwindcss/vite` plugin, not PostCSS config
- **Service worker context** — `background.js` runs in a service worker, not a page; no DOM access
- **No lint/format configured** — no ESLint, Prettier, or similar
- **Tests require experimental flag** — `node --experimental-vm-modules` (built into `npm test` script)
- **Vite builds extension** — multi-entry rollup config outputs popup, options, background separately

## Data Flow

1. Bookmark created → `background.js` listener fires
2. Fetches URL HTML → `extractMetadata()` pulls OG/twitter/meta tags
3. `inferContentType()` classifies content type
4. Taxonomy: check `domainMappings.js` first, fallback to `keywordRules.js` scoring
5. Save to IndexedDB → move Chrome bookmark to organized folder

## Extending

- Add domain mappings: edit `core/taxonomy/domainMappings.js`
- Add keyword rules: edit `core/taxonomy/keywordRules.js`
- New core modules go in `core/<module-name>/`
