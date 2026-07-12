# @flaghack/domain

`@flaghack/domain` owns the shared Flag Hack API contract and data
shapes used by the server, CLI, and web packages. It defines the
wire-level Effect schemas and presentation helpers; it does not own the
full game engine or in-process runtime behavior.

## Current responsibilities

- `src/GameApi.ts` exports `GameApi`, the Effect HTTP API shared by all
  clients and the server, including setup, lifecycle, combined client-state,
  and streamed client-state endpoints.
- `src/GameStream.ts` owns the `/client-state/stream` path, revisioned SSE
  event schema, update sources, terminal markers, JSON decoding, and the
  monotonic revision-acceptance helper.
- `src/schemas.ts` defines shared `World`, `Action`, `GameState`, item,
  creature, terrain, door/open-close, position, inventory, and combined
  `ClientState` contracts. Every creature carries the standard attributes.
- `src/display.ts` provides the display tile mapping from shared entity
  shapes to character/color metadata for terminal and browser renderers.
- `src/stats.ts` holds shared stat, state, property, status-effect schemas,
  standard creature attributes, 3d6 attribute rolling, and d20-under checks.
- `src/creatureCapabilities.ts` defines centralized creature tags and cheap
  NetHack-like capability bitmask checks for brains, eyes, hands, humanoids,
  Kops, egregores, and mindless creatures.

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
task-graph/subagent runtime output, and editor backup files such as `*~`,
`#*#`, and `.#*`.
