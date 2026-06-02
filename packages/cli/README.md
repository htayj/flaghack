# @flaghack/cli

`@flaghack/cli` owns the Flag Hack terminal client and Node HTTP client
runtime. It provides Effect CLI commands and a blessed/react-blessed
terminal renderer that talks to the server through the shared domain
contract.

## Current responsibilities

- `src/Cli.ts` defines the `flag-hack` command tree, including debug
  movement, inventory, and terminal play commands.
- `src/GameClient.ts` implements the Node HTTP client runtime using
  `HttpApiClient` against `GameApi` and the CLI base URL configuration.
- `src/cliBlessed.tsx`, `src/BApp.tsx`, and `src/components/` provide
  the blessed and react-blessed terminal UI.
- `src/components/BPlaying.tsx` maps shared domain state and display
  metadata from `@flaghack/domain` into terminal tiles, while helpers
  such as `src/gameboard.ts` render already-prepared tile text.

## Validation and workflow notes

Read the root `AGENTS.md` before changing package behavior, and use
`docs/testing-gates.md` to choose focused CLI validation. Keep CLI code on
the client side of the shared `GameApi` contract; server runtime behavior
belongs in `@flaghack/server`.

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
