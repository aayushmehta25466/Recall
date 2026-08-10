# Bookmarkly

A Chrome extension (Manifest V3) for semantic bookmark search and auto-categorization.

## Features

- **Semantic Search** — Search bookmarks by meaning, not just keywords
- **Auto-Categorization** — AI-powered classification into categories and subcategories
- **Bulk Operations** — Select, move, tag, export, or delete multiple bookmarks
- **Smart Tags** — Auto-suggest tags after sync using AI
- **Duplicate Detection** — Find and merge duplicate bookmarks
- **Trash & Restore** — Soft-delete with auto-purge options
- **Import/Export** — JSON, CSV, and Chrome HTML formats
- **Dark/Light Theme** — Auto-detect system theme or manual override

## Architecture

| Directory | Purpose |
|-----------|---------|
| `extension/` | UI: `popup/` (search), `options/` (settings), `background/` (service worker) |
| `core/` | Business logic: `metadata-extractor/`, `taxonomy/`, `search-index/`, `folder-manager/`, `sync-engine/`, `duplicate-detector/` |
| `database/` | IndexedDB layer via `idb` library |
| `shared/` | Types, UI constants, settings |
| `tests/` | Jest tests for core modules |

## Development

```bash
npm install
npm run dev       # Vite dev server
npm run build     # Build to dist/
npm test          # Run Jest tests
```

## Loading the Extension

1. Run `npm run build`
2. Open `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" → select the `dist/` folder

## Tech Stack

- Chrome Extension Manifest V3
- Vite (bundler)
- Tailwind CSS v4
- IndexedDB (via `idb`)
- Jest (testing)
- ESM modules throughout

## License

MIT License

Copyright (c) 2026 Aayush Mehta

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
