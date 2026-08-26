# Bookmarkly

A Chrome extension (Manifest V3) that brings AI-powered semantic search and automatic categorization to your bookmarks.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-blue) ![License](https://img.shields.io/badge/License-MIT-green) ![Manifest V3](https://img.shields.io/badge/Manifest-V3-orange)

---

## What It Does

Bookmarkly keeps your bookmarks organized automatically. When you save a bookmark, it fetches the page metadata, classifies it into a category and subcategory using AI, and moves it into the right Chrome folder — no manual sorting needed.

**Key capabilities:**

- **Semantic search** — find bookmarks by meaning, not just exact keywords
- **Auto-categorization** — AI-powered classification into a structured taxonomy
- **Bulk operations** — select, tag, export, or delete multiple bookmarks at once
- **Duplicate detection** — find and merge duplicate bookmarks
- **Trash & restore** — soft-delete with configurable auto-purge
- **Import/Export** — JSON, CSV, and Chrome HTML formats

---

## How It Works

### The Categorization Pipeline

When a bookmark is saved (or when you click **Categorize with AI**), Bookmarkly runs this pipeline:

1. **Fast rules first** — Domain mappings and keyword scoring classify instantly if the URL is a known site (GitHub → Development / Languages & Tools / Open Source)
2. **AI fallback** — If fast rules don't match, the bookmark is sent to OpenRouter for classification using your chosen model
3. **Chrome folder move** — The physical Chrome bookmark is moved into the correct nested folder under `Engine Organized`
4. **IndexedDB update** — The `category`, `subcategory`, `tags`, and `chromeFolder` fields are stored for fast search

### The Taxonomy

Categories are structured hierarchically — each category has groups, and each group has subcategories. The AI picks the full path (e.g. `"Web / Frontend"`), never inventing new labels:

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
# Clone the repository
git clone https://github.com/aayushmehta25466/Bookmarkly.git
cd Bookmarkly

# Install dependencies
npm install

# Build the extension
npm run build
```

The built extension will be in the `dist/` folder.

### Load in Chrome

1. Open `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select the `dist/` folder from this project
5. Bookmarkly appears in your toolbar

### Install from Release

1. Go to [Releases](https://github.com/aayushmehta25466/Bookmarkly/releases)
2. Download the latest `bookmarkly-X.X.X.zip`
3. Unzip the file
4. Open `chrome://extensions/` → Enable **Developer mode** → **Load unpacked** → select the unzipped folder

### Connect an LLM (OpenRouter)

Bookmarkly uses [OpenRouter](https://openrouter.ai/) to access AI models for categorization. You need a free API key:

1. Go to [openrouter.ai](https://openrouter.ai/) and sign up (free tier available)
2. Click **Keys** in the sidebar → **Create Key**
3. Copy the API key
4. In Bookmarkly, click the **Settings** gear icon
5. Paste your API key in the **OpenRouter API Key** field
6. Pick a model (default: `Gemini 2.5 Flash Lite` — fast and free)

**Available models:**

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

### Categorize Your Bookmarks

1. Click the **Settings** gear → go to the **Home** tab
2. Click **Categorize with AI** — this sends uncategorized bookmarks to the AI in batches of 15
3. Watch the progress bar as bookmarks are classified and moved into Chrome folders
4. Once done, your bookmarks appear organized under `Engine Organized` in the Chrome sidebar

---

## Development

```bash
npm run dev       # Vite dev server with hot reload
npm run build     # Production build to dist/
npm test          # Run Jest tests
```

### Architecture

```
extension/
├── popup/          # Search UI (520×620 popup)
├── options/        # Settings, Home tab, bulk actions
└── background/     # Service worker — sync, AI classification, folder moves

core/
├── ai-classifier/  # Single + batch AI classification via OpenRouter
├── taxonomy/       # Category tree, domain mappings, keyword rules
├── search-index/   # Search indexing and query matching
├── folder-manager/ # Chrome bookmark folder creation + moves
├── sync-engine/    # Full sync + incremental classification
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
- Vite (bundler)
- Tailwind CSS v4
- IndexedDB (via `idb`)
- Jest (testing)
- ESM modules throughout

### Releases

This project uses GitHub Actions to automate releases. The workflow:

1. **On every PR** — builds the extension and runs tests
2. **On tag push** — builds, zips the extension, and creates a GitHub Release

**To create a release:**

```bash
# Bump version (updates package.json and creates a git tag)
npm version patch   # 0.0.1 → 0.0.2
npm version minor   # 0.0.2 → 0.1.0
npm version major   # 0.1.0 → 1.0.0

# Push the tag to trigger the release workflow
git push --follow-tags
```

This automatically:
- Syncs the version into `manifest.json`
- Zips the `dist/` folder as `bookmarkly-X.X.X.zip`
- Creates a GitHub Release with install instructions

---

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
