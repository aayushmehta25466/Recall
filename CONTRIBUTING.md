<p align="center">
  <a href="README.md">Readme</a> · 
  <a href="CONTRIBUTING.md"><b>Contributing</b></a> · 
  <a href="LICENSE">License</a>
</p>

---

# Contributing to Bookmarkly

Thanks for your interest in contributing! Here's how to get started.

## Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/your-username/Bookmarkly.git
   cd Bookmarkly
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
npm run dev       # Vite dev server with hot reload
npm run build     # Production build to dist/
npm test          # Run Jest tests
```

### Project Structure

```
extension/        → UI (popup, options, background service worker)
core/             → Business logic (AI classifier, taxonomy, search, sync)
database/         → IndexedDB layer
shared/           → Types, settings, UI constants
tests/            → Jest tests
```

### Key Conventions

- **ESM everywhere** — all imports use `.js` extensions
- **No lint/format configured** — write clean code, match existing style
- **Tests required** — run `npm test` before submitting
- **Build must pass** — run `npm run build` to verify

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

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
