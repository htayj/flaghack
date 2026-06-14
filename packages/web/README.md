# @flaghack/web

`@flaghack/web` owns the Flag Hack React/Vite browser client and browser
HTTP runtime. It renders the game in the DOM while using the
`shared domain contract` against the server.

## Current responsibilities

- `src/GameClient.ts` implements the browser HTTP runtime with
  `HttpApiClient`, `BrowserHttpClient`, `ManagedRuntime`, and `GameApi`.
- `src/App.tsx`, `src/main.tsx`, `src/Playing.tsx`, and related
  components form the React/Vite DOM renderer.
- `src/Playing.tsx` consumes shared world/action schemas and display tile
  mapping from `@flaghack/domain`, then passes local tile and message
  props to `src/GameBoard.tsx` and `src/Messages.tsx`.
- `src/Inventory.tsx` and popup components render inventory and pickup
  views around shared world data.
- `src/config.ts` resolves browser API base URL configuration for the
  client runtime.

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
and editor backup files such as `*~`, `#*#`, and `.#*`.
