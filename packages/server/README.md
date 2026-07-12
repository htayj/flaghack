# @flaghack/server

`@flaghack/server` is the private Flag Hack HTTP server package and the
current home for the in-process game runtime. It connects the shared
domain contract to Effect Platform HTTP handlers and owns the live game
state until narrower runtime/domain refactors land.

## Current responsibilities

- `src/Api.ts` exports `ApiLive`, wiring `GameApi` endpoints to the
  repository service and encoding the initial snapshot plus later updates as
  server-sent events.
- `src/GameRepository.ts` exposes the process-wide game application service.
  It serializes lifecycle mutations, coordinates `GameStateStore`,
  `GamePersistence`, and `GameUpdateHub`, and publishes authoritative state
  after actions, setup, save, restore, and quit.
- `src/GamePersistence.ts` owns atomic mode-`0600` file saves, restore and
  consume semantics, corrupt-save removal, and the narrow legacy migration
  that supplies missing creature attributes.
- `src/GameUpdateHub.ts` owns monotonic stream revisions, replaying PubSub
  updates, terminal markers, and SSE event encoding.
- `src/server.ts` composes the Node HTTP server layer with CORS,
  `HttpMiddleware.logger`, configuration, persistence, `ApiLive`, and the
  repository/update services.
- The current in-process game loop, state/log storage, world generation,
  action handling, and AI planning live under `src/gameloop.ts`,
  `src/GameStateStore.ts`, `src/gamestate.ts`, `src/log.ts`,
  `src/keyGenerator.ts`, `src/world*.ts`, `src/actions.ts`, and
  `src/ai/`. BSP level generation uses Effect `Random` plus the
  deterministic counter key generator at its runtime boundary.

## Persistence and lifecycle

The server currently owns one process-wide game rather than separate user or
session games. `FLAGHACK_SAVE_PATH` overrides the save file; otherwise it is
`$XDG_STATE_HOME/flag-hack/save.json`,
`$HOME/.local/state/flag-hack/save.json`, or `.flaghack/save.json`.

Explicit save writes the live game, emits terminal `save`, and clears live
state. Restore consumes a valid save. Confirmed quit deletes the save, emits
terminal `quit`, and clears live state without saving. Shutdown autosave is
separate. Keep the local mutation intent-header contract in
`@flaghack/domain/GameApi` intact when changing lifecycle handlers.

## Validation and workflow notes

Read the root `AGENTS.md` before changing package behavior, and use
`docs/testing-gates.md` to choose focused server validation. Server work
should preserve the shared `GameApi` contract consumed by the Charm client.

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
