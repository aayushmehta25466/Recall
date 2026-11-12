# Recall 3.0 — the rule set release

A major release that puts **you** in charge of classification: a full custom rule
builder, a manual review queue, and a rebuilt React UI. Auto-organize is also
sturdier than ever — it now survives the browser's own bookmark dialog and
service-worker restarts.

---

## Highlights

### Custom rule set — classify bookmarks exactly how you want

The new **Rules** tab is a real rule builder, not a single domain → category field.

- **Match on** domain, URL, title, description, keywords, tags, content type,
  site name, author, language, or current category.
- **Operators**: equals, contains, starts with, ends with, regex, includes any of,
  includes all of.
- **Combine conditions** with **all** (AND) or **any** (OR).
- **Priorities** decide order — the first matching rule wins. Reorder with ↑/↓,
  toggle rules on/off, edit, and delete; up to 50 rules.
- **Actions** assign a category, an optional subcategory, and up to five tags.
- **Custom categories and subcategories**: use a built-in category or type your
  own name. Folder names are sanitized (a `/` becomes `-`), and custom categories
  appear in every category picker in the extension.
- **Apply to existing bookmarks**: re-run the ruleset over your library — matching
  records are re-categorized, re-tagged, and moved into the matching native folder.
  It never clears a category and never assigns `Uncategorized`.
- **Legacy domain mappings still work**: they run after your rules and can be
  imported into the new format with one click.

The engine (`core/taxonomy/ruleEngine.js`) is pure and shared by the service
worker, the options page, and the tests — so on-save classification, bulk apply,
and the UI always agree.

### Manual review added

New **Review** tab for anything the rules couldn't classify:

- Lists every `Uncategorized` bookmark (they are still filed under
  `Engine Organized / Uncategorized`, never left loose).
- Assign **category + subcategory** in bulk — the native bookmark is moved into
  that folder and the record is marked as a manual override.
- Add tags, open selections in tabs, or move items to Trash.
- Hand the whole queue to AI with **Categorize with AI** (needs an OpenRouter key).

### Auto-organize now survives the browser's own save flow

- Bookmarks added with the browser's **"Bookmark this page"** bubble are reclaimed
  when the browser moves them to a folder you picked *after* Recall filed them.
  Previously that move quietly undid the organization.
- The reclaim state is now persisted in `storage.session`, so it survives the
  service worker being torn down while the bookmark bubble is open.
- Open **Options**, popup, and side panel surface new bookmarks live via a
  `BOOKMARKS_CHANGED` broadcast — no reload needed.

### UI rebuilt on React 19

- Popup, side panel, and every Options tab are React now, sharing one search
  surface and one set of UI tokens.
- Added the **Review** tab and the **Rules** manager to the sidebar.
- Settings are toggle switches; the AI toggle stays opt-in.
- Fixed the malformed home icon in the side panel header.

---

## Fixes

- **New bookmark not organized after saving from the native dialog** — the
  browser's post-create move is now detected via `bookmarks.onMoved` and the
  bookmark is re-filed.
- **Search index missed a just-saved bookmark on a cold start** — incremental
  index updates made while `buildSearchIndex()` is reading its snapshot are queued
  and applied when the build lands; concurrent builds are coalesced.
- **Manual review wrote malformed override keys** — `manualOverrides` is now stored
  as a proper nested object (`{ category, subcategory }`).
- **Deleted custom categories lingered in pickers** — the custom-category registry
  is derived from the current rule set.
- Assorted reliability work: persisted move retry queue, deletion reconciliation,
  idempotent bulk sync, and a sturdier IndexedDB migration path.

## Upgrade notes

- Version bumped to **3.0.0** (`package.json`, `manifest.json`, lockfile).
- Existing settings are merged over the new defaults, so existing users keep their
  data. Legacy `customDomainMappings` continue to classify and can be imported to
  rules at any time.
- No migration action required; reload the extension after updating.

## Browser support

| Browser | Artifact | Notes |
|---|---|---|
| Chrome | `recall-3.0.0-chrome.zip` | — |
| Edge / Brave | same Chromium build | — |
| Opera | `recall-3.0.0-opera.zip` | — |
| Firefox 140+ | `recall-3.0.0-firefox.zip` | Native sidebar; tab groups need 139, the data-consent experience needs 140 |

**Data handling:** no required data collection. Bookmark metadata is sent to
OpenRouter only if you add an API key and enable AI yourself.

## Install

1. Download the zip for your browser and unzip it.
2. **Chrome / Edge / Opera** — `chrome://extensions` → **Developer mode** →
   **Load unpacked** → select the unzipped folder.
3. **Firefox 140+** — `about:debugging#/runtime/this-firefox` → **Load Temporary
   Add-on** → pick `manifest.json` inside the unzipped folder.

After installing, open Recall and use **Organize All** for existing bookmarks, then
visit **Rules** to start writing rules and **Review** to clean up the leftovers.

## Testing

- `npm test` — 16 suites / 145 tests, including detailed coverage for the rule
  engine (every field/operator, priority ordering, AND/OR, custom categories,
  legacy mappings), apply-to-existing planning, the review queue, the search-index
  race, and the native-save organizer.
- End-to-end verified in Chrome 157 with the built extension: a custom rule
  classified, tagged, and filed a new bookmark; the Review tab assigned an
  uncategorized bookmark and removed it from the queue; **Apply to existing**
  re-filed a bookmark under the new rule.
