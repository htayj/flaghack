# @flaghack/domain

`@flaghack/domain` owns the shared Flag Hack API contract and data
shapes used by the server, CLI, and web packages. It defines the
wire-level Effect schemas and presentation helpers; it does not own the
full game engine or in-process runtime behavior.

## Current responsibilities

- `src/GameApi.ts` exports `GameApi`, the Effect HTTP API shared by all
  clients and the server.
- `src/schemas.ts` defines shared `World`, `Action`, `GameState`, item,
  creature, terrain, position, and inventory contracts.
- `src/display.ts` provides the display tile mapping from shared entity
  shapes to character/color metadata for terminal and browser renderers.
- `src/stats.ts` and `src/util.ts` hold small shared domain helpers.

## Validation and workflow notes

Read the root `AGENTS.md` before changing package behavior, and use
`docs/testing-gates.md` to choose the smallest safe validation gate. Keep
domain changes contract-focused so server runtime code remains the place
for the current game loop, state mutation, logging, world generation,
actions, and AI behavior.

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
