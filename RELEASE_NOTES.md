Auto-organize your bookmarks with fast local rules, with AI as an opt-in fallback.
This is the cross-browser release: **Chrome, Edge, Opera and Firefox** from one source.

## Highlights

### AI on save — now batched, so it costs far fewer tokens

- With **Automatically categorize with AI** on, a new bookmark the fast rules can't classify is
  handed to the **batch** workflow instead of making its own API call.
- Requests now carry **15 URLs each**, so the large taxonomy prompt is paid once per batch rather
  than once per bookmark — roughly **15× fewer prompt tokens** for the same work.
- Debounced 4 s (a burst of saves costs one run), serialized, and skipped while a sync is running.
  It also clears anything already sitting in `Uncategorized`.
- Every skip explains itself in the console: setting off / no API key / syncing / nothing to do /
  another batch already running.

### One UI wherever it opens

- The toolbar popup and the side panel are now **the same surface** — the popup gains the stats
  line, the category chip rail, `Select all`, and the full icon toolbar.
- The popup lists your whole library on open instead of "start typing".

### A sturdier bookmark lifecycle

- Already-organized bookmarks are never re-fetched, re-classified or re-moved — sync is idempotent.
- Failed native moves retry immediately, then persist to a durable retry queue.
- Deleting a folder now trashes its contents; **Restore recreates the bookmark** in its category
  folder.
- Trashing from the extension removes the native bookmark too, so Trash and Restore are symmetric.
- Legacy records missing `isTrashed` are migrated (DB v4), and a newer database no longer bricks the
  worker.

### Polish

- **Self-hosted Nunito** — no remote font, so MV3's content security policy can't drop it.
- Narrower settings sidebar, denser side panel, thin horizontal scrollbar on the chip rail.
- Settings are toggle switches, and the new **"Automatically categorize with AI"** defaults to
  **off** — AI stays opt-in.
- The Review tab's *Categorize with AI* button is disabled when there's nothing to do.

## Browser support

| Browser | Artifact | Notes |
|---|---|---|
| Chrome | `recall-VERSION-chrome.zip` | — |
| Edge / Brave | same Chromium build | — |
| Opera | `recall-VERSION-opera.zip` | — |
| **Firefox 140+** | `recall-VERSION-firefox.zip` | **New in this release.** Uses Firefox's native sidebar. Requires **140+** (tab groups need 139, the built-in data-consent experience needs 140). |

**Firefox data handling:** the add-on declares *no required data collection*. Bookmark metadata
(url, title, description, keywords) is sent to OpenRouter **only** if you add an API key and enable
AI features yourself.

## Install

1. Download the zip for your browser from the assets below and unzip it.
2. **Chrome / Edge / Opera** — open `chrome://extensions`, enable **Developer mode**, click
   **Load unpacked**, and select the unzipped folder.
3. **Firefox** — open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on**, and
   pick `manifest.json` inside the unzipped folder.

After installing, click the Recall icon to open the panel, and use **Organize All** to classify your
existing bookmarks.
