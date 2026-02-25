# Yeno Editor

A desktop-first rich text document editor built with React Router 7 + TypeScript + TailwindCSS, with an optional Tauri desktop shell and WASM module.

## Cursor Cloud specific instructions

### Services

| Service | Command | Port | Notes |
|---------|---------|------|-------|
| Vite Dev Server | `bun run dev` | 5173 | Main web app; auto-reloads on changes |

No external databases or APIs are required. All data is local (IndexedDB in browser, filesystem via Tauri).

### Common commands

See `package.json` scripts. Key ones:

- **Dev server:** `bun run dev`
- **Typecheck:** `bun run typecheck`
- **Build:** `bun run build`
- **E2E tests:** `npx playwright test` (requires Chromium: `npx playwright install chromium`)
- **WASM build (optional):** `bun run wasm:build` (requires `wasm-pack` + Rust toolchain)

### Gotchas

- The project uses **Bun** as its package manager (`bun.lock` is the lockfile). Use `bun install` not `npm install`.
- `@playwright/test` must be installed as a devDependency (added to `package.json`). After `bun install`, you also need `npx playwright install chromium --with-deps` to get the browser binary for E2E tests.
- Typecheck (`bun run typecheck`) will report errors for `~/lib/wasm/pkg/yeno_wasm.js` if the WASM module hasn't been built. This is expected in web-only dev mode — the WASM module is optional.
- The Playwright config (`playwright.config.ts`) uses `bun run dev` as its `webServer` command and auto-starts the dev server if not already running. If you've already started the dev server, Playwright will reuse it.
- The Tauri desktop shell (`bun run tauri:dev`) requires system-level Tauri dependencies and is not needed for web development or testing.
