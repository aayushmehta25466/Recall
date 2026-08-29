# Recall v1.0.0

AI-powered bookmark organizer for Chrome. Automatically categorize, search, and manage your bookmarks with AI assistance.

---

## Features

### AI Auto-Categorization
- **Hierarchical taxonomy** — 9 top-level categories with nested groups and leaf nodes
  - Development (Web, Mobile, DevOps, Data & AI, Languages & Tools)
  - Learning (Content, References)
  - Business (Operations, Strategy)
  - Design (Visual, Resources)
  - Productivity, Entertainment, News & Media, Shopping, Personal
- **Domain rules** — Instant classification for known sites (GitHub, YouTube, Stack Overflow, etc.)
- **Keyword scoring** — Fast local matching before hitting the AI API
- **Batch AI classification** — Processes 15 bookmarks per request via OpenRouter (Gemini 2.5 Flash Lite default)
- **Chrome folder sync** — Organized bookmarks live in Chrome's bookmark tree under "Engine Organized"

### Search
- **BM25 full-text search** — MiniSearch-powered local indexing with field boosting (title 2x, tags 1.5x, keywords 1.5x)
- **Fuzzy matching** — 20% tolerance for typos
- **Prefix matching** — "react" matches "reactjs"
- **Search history** — Last 20 queries stored, dropdown on focus, delete individual entries

### UI
- **Chrome Side Panel** — Search, category filters, stats, quick actions without leaving your page
- **Popup view** — Quick search from the extension icon
- **Options page** — Full management with tabs (Bookmarks, Trash, Settings, Data, Rules, Review)
- **Folder view** — Browse bookmarks organized by Chrome folder structure
- **Bulk operations** — Select, move, tag, export, open, or delete multiple bookmarks
- **Tab grouping** — Open multiple bookmarks in named Chrome tab groups (chunked: 5 tabs/batch)
- **Responsive design** — Hamburger menu with slide-in sidebar on mobile, adapts to any window size

### Data Management
- **Export/Import** — JSON backup and restore
- **Trash system** — Soft-delete with auto-purge (configurable: 7/30 days or never)
- **Duplicate detection** — URL normalization strips tracking params (utm_*, fbclid, gclid)
- **IndexedDB storage** — Local-only, no server required

---

## Architecture

| Layer | Technology |
|-------|-----------|
| Extension | Manifest V3, service worker background |
| UI | Tailwind CSS v4, claymorphism theme |
| Search | MiniSearch (BM25 full-text) |
| Storage | IndexedDB via `idb` library |
| AI | OpenRouter API (Gemini 2.5 Flash Lite) |
| Build | Vite with multi-entry rollup |

### Key Files
- `extension/background/` — Service worker: bookmark listeners, search index, tab grouping
- `extension/sidepanel/` — Side panel UI
- `extension/options/` — Full settings and management page
- `core/ai-classifier/` — AI classification with batch processing
- `core/search-index/` — MiniSearch BM25 indexing
- `core/sync-engine/` — Bulk sync with Chrome folder management
- `core/taxonomy/` — Hierarchical category tree, domain mappings, keyword rules
- `core/folder-manager/` — Chrome bookmark folder creation and movement
- `database/indexeddb/` — IndexedDB wrapper with compound indexes

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+K` / `Cmd+Shift+K` | Toggle sidebar |

---

## Settings

- **Auto-organize** — Automatically categorize new bookmarks on creation
- **Duplicate policy** — Keep oldest or overwrite
- **AI model** — Default: `google/gemini-2.5-flash-lite` (configurable)
- **Theme** — Auto, dark, or light
- **View mode** — Sidebar or popup
- **Sidebar position** — Left or right
- **Trash auto-purge** — 7, 30, or never
- **Custom domain mappings** — Add your own domain → category rules

---

## Install

### From Release
1. Download the latest release
2. Extract the zip
3. Go to `chrome://extensions/`
4. Enable **Developer Mode** (top right)
5. Click **Load unpacked**
6. Select the `dist/` folder

### From Source
```bash
git clone https://github.com/aayushmehta25466/Recall.git
cd Recall
npm install
npm run build
```
Then load the `dist/` folder as above.

---

## Development

```bash
npm run dev      # Vite dev server
npm run build    # Production build to dist/
npm test         # Run Jest tests (38 tests)
```

---

## What's Next (v1.1)

- Keyboard navigation improvements
- Bookmark tags editor in bulk bar
- Custom category creation
- Firefox support

---

## License

MIT
