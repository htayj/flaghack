# @flaghack/server

`@flaghack/server` is the private Flag Hack HTTP server package and the
current home for the in-process game runtime. It connects the shared
domain contract to Effect Platform HTTP handlers and owns the live game
state until narrower runtime/domain refactors land.

## Current responsibilities

- `src/Api.ts` exports `ApiLive`, wiring `GameApi` endpoints to the
  repository service.
- `src/GameRepository.ts` exposes `GameRepository`, the Effect service
  used by handlers to read logs, world state, inventory, pickup data,
  and player actions.
- `src/server.ts` composes the Node HTTP server layer with CORS,
  `HttpMiddleware.logger`, configuration, `ApiLive`, and
  `GameRepository.Default`.
- The current in-process game loop, state/log storage, world generation,
  action handling, and AI planning live under `src/gameloop.ts`,
  `src/gamestate.ts`, `src/log.ts`, `src/world*.ts`, `src/actions.ts`,
  and `src/ai/`.

## Validation and workflow notes

Read the root `AGENTS.md` before changing package behavior, and use
`docs/testing-gates.md` to choose focused server validation. Server work
should preserve the shared `GameApi` contract consumed by the CLI and web
clients.

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
