# @flaghack/cli

`@flaghack/cli` owns the Flag Hack terminal clients. The default player
UI is the Go Charmbracelet Bubble Tea/Lip Gloss frontend, and the package
also keeps the Node HTTP client runtime plus legacy/experimental terminal
renderers that talk to the server through the shared domain contract.

## Current responsibilities

- `charm/` provides the default Charmbracelet Bubble Tea/Lip Gloss player
  UI. Root `pnpm run cli` and package-local `pnpm run dev` / `pnpm run
  play` launch this frontend.
- `src/Cli.ts` defines the legacy `flag-hack` command tree, including
  debug movement, inventory, and the old blessed play command.
- `src/GameClient.ts` implements the Node HTTP client runtime using
  `HttpApiClient` against `GameApi` and the CLI base URL configuration.
- `src/cliBlessed.tsx`, `src/BApp.tsx`, and `src/components/` provide
  the legacy blessed and react-blessed terminal UI, still available via
  root `pnpm run cli:blessed` / `pnpm run cli:tsx`.
- `src/cliInk.tsx` and `src/cliTerminalKit.ts` are retained comparison
  experiments; they are not the default CLI.

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
