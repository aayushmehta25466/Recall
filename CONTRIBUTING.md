<p align="center">
  <a href="README.md">Readme</a> · 
  <a href="CONTRIBUTING.md"><b>Contributing</b></a> · 
  <a href="LICENSE">License</a>
</p>

---

# Contributing to Recall

Thanks for your interest in contributing! Here's how to get started.

## Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/your-username/Recall.git
   cd Recall
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Create a branch for your change:
   ```bash
   git checkout -b feat/my-feature
   ```

## Development

```bash
npm run dev            # Extension.js dev target (hot reload, Chrome)
npm run dev:firefox    # Extension.js dev target for Firefox
npm test               # Jest suite (16 suites / 145 tests)
npm run build          # Production build → dist/chrome
npm run build:firefox  # → dist/firefox
npm run build:opera    # → dist/opera
npm run build:all      # all targets, zipped
```

Tests run under Node's ESM loader; the `npm test` script already passes
`--experimental-vm-modules`.

### Project Structure

```
extension/
├── popup/         → Search popup UI
├── sidepanel/     → Side panel / Firefox sidebar UI
├── options/       → Home, Review, Trash, Rules, Settings, Data panels (React)
└── background/    → Service worker: bookmark events, sync, AI batches, moves

core/
├── ai-classifier/     → OpenRouter classification + batch queue
├── taxonomy/          → Categories, domain/keyword rules, custom rule engine
├── sync-engine/       → Bulk sync, reconciliation, apply-rules-to-existing
├── search-index/      → MiniSearch (BM25) index
├── folder-manager/    → Native folder creation, moves, retry queue
├── metadata-extractor/→ OG/meta extraction + content-type inference
└── duplicate-detector/→ URL normalization + duplicate checks

database/          → IndexedDB layer (idb)
shared/            → Platform shim, settings, types, React surfaces, UI tokens
tests/             → Jest tests
```

### Where things live

- **Custom rules** — engine in `core/taxonomy/ruleEngine.js`; editor in
  `extension/options/RulesPanel.jsx`; bulk re-apply in `core/sync-engine/applyRules.js`.
  Rules are pure data in `settings.customRules`, ordered by `priority`.
- **Manual review** — `extension/options/ReviewPanel.jsx`; the queue is
  `getUncategorizedBookmarks()` in `core/ai-classifier/batchCategorizer.js`; assign
  is `assignCategory()` in `extension/options/options.js`.
- **Bookmark lifecycle** — event listeners and the save pipeline in
  `extension/background/background.js`; native moves in `core/folder-manager/manager.js`.

### Key Conventions

- **ESM everywhere** — all imports use `.js` extensions
- **No lint/format configured** — write clean code, match existing style
- **Pure logic goes in `core/`** — no DOM or `chrome` globals where it can be avoided,
  so it stays unit-testable
- **Tests required** — add coverage for new rules/operators and run `npm test` before
  submitting
- **Build must pass** — run `npm run build` to verify
- **Settings changes** — add the default to `shared/settings.js`; existing users are
  merged over the defaults automatically

## Submitting Changes

1. Make sure tests pass:
   ```bash
   npm test
   ```
2. Make sure build works:
   ```bash
   npm run build
   ```
3. Commit your changes with a clear message:
   ```bash
   git commit -m "Add feature: brief description"
   ```
4. Push to your fork:
   ```bash
   git push origin feat/my-feature
   ```
5. Open a Pull Request against `main`

## Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR
- Write a clear description of what changed and why
- Include screenshots for UI changes
- Reference any related issues

## Reporting Issues

- Use GitHub Issues for bug reports and feature requests
- Include steps to reproduce for bugs
- Mention your Chrome version and OS

## License

Recall is licensed under the [Apache License 2.0](LICENSE). Copyright 2026 Aayush Mehta.

By contributing, you agree that your contributions will be licensed under the same
Apache License 2.0, without any additional terms or conditions (see section 5 of the LICENSE).
