<p align="center">
  <a href="README.md"><b>Readme</b></a> ·
  <a href="CONTRIBUTING.md">Contributing</a> ·
  <a href="LICENSE">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-3.0.0-blue" alt="Version 3.0.0">
  <img src="https://img.shields.io/badge/license-Apache--2.0-green" alt="License: Apache-2.0">
  <img src="https://img.shields.io/badge/manifest-V3-orange" alt="Manifest V3">
  <img src="https://img.shields.io/badge/chrome%20·%20firefox%20·%20opera-supported-success" alt="Chrome, Firefox, Opera">
</p>

<h1 align="center">Recall</h1>

<p align="center">
  A smart, local-first bookmark organizer. Rules-first auto-sorting with your own<br>
  rule set, manual review, optional AI, and powerful search — zero server involved.
</p>

<!-- Screenshot or GIF of the popup + organized folders goes here -->

## Why Recall?

Your bookmarks pile up and never get organized. Recall takes each one you save, classifies it, and files it into the right Chrome (or Firefox) folder — instantly, using fast built-in rules. AI is only consulted in batches for the tricky ones, and only if you opt in.

Everything stays on your device: no account, no server, no tracking. Classification runs locally (domain maps + keyword scoring), your data lives in the browser, and the AI fallback just sends a category prompt to OpenRouter.

## Contents

- [Features](#features)
- [Install](#install)
- [How bookmarks are categorized](#how-bookmarks-are-categorized)
- [Custom rules](#custom-rules)
- [Manual review](#manual-review)
- [Optional AI setup](#optional-ai-setup)
- [Development & releases](#development--releases)

---

## Features

- **Auto-organizing** — every saved bookmark is fetched, classified, and moved into the right folder in real time — including bookmarks added with the browser's own "Bookmark this page" bubble
- **Custom rule set** — build ordered rules that match domain, URL, title, description, keywords, tags, content type, site name, author, language, or current category, with AND/OR conditions, regex, priorities, custom categories, subcategories, and tags
- **Manual review** — a Review tab lists everything that couldn't be classified; assign category + subcategory in bulk, tag, open, or trash it
- **Two-phase classification** — your rules and instant built-in rules run first (no network); AI only for stragglers
- **Full-text search** — BM25 search with fuzzy matching and typo tolerance; `Ctrl/⌘+K` focuses from anywhere
- **Tab grouping** — open multiple bookmarks in Chrome tab groups
- **Duplicate handling** — URL normalization catches the same page saved twice (tracking params, trailing slashes)
- **Trash & restore** — soft-delete with configurable auto-purge (7/30 days or never, max 500 items)
- **Import/Export** — JSON, CSV, and Chrome HTML formats
- **Local-first** — everything runs on-device; AI is opt-in and never required

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
npm run build          # dist/chrome/
npm run build:firefox  # dist/firefox/ (optional)
npm run build:opera    # dist/opera/ (optional)
```

Then load `dist/chrome/` via the Chrome steps above.

### First run

On install, Recall runs an initial organize pass and builds its search index. Click the toolbar icon to open the popup (or `Ctrl/⌘+Shift+K` to toggle the side panel), and hit **Organize All** (the refresh icon in the popup header) to sort your existing bookmarks.

---

## How bookmarks are categorized

1. You save a bookmark — from the browser save dialog, by hand, or via import.
2. Recall fetches the page HTML and extracts metadata (OpenGraph tags, description, keywords).
3. **Phase 1 — instant rules** (fast, no AI, no network), in order:
   - **Your custom rules** (see [Custom rules](#custom-rules)), highest priority first
   - Built-in domain mappings (`github.com` → Development, `youtube.com` → Entertainment, …)
   - Keyword scoring across title, description, and URL
   - Legacy domain → category mappings (still supported, importable into rules)
4. A match moves the bookmark into its folder immediately. No match files it under `Engine Organized / Uncategorized` so it never stays loose in your tree — and it appears in [Manual review](#manual-review).
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

## Custom rules

The **Rules** tab is a full rule builder. Rules run before every built-in classifier and before AI, in priority order, and the **first matching rule wins**.

Each rule is a name, a priority, a match mode (`all` = AND, `any` = OR), one or more conditions, and an action:

| Field | Operators | Example |
|---|---|---|
| Domain | equals, ends with, contains, regex | `ends with react.dev` |
| URL | contains, starts with, regex | `regex ^https://docs\.` |
| Title | equals, contains, regex | `contains tutorial` |
| Description | equals, contains, regex | `contains roadmap` |
| Keywords | includes any / all | `includes all react, hooks` |
| Tags | includes any / all | `includes any frontend` |
| Content type | equals, contains | `equals Documentation` |
| Site name | equals, contains, regex | `equals Medium` |
| Author | equals, contains, regex | `contains Jane` |
| Language | equals | `equals en` |
| Current category | equals | `equals Uncategorized` |

An action assigns a **category**, an optional **subcategory**, and up to five **tags**. Categories can be built-in or your own custom name (folder names are sanitized so a `/` becomes `-`); subcategories can be a taxonomy path or free text. Rules can be reordered up/down (that is the priority), toggled on/off, edited, and deleted, up to 50 per ruleset.

Two things worth knowing:

- **Apply to existing bookmarks** re-runs the whole ruleset over your library: matching records are re-categorized, re-tagged, and moved into the matching native folder. It never clears a category and never assigns `Uncategorized`.
- **Legacy domain mappings** are still honored (after your rules) and can be imported into the new rule format with one click from the Rules tab.

The engine is pure and shared by the service worker, options page, and tests (`core/taxonomy/ruleEngine.js`), so on-save classification, bulk apply, and the UI all use the same evaluation.

## Manual review

Anything the rules can't classify is still filed under `Engine Organized / Uncategorized` — never left loose — and listed in the **Review** tab. There you can:

- select one or many bookmarks,
- pick a **category** and **subcategory** and hit **Assign** (moves the native bookmark into that folder and records the manual override),
- add tags, open in tabs, or move items to Trash,
- or hand the whole queue to AI with **Categorize with AI** (requires an OpenRouter key).

Manual assignments mark `manualOverrides.category` / `manualOverrides.subcategory` on the record, so it's clear the choice was yours.

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
npm test              # Jest suite (16 suites / 145 tests)
npm run build         # Production build → dist/chrome
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
├── options/          # Home, Review, Trash, Rules, Settings, Data, import/export
└── background/       # Service worker — bookmark events, sync, AI batches, moves

core/
├── ai-classifier/    # OpenRouter classification + batch queue
├── taxonomy/         # Category tree, domain mappings, keyword rules,
│                     #   custom rule engine (ruleEngine.js)
├── sync-engine/      # Bulk sync, reconciliation, apply-rules-to-existing
├── search-index/     # MiniSearch (BM25) full-text index
├── folder-manager/   # Bookmark folder creation, moves, retry queue
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
npm version major     # 2.0.1 → 3.0.0 (bumps package.json + lockfile)
                      # then manually sync manifest.json to match

git push --follow-tags  # main + tag → release workflow
```

---

<p align="center">
  <b>Recall</b> is open source under the <a href="LICENSE">Apache-2.0</a> license.
</p>
