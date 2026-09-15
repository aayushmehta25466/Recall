# Extension.js Migration — Recall

## Current Status

- **Version**: Extension.js v4.1.10
- **Primary Target**: Chrome (and all Chromium-based browsers)
- **Build Output**: `dist/chrome/`
- **Tests**: 38 passing

## Migration Summary

### What Changed

| Before | After |
|--------|-------|
| `vite build` | `extension build` |
| `dist/` | `dist/chrome/` |
| `public/manifest.json` | `manifest.json` (project root) |
| Manual Vite config | `extension.config.js` |

### Commands

```bash
npm run dev          # Extension.js dev server (Chrome)
npm run build        # Extension.js production build
npm run build:chrome # Explicit Chrome build
npm run build:firefox # Firefox build (future)
npm run build:edge   # Edge build (same as Chrome)
npm run dev:vite     # Old Vite dev (backup)
npm run build:vite   # Old Vite build (backup)
```

## Configuration

### extension.config.js

```js
/** @type {import('extension').FileConfig} */
export default {
  commands: {
    dev: {
      browser: "chrome",
    },
    build: {
      browser: "chrome",
      zip: true,
      zipFilename: "recall-chrome.zip",
    },
  },
};
```

### manifest.json (Project Root)

Key points:
- Background uses `extension/background/background.js` (not root)
- All paths relative to project root
- Browser-prefixed keys for Firefox support

## Cross-Browser Support

### Chrome/Edge/Brave (Chromium-based)

- Same build output
- `dist/chrome/` works in all Chromium browsers
- Full API support

### Firefox (Planned)

**Differences:**
1. Background: `scripts: ["background.js"]` instead of `service_worker`
2. `chrome.sidePanel` — not supported, needs fallback
3. `chrome.tabGroups` — partial support

**Required Changes:**

1. **Manifest** — add Firefox-specific keys:
```json
{
  "background": {
    "chrome:service_worker": "extension/background/background.js",
    "chrome:type": "module",
    "firefox:scripts": ["extension/background/background.js"]
  }
}
```

2. **Code Fallbacks:**
```js
// Side panel
if (chrome.sidePanel) {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}

// Tab groups
try {
  const groupId = await chrome.tabs.group({ tabIds });
  await chrome.tabGroups.update(groupId, { title: "Group 1" });
} catch (e) {
  // Firefox: tabs open without grouping
}
```

## Build Output Structure

- `npm run build` (config default) → `dist/chromium/` (Chromium-family, Chrome-compatible)
- `npm run build:chrome` (explicit `--browser=chrome`) → `dist/chrome/`
- Both are byte-identical (manifest prefixes resolve per engine family, not vendor) — either loads in Chrome/Edge/Brave. Prefer `dist/chrome/` for releases.

```
dist/chrome/
├── action/
│   ├── index.html
│   ├── index.js
│   └── index.css
├── sidebar/
│   ├── index.html
│   ├── index.js
│   └── index.css
├── options/
│   ├── index.html
│   ├── index.js
│   └── index.css
├── background/
│   └── service_worker.js
├── assets/          # content-hashed bundled assets (self-hosted Nunito woff2)
├── manifest.json
├── favicon.svg
└── icons.svg
```

## Known Issues

1. **Google Fonts** — ✅ Resolved. Nunito (variable, weights 400–800) is
   self-hosted in `extension/fonts/`; the build emits it to `dist/*/assets/`
   and rewrites the CSS URLs. The remote `<link>`/`preconnect` tags were removed
   from all three pages. See the `@font-face` block at the top of
   `extension/popup/popup.css`.
2. **Tailwind v4** — works via Rspack (Extension.js uses Rspack, not Vite)
   - No issues found

## MCP Server Integration

Use `@extension.dev/mcp` for:
- Extension documentation
- Build validation
- Cross-browser compatibility checks
- Bundle analysis

## Next Steps

1. Test Chrome build in browser
2. Add Firefox manifest keys
3. Add API fallbacks for Firefox
4. Test Firefox build
5. Update CI/CD for multi-browser builds
