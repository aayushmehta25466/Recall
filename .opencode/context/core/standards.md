# Coding Standards — Recall

## Module System

- **ESM everywhere**: `import`/`export`, no `require()`
- **File extensions required**: `import { foo } from './bar.js'`
- **`"type": "module"`** in package.json

## Naming Conventions

- **Files**: `kebab-case.js` (e.g., `batchCategorizer.js`)
- **Functions**: `camelCase` (e.g., `getTargetFolderId`)
- **Constants**: `UPPER_SNAKE_CASE` for true constants, `camelCase` for config objects
- **Classes**: Not used — factory functions preferred

## Data Models

Factory functions, not classes:
```js
export function createBookmark(data) {
  return {
    url: data.url,
    title: data.title || '',
    category: data.category || 'Uncategorized',
    // ... defaults
  };
}
```

## Styling

- **Tailwind CSS v4** — utility classes only
- **Claymorphism theme** — defined in `shared/ui.js`
- **No inline styles** — use Tailwind classes
- **Shared class constants** — `BTN`, `CARD`, `BADGE` from `shared/ui.js`

## Error Handling

- Try/catch around async operations
- `console.error` for failures, don't throw (graceful degradation)
- Return null/empty on failure, not exceptions

## Chrome Extension Patterns

- **Message passing**: `chrome.runtime.sendMessage` / `onMessage`
- **Background**: Service worker, no DOM access
- **Storage**: `chrome.storage.sync` for settings, IndexedDB for data
- **Bookmarks API**: `chrome.bookmarks.*` for Chrome folder management

## Testing

- Jest with `--experimental-vm-modules`
- Mock Chrome APIs in `tests/setup.js`
- Test file naming: `*.test.js` in `tests/` directory
- 38 tests currently passing

## Comments

- Minimal, high-signal only
- `ponytail:` prefix for intentional simplifications
- No JSDoc on every function — only complex logic
