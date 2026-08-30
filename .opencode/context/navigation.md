# Context Navigation — Recall

## Quick Start for Agents

1. Read `core/architecture.md` for tech decisions
2. Read `core/standards.md` for coding patterns
3. Read `core/data-flow.md` for how data moves
4. Read `project/progress.md` for current status

## File Map

| File | Purpose |
|------|---------|
| `core/architecture.md` | Why Manifest V3, IndexedDB, MiniSearch, OpenRouter |
| `core/standards.md` | ESM, Tailwind v4, claymorphism, factory functions |
| `core/data-flow.md` | Bookmark creation → AI classify → IndexedDB → Chrome folders |
| `project/progress.md` | v1.0.0 milestones, what's done, what's next |
| `project/decisions.md` | Key architectural decisions and rationale |

## Key Facts

- **Language**: JavaScript (ESM everywhere, `"type": "module"`)
- **Build**: Vite 8, multi-entry (popup, sidepanel, options, background)
- **UI**: Tailwind CSS v4 via `@tailwindcss/vite` plugin
- **Storage**: IndexedDB via `idb` library
- **Search**: MiniSearch (BM25 full-text)
- **AI**: OpenRouter API, Gemini 2.5 Flash Lite default
- **Tests**: Jest with `--experimental-vm-modules`
- **No linting**: No ESLint/Prettier configured
