<p align="center">
  <a href="README.md"><b>Readme</b></a> ·
  <a href="CONTRIBUTING.md">Contributing</a> ·
  <a href="LICENSE">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-2.0.1-blue" alt="Version 2.0.1">
  <img src="https://img.shields.io/badge/license-Apache--2.0-green" alt="License: Apache-2.0">
  <img src="https://img.shields.io/badge/manifest-V3-orange" alt="Manifest V3">
  <img src="https://img.shields.io/badge/chrome%20·%20firefox%20·%20opera-supported-success" alt="Chrome, Firefox, Opera">
</p>

<h1 align="center">Recall</h1>

<p align="center">
  A smart, local-first bookmark organizer. Rules-first auto-sorting, optional AI,<br>
  and powerful search — with zero server involved.
</p>

<!-- Screenshot or GIF of the popup + organized folders goes here -->

## Why Recall?

Your bookmarks pile up and never get organized. Recall takes each one you save, classifies it, and files it into the right Chrome (or Firefox) folder — instantly, using fast built-in rules. AI is only consulted in batches for the tricky ones, and only if you opt in.

Everything stays on your device: no account, no server, no tracking. Classification runs locally (domain maps + keyword scoring), your data lives in the browser, and the AI fallback just sends a category prompt to OpenRouter.

## Contents

- [Features](#features)
- [Install](#install)
- [How bookmarks are categorized](#how-bookmarks-are-categorized)
- [Optional AI setup](#optional-ai-setup)
- [Development & releases](#development--releases)

---

## Features

- **Auto-organizing** — every saved bookmark is fetched, classified, and moved into the right folder in real time
- **Two-phase classification** — instant rules first (no network), AI only for stragglers
- **Full-text search** — BM25 search with fuzzy matching and typo tolerance; `Ctrl/⌘+K` focuses from anywhere
- **Tab grouping** — open multiple bookmarks in Chrome tab groups
- **Duplicate handling** — URL normalization catches the same page saved twice (tracking params, trailing slashes)
- **Trash & restore** — soft-delete with configurable auto-purge (7/30 days or never, max 500 items)
- **Import/Export** — JSON, CSV, and Chrome HTML formats
- **Custom rules** — add your own domain → category mappings in Settings

## Install

### From a release

Grab the zip for your browser from [Releases](https://github.com/aayushmehta25466/Recall/releases), unzip it, then load it:

- **Chrome / Opera:** open `chrome://extensions/` → enable **Developer mode** → **Load unpacked** → select the unzipped folder
- **Firefox** (140+): open `about:debugging` → **This Firefox** → **Load Temporary Add-on** → pick the unzipped `manifest.json`. It lives in Firefox's native sidebar and reopens via the sidebar button. For a permanent install, AMO requires a signed build.

### From source

```bash
git clone https://github.com/aayushmehta25466/Recall.git
cd Recall
npm install
npm run build          # dist/chromium/
npm run build:firefox  # dist/firefox/ (optional)
```

Then load `dist/chromium/` via the Chrome steps above.

### First run

On install, Recall runs an initial organize pass and builds its search index. Click the toolbar icon to open the popup (or `Ctrl/⌘+Shift+K` to toggle the side panel), and hit **Organize All** (the refresh icon in the popup header) to sort your existing bookmarks.

---

## How bookmarks are categorized

1. You save a bookmark — from the browser save dialog, by hand, or via import.
2. Recall fetches the page HTML and extracts metadata (OpenGraph tags, description, keywords).
3. **Phase 1 — instant rules** (fast, no AI, no network):
   - Domain mappings (`github.com` → Development, `youtube.com` → Entertainment, …)
   - Keyword scoring across title, description, and URL
   - Your custom domain mappings
4. A match moves the bookmark into its folder immediately. No match files it under `Engine Organized / Uncategorized` so it never stays loose in your tree.
5. **Phase 2 — AI** (only if you enable it): unmatched bookmarks go into a batch queue; every 15 are sent to OpenRouter with the fixed taxonomy prompt, then filed.

### Where your bookmarks live

Bookmarks are organized under one `Engine Organized` folder on the bookmarks bar:

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

Everything maps to a fixed, hierarchical taxonomy — categories have groups, groups have leaves, and the engine always assigns a full path, never inventing labels:

```
Development        Web (Frontend, Backend, API, Docs) · Mobile (iOS, Android) ·
                   DevOps & Cloud (DevOps, Cloud, Security) · Data & AI (DB, AI, ML, LLM, Robotics) ·
                   Languages & Tools
Learning           Courses, Tutorials, Videos, Blogs, Books, Cheat Sheets, Papers
Business           SaaS, Marketing, Finance, Legal, Startups, Product Management
Design             UI/UX, Typography, Colors, Icons, Inspiration, Tools
Productivity       Tasks, Notes, Calendars, Collaboration
Entertainment      Gaming, Movies, Music, Streaming, Hobbies, Humor
News & Media       Tech News, World News, Magazines, Newsletters, Podcasts
Shopping           Electronics, Clothing, Home, Books, Software, Subscriptions
Personal           Travel, Health, Recipes, Finances, Fitness, Vehicles
```

### Search

Search runs on a BM25 index (MiniSearch). Save a query and it's remembered — the last 20 show up as a history dropdown next time. Typos still match thanks to 20% fuzzy tolerance, and titles get 2x weight over tags and keywords.

---

## Optional AI setup

Recall is fully usable with zero AI — the rules engine handles most domains locally. An OpenRouter key only matters for the leftovers.

1. Create a free key at [openrouter.ai](https://openrouter.ai/) (Keys → Create Key)
2. Open Recall's **Settings** gear
3. Paste the key under **OpenRouter API Key**
4. Pick a model (default: Gemini 2.5 Flash Lite — fast and free)
5. Turn on **Auto-AI categorize** so unmatched saves join the batch queue, or click **Categorize with AI** on the Home tab for a manual pass

| Model | Speed | Cost |
|---|---|---|
| Gemini 2.5 Flash Lite *(default)* | Fast | Free tier |
| Gemini 2.5 Flash | Fast | Free tier |
| Gemini 3 Flash | Fast | Free tier |
| DeepSeek V3.1 Terminus | Medium | Free tier |
| Llama 4 Scout | Medium | Free tier |
| ChatGPT-4o Mini | Medium | Paid |
| GPT-5 Nano | Medium | Paid |
| Grok 4.1 Fast | Fast | Paid |
| GPT-OSS 120B | Slow | Free tier |

Note: bookmarks matched by domain mappings or keyword rules never touch the network. AI is a last resort, not the main path.

---

## Development & releases

```bash
npm run dev           # Extension.js dev server (hot reload)
npm test              # Jest test suite
npm run build         # Production build → dist/chromium
npm run build:chrome  # → dist/chrome
npm run build:firefox # → dist/firefox
npm run build:opera   # → dist/opera
npm run build:all     # Chrome + Firefox + Opera, zipped
```

### Architecture

```
extension/
├── popup/            # Search popup UI (520×620)
├── sidepanel/        # Side panel / Firefox sidebar UI
├── options/          # Settings, home dashboard, trash, rules, import/export
└── background/       # Service worker — bookmark events, sync, AI batches, moves

core/
├── ai-classifier/    # OpenRouter classification + batch queue
├── taxonomy/         # Category tree, domain mappings, keyword rules
├── search-index/     # MiniSearch (BM25) full-text index
├── folder-manager/   # Bookmark folder creation, moves, retry queue
├── sync-engine/      # Bulk sync + reconciliation against the Chrome tree
├── metadata-extractor/  # OG/meta tag extraction + content-type inference
└── duplicate-detector/  # URL normalization + duplicate checks

database/
└── indexeddb/        # IndexedDB storage layer (idb)

shared/
├── platform.js       # Cross-browser API shim (Chromium / Firefox)
├── settings.js       # Defaults + sync storage
└── types/            # Data models
```

### Tech stack

Manifest V3 · Extension.js (build) · Tailwind CSS v4 · IndexedDB via `idb` · MiniSearch · Jest · ESM throughout

### Releases

GitHub Actions does the heavy lifting:

- **On every PR** — builds all targets and runs the test suite
- **On `v*` tag push** — tests, builds Chrome/Firefox/Opera, syncs the tag version into each manifest, zips, and creates the GitHub Release

```bash
npm version patch     # 2.0.1 → 2.0.2 (bumps package.json + lockfile)
                      # then manually sync manifest.json to match

git push --follow-tags  # main + tag → release workflow
```

---

<p align="center">
  <b>Recall</b> is open source under the <a href="LICENSE">Apache-2.0</a> license.
</p>
