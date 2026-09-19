<p align="center">
  <a href="README.md"><b>Readme</b></a> · 
  <a href="CONTRIBUTING.md">Contributing</a> · 
  <a href="LICENSE">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Chrome-Extension-blue" alt="Chrome Extension">
  <img src="https://img.shields.io/badge/License-Apache--2.0-blue" alt="License: Apache-2.0">
  <img src="https://img.shields.io/badge/Manifest-V3-orange" alt="Manifest V3">
</p>

<h1 align="center">Recall</h1>

<p align="center">
  A Chrome extension that automatically organizes your bookmarks using fast rules + AI fallback.
</p>

---

## What It Does

Recall keeps your bookmarks organized automatically. When you save a bookmark, it fetches the page metadata, classifies it using a two-phase approach (fast rules first, AI as fallback), and moves it into the right Chrome folder.

- **Smart categorization** — Fast rules (domain mappings + keywords) with AI fallback for unknown sites
- **Full-text search** — BM25 search with fuzzy matching and typo tolerance
- **Bulk operations** — select, tag, export, or delete multiple bookmarks at once
- **Duplicate detection** — find and merge duplicate bookmarks
- **Trash & restore** — soft-delete with configurable auto-purge
- **Import/Export** — JSON, CSV, and Chrome HTML formats
- **Tab grouping** — open multiple bookmarks in Chrome tab groups

---

## How It Works

### Two-Phase Categorization

Recall uses a two-phase approach to classify bookmarks efficiently:

**Phase 1: Instant Rules (no AI, no network)**
- Domain mappings (GitHub → Development, YouTube → Entertainment, etc.)
- Keyword scoring (title + description + URL matching against taxonomy)
- Custom user-defined rules

**Phase 2: AI Fallback (only when rules fail)**
- If Phase 1 returns "Uncategorized" → sends to OpenRouter AI
- Only runs during bulk sync, not on every bookmark save
- Requires OpenRouter API key (free tier available)

### Bookmark Processing Flow

```
New Bookmark Created
  └─ Fetch HTML → Extract metadata → Fast rules → Save to IndexedDB
     (Chrome bookmark NOT moved — user organizes manually)

Bulk Sync (Background)
  For each bookmark:
    ├─ Already in "Engine Organized" folder? → Extract category from path
    ├─ Already in IndexedDB with category? → Keep existing
    └─ Need classification?
         ├─ Fetch HTML → Extract metadata
         ├─ Fast rules → If match → Save
         └─ If "Uncategorized" + API key → AI classification → Save → Move Chrome bookmark
```

### The Taxonomy

Categories are structured hierarchically — each category has groups, and each group has leaves. The system picks the full path (e.g. `"Web / Frontend"`), never inventing new labels:

```
Development
├── Web          → Frontend, Backend, API, Documentation
├── Mobile       → iOS, Android
├── DevOps & Cloud → DevOps, Cloud, Security
├── Data & AI    → Database, AI, ML, LLM, Robotics
└── Languages & Tools → Programming Languages, Architecture, Testing, Extensions, Open Source

Learning
├── Content      → Courses, Tutorials, Videos, Blogs, Books, Lectures
└── References   → Cheat Sheets, References, Research Papers

Business
├── Operations   → SaaS, Marketing, Finance, Legal, HR, Accounting, Sales
└── Strategy     → Startups, Product Management, Analytics

Design
├── Visual       → UI/UX, Typography, Colors, Icons, Illustrations, Assets
└── Resources    → Inspiration, Tools, Guidelines

Productivity    → Task Management, Note Taking, Calendars, Collaboration, Communication

Entertainment
├── Media        → Gaming, Movies, Music, Streaming
└── Leisure      → Hobbies, Humor, Comics

News & Media    → Tech News, World News, Magazines, Newsletters, Podcasts

Shopping        → Electronics, Clothing, Home, Books, Software, Subscriptions

Personal        → Travel, Health, Recipes, Finances, Fitness, Real Estate, Vehicles
```

This creates Chrome folders like:
```
Bookmarks Bar
└── Engine Organized
    ├── Development
    │   └── Web
    │       ├── Frontend
    │       └── Backend
    ├── Learning
    │   └── Content
    │       └── Tutorials
    └── ...
```

---

## Setup

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- Google Chrome or Chromium browser

### Install from Source

```bash
git clone https://github.com/aayushmehta25466/Recall.git
cd Recall
npm install
npm run build
```

The built extension will be in the `dist/chromium/` folder.

### Load in Chrome

1. Open `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select the `dist/chromium/` folder from this project
5. Recall appears in your toolbar

### Install from Release

1. Go to [Releases](https://github.com/aayushmehta25466/Recall/releases)
2. Download the latest `recall-X.X.X.zip`
3. Unzip the file
4. Open `chrome://extensions/` → Enable **Developer mode** → **Load unpacked** → select the unzipped folder

---

## Connect an LLM (Optional)

Recall uses [OpenRouter](https://openrouter.ai/) for AI classification as a fallback when fast rules can't categorize a bookmark. **This is optional** — Recall works without an API key using domain mappings and keyword rules.

### Setup

1. Go to [openrouter.ai](https://openrouter.ai/) and sign up (free tier available)
2. Click **Keys** in the sidebar → **Create Key**
3. Copy the API key
4. In Recall, click the **Settings** gear icon
5. Paste your API key in the **OpenRouter API Key** field
6. Pick a model (default: `Gemini 2.5 Flash Lite` — fast and free)

### Available Models

| Model | Speed | Cost |
|-------|-------|------|
| Gemini 2.5 Flash Lite (default) | Fast | Free tier |
| Gemini 2.5 Flash | Fast | Free tier |
| Gemini 3 Flash | Fast | Free tier |
| Grok 4.1 Fast | Fast | Paid |
| DeepSeek V3.1 Terminus | Medium | Free tier |
| GPT-4o Mini | Medium | Paid |
| GPT-5 Nano | Medium | Paid |
| Llama 4 Scout | Medium | Free tier |
| GPT-OSS 120B | Slow | Free tier |

### Organize Your Bookmarks

1. Click the **Settings** gear → go to the **Home** tab
2. Click **Categorize with AI** — this runs bulk sync on uncategorized bookmarks
3. Watch the progress bar as bookmarks are classified and moved into Chrome folders
4. Once done, your bookmarks appear organized under `Engine Organized` in the Chrome sidebar

**Note:** Only bookmarks that don't match fast rules (domain mappings + keywords) are sent to AI. Bookmarks matching known domains are classified instantly without API calls.

---

## Development

```bash
npm run dev          # Extension.js dev server (Chrome)
npm run build        # Extension.js production build
npm run build:chrome # Explicit Chrome build
npm run build:firefox # Firefox build (future)
npm test             # Run Jest tests
```

### Architecture

```
extension/
├── popup/          # Quick search UI (520×620 popup)
├── sidepanel/      # Side panel search with history and filters
├── options/        # Settings, Home tab, bulk actions, trash, rules
└── background/     # Service worker — sync, AI classification, folder moves

core/
├── ai-classifier/  # AI classification via OpenRouter (fallback only)
├── taxonomy/       # Category tree, domain mappings, keyword rules
├── search-index/   # BM25 full-text search with MiniSearch
├── folder-manager/ # Chrome bookmark folder creation + moves
├── sync-engine/    # Full sync + incremental classification
├── metadata-extractor/ # HTML metadata extraction (OG tags, meta)
└── duplicate-detector/

database/
└── indexeddb/      # IndexedDB layer via `idb` library

shared/
├── types/          # Data models (Bookmark, Taxonomy)
└── settings.js     # Default settings + migration

tests/              # Jest tests for core modules
```

### Tech Stack

- Chrome Extension Manifest V3
- Extension.js (cross-browser build system)
- Tailwind CSS v4
- IndexedDB (via `idb`)
- MiniSearch (BM25 full-text search)
- Jest (testing)
- ESM modules throughout

---

## Releases

This project uses GitHub Actions to automate releases. The workflow:

1. **On every PR** — builds the extension and runs tests
2. **On tag push** — builds, zips the extension, and creates a GitHub Release

**To create a release:**

```bash
# Bump version (updates package.json and creates a git tag)
npm version patch   # 1.0.0 → 1.0.1
npm version minor   # 1.0.0 → 1.1.0
npm version major   # 1.0.0 → 2.0.0

# Push the tag to trigger the release workflow
git push --follow-tags
```

This automatically:
- Syncs the version into `manifest.json`
- Zips the `dist/` folder as `recall-X.X.X.zip`
- Creates a GitHub Release with install instructions
