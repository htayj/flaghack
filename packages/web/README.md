# @flaghack/web

`@flaghack/web` owns the Flag Hack React/Vite browser client and browser
HTTP runtime. It renders the game in the DOM while using the
`shared domain contract` against the server.

## Current responsibilities

- `src/GameClient.ts` implements the browser HTTP runtime with
  `HttpApiClient`, `BrowserHttpClient`, `ManagedRuntime`, and `GameApi`.
- `src/App.tsx`, `src/main.tsx`, `src/Playing.tsx`, and related
  components form the React/Vite DOM renderer.
- `src/GameStateStream.ts` adapts browser `EventSource` to the shared
  revisioned SSE schema, decodes events, rejects stale revisions, and closes
  subscriptions on teardown.
- `src/Playing.tsx` owns streamed world/inventory state, lifecycle UI state,
  movement/door/pickup input, and popup state. It applies authoritative
  streamed snapshots and falls back to separate world and inventory HTTP
  refreshes when streaming is unavailable, then passes view props to
  `src/GameBoard.tsx`, `src/Messages.tsx`, and inventory/popup components.
- `src/Inventory.tsx` and popup components render inventory and pickup
  views around shared world data.
- `src/config.ts` resolves browser API base URL configuration for the
  client runtime.

The browser HTTP client automatically selects and confirms the current default
`virgin` role rather than presenting role-selection UI. Focus the named game
controls area (it receives initial focus), then use `h/j/k/l/y/u/b/n` to move,
`,` to pick up, `o` or `c` plus a direction for doors, `C-s` or `#save` to
save, and `C-q` or `#quit` for confirmed permanent quit. The page also displays
this help beside the game. Terminal `save`/`quit` events show terminal status
and suppress further input; the board remains at the last nonterminal snapshot.

## Validation and workflow notes

Read the root `AGENTS.md` before changing package behavior, and use
`docs/testing-gates.md` to choose focused web validation. Keep web code on
the browser-client side of the shared `GameApi` contract; server runtime
behavior belongs in `@flaghack/server`.

## Audit and generated-file policy

This README covers ownership items tracked in
`ARCHITECTURE_OPPORTUNITIES.md`, `BUILD_SYSTEM_OPPORTUNITIES.md`,
`EFFECT_TS_OPPORTUNITIES.md`, and
`FP_IMMUTABILITY_OPPORTUNITIES.md`.

Do not hand-edit generated or disposable output. The repository policy
called out in `AGENTS.md` includes `packages/**/build/**`,
`packages/**/dist/**`, `*.d.ts`, `*.d.ts.map`, `*.js.map`, the
generated schema JavaScript under `packages/domain/src/schemas/*.js`,
task-graph/subagent runtime output, and editor backup files such as `*~`,
`#*#`, and `.#*`.
