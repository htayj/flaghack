# TUI framework experiments

This branch keeps the existing blessed/react-blessed frontend as an explicit legacy fallback, but the active/default terminal UI is now the Go Charmbracelet Bubble Tea/Lip Gloss frontend. The earlier Ink and terminal-kit implementations remain available as experiments; production-style launch and tmux validation use Charmbracelet.

## Research sources

- Ink GitHub/npm documentation: React renderer, Yoga flexbox layout, mature project history, high adoption.
- terminal-kit GitHub/npm documentation: Node terminal toolkit with keyboard input, cursor positioning, fullscreen/screen-buffer primitives, and no ncurses dependency.
- Charmbracelet Bubble Tea/Lip Gloss documentation: mature Go TUI framework and styling libraries used for full-screen terminal apps.
- OpenTUI documentation/GitHub: TypeScript bindings over a native Zig core with React/Solid integration.
- Smaller/newer alternatives found during research: Glyph, Rezi, TermUI, Melker-style component frameworks, and neo-blessed/blessed forks.

## Cutover decision

Charmbracelet is the selected CLI renderer for this branch. Use `pnpm run cli` for the default Charmbracelet UI, or `pnpm run cli:charm` / `pnpm run cli:charmbracelet` explicitly.

The old blessed/react-blessed frontend is still available through `pnpm run cli:blessed` / `pnpm run cli:tsx` while the cutover settles. Ink and terminal-kit remain comparison experiments, not the default.

## Frameworks evaluated

### Charmbracelet Bubble Tea / Lip Gloss

- Default script: `pnpm run cli`
- Explicit scripts: `pnpm run cli:charm` and `pnpm run cli:charmbracelet`
- Test script: `pnpm run test:charm`
- Go module: `packages/cli/charm`
- Why selected: it produced the best UI fit for Flag Hack, with a clear Elm-style update loop, mature terminal input/rendering behavior, and first-class styling via Lip Gloss.
- Tradeoff: this is a cross-language frontend. It cannot share TypeScript helpers directly, so it mirrors the HTTP API and TUI control semantics in Go.

### Ink

- Script: `pnpm run cli:ink`
- Package: `ink@5.2.1`
- Why considered: mature React terminal renderer, high adoption, active maintenance, and a component model close to the existing React-based CLI.
- Why not selected: the UI fit was less compelling than Charmbracelet, and Ink keeps the project in the React terminal-rendering tradeoff space that motivated the replacement experiment.

### terminal-kit

- Scripts: `pnpm run cli:terminal-kit` and `pnpm run cli:termkit`
- Package: `terminal-kit@3.1.2`
- Why considered: mature Node terminal toolkit with fullscreen rendering and keyboard input, no ncurses dependency, and a long-lived package history.
- Why not selected: imperative rendering was useful as a control experiment, but the resulting UI and update model were less attractive than Bubble Tea for the main client.

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

The Charmbracelet frontend implements the core CLI behavior:

- world rendering and inventory display
- a top event log plus a bottom NetHack-style status box with player name, placeholder stats/health, and dungeon level
- NetHack movement keys: `h/j/k/l/y/u/b/n`, Shift-direction, Ctrl-direction, `g`/`G`, `m`/`M`
- rest with `.`
- travel mode with `_`
- pickup with `,`
- multidrop with `d`
- extended `#quit`
- cancellation of active automovement on new input

The popup UI is intentionally simple: `,` marks all, `space` submits, and `q`/`r`/`Esc` cancels.
