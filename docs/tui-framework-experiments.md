# TUI framework experiments

This branch keeps the existing blessed/react-blessed frontend and adds three complete experimental frontends. The TypeScript frontends share the same Flag Hack API client and game input semantics; the Go/Charmbracelet frontend mirrors the same HTTP API contract and controls.

## Research sources

- Ink GitHub/npm documentation: React renderer, Yoga flexbox layout, mature project history, high adoption.
- terminal-kit GitHub/npm documentation: Node terminal toolkit with keyboard input, cursor positioning, fullscreen/screen-buffer primitives, and no ncurses dependency.
- Charmbracelet Bubble Tea/Lip Gloss documentation: mature Go TUI framework and styling libraries used for full-screen terminal apps.
- OpenTUI documentation/GitHub: TypeScript bindings over a native Zig core with React/Solid integration.
- Smaller/newer alternatives found during research: Glyph, Rezi, TermUI, Melker-style component frameworks, and neo-blessed/blessed forks.

## Selected frameworks

### Ink

- Script: `pnpm run cli:ink`
- Package: `ink@5.2.1`
- Why: mature React terminal renderer, high adoption, active maintenance, and a component model close to the existing React-based CLI.
- Tradeoff: newest Ink requires React 19; this branch pins Ink 5 so it can coexist with the existing `react-blessed` React 18 peer constraint.

### terminal-kit

- Scripts: `pnpm run cli:terminal-kit` and `pnpm run cli:termkit`
- Package: `terminal-kit@3.1.2`
- Why: mature Node terminal toolkit with fullscreen rendering and keyboard input, no ncurses dependency, and a long-lived package history.
- Tradeoff: imperative rather than React-like; useful as a control experiment for how much framework machinery Flag Hack actually needs.

### Charmbracelet Bubble Tea / Lip Gloss

- Scripts: `pnpm run cli:charm` and `pnpm run cli:charmbracelet`
- Test script: `pnpm run test:charm`
- Go module: `packages/cli/charm`
- Why: popular, actively maintained Go TUI ecosystem with a clear Elm-style update loop and first-class terminal styling via Lip Gloss.
- Tradeoff: this is a cross-language experiment. It cannot share TypeScript helpers directly, so it mirrors the HTTP API and TUI control semantics in Go.

## Discarded for now

### OpenTUI

- Why considered: popular newer TypeScript/Zig TUI stack with React/Solid support and production use in opencode.
- Why not implemented in this branch: native Zig core and rapidly moving API add install/runtime risk for a quick replacement experiment. Revisit once the project wants a high-performance native renderer and can spend time on platform packaging.

### Glyph / Rezi / TermUI / Melker-style newer projects

- Why considered: TypeScript TUI alternatives with React-like or component-style APIs.
- Why not implemented in this branch: low adoption or young project history compared with Ink and terminal-kit. They may become interesting later, but they are not yet strong enough replacement candidates for this repository.

### neo-blessed / blessed forks

- Why not implemented: they stay in the blessed family and do not answer the replacement question.

## Feature parity target

The experimental frontends implement the core blessed CLI behavior:

- world rendering and inventory display
- NetHack movement keys: `h/j/k/l/y/u/b/n`, Shift-direction, Ctrl-direction, `g`/`G`, `m`/`M`
- rest with `.`
- travel mode with `_`
- pickup with `,`
- multidrop with `d`
- extended `#quit`
- cancellation of active automovement on new input

The popup UI is intentionally simple: `,` marks all, `space` submits, and `q`/`r`/`Esc` cancels, matching the currently implemented blessed popup controls.
