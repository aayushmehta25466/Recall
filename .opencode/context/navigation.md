# Context Navigation — Recall

## Quick Start for Agents

1. Read `core/architecture.md` for tech decisions
2. Read `core/standards.md` for coding patterns
3. Read `core/data-flow.md` for how data moves
4. Read `project/progress.md` for current status
5. Read `project/extensionjs.md` for Extension.js migration details

## File Map

| File | Purpose |
|------|---------|
| `core/architecture.md` | Why Manifest V3, IndexedDB, MiniSearch, OpenRouter |
| `core/standards.md` | ESM, Tailwind v4, claymorphism, factory functions |
| `core/data-flow.md` | Bookmark creation → AI classify → IndexedDB → Chrome folders |
| `project/progress.md` | v1.0.1 milestones, what's done, what's next |
| `project/decisions.md` | Key architectural decisions and rationale |
| `project/extensionjs.md` | Extension.js migration, cross-browser support, MCP server |

## Key Facts

- **Language**: JavaScript (ESM everywhere, `"type": "module"`)
- **Build**: Extension.js v4.1.10 (cross-browser), Vite 8 (backup)
- **UI**: Tailwind CSS v4 via `@tailwindcss/vite` plugin
- **Storage**: IndexedDB via `idb` library
- **Search**: MiniSearch (BM25 full-text)
- **AI**: OpenRouter API, Gemini 2.5 Flash Lite default
- **Tests**: Jest with `--experimental-vm-modules`
- **No linting**: No ESLint/Prettier configured
- **MCP Server**: Extension.dev MCP for cross-browser extension development

## MCP Server Setup

The project uses `@extension.dev/mcp` for Extension.js documentation and tools.

### Configuration

Located in `opencode.json` (verified working, v10.9.0 — handshake + tools/list OK):
```json
{
  "mcp": {
    "extension-dev": {
      "enabled": true,
      "type": "local",
      "command": ["npx", "-y", "@extension.dev/mcp"]
    }
  }
}
```
(`-y` prevents npx install prompts from hanging the MCP spawn on fresh machines.)

### Available Tools

| Tool | Purpose |
|------|---------|
| `extension_create` | Scaffold new extension projects |
| `extension_build` | Build for specific browsers |
| `extension_dev` | Start dev server with hot reload |
| `extension_analyze` | Analyze built output |
| `extension_manifest_validate` | Validate manifest across browsers |

### When to Use

- Building for Firefox/Edge/Safari
- Validating manifest compatibility
- Debugging cross-browser issues
- Analyzing bundle size

## Context Update Protocol

**After any task completion:**
1. Run ContextScout to discover new/changed files
2. Update relevant context files
3. Commit context changes with task commit

**Context files to update:**
- `project/progress.md` — after feature completion
- `project/decisions.md` — after architectural decisions
- `project/extensionjs.md` — after build/config changes
- `core/standards.md` — after pattern changes

## Browser Support

| Browser | Status | Build Command |
|---------|--------|---------------|
| Chrome | ✅ Primary | `npm run build` |
| Edge | ✅ Same as Chrome | `npm run build` |
| Brave | ✅ Same as Chrome | `npm run build` |
| Firefox | 🔜 Planned | `npm run build:firefox` |
| Safari | 🔜 Future | `npm run build:safari` |
