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
  `src/ai/`. `src/sounds.ts` advances deterministic, turn-based dungeon
  atmosphere and appends bounded gameplay events for the client message
  area. The campground temple's down stairs lazily generate and preserve the
  first dungeon level, a seeded, corridor-only maze with three hippies at
  tunnel dead ends. Nearby hippies speak once, while occasional grumbling,
  talking, and laughter echo through the tunnels. Deeper BSP levels contain
  rooms and corridors. The surface generator consumes the stable catalog in
  `src/campground.ts`: 24 uniquely addressed camps span the outer, middle,
  and inner roads with camp-specific structures, props, residents, and cooler
  inventories. An arrival gate, directory, water station, greeter, and
  lantern-marked road establish a visible route through the effigy to the
  temple. The generators and atmosphere use Effect `Random` with deterministic
  seeds at their runtime boundaries.

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

## Campground runtime

The campground implementation is split by responsibility:

- `src/campground.ts` is the stable content catalog for camp identities,
  addresses, structures, inventories, resident mixes, and flavor text.
- `src/campgroundNavigation.ts` derives discoverable places and computes
  road-preferring routes from authoritative generated terrain. Landmark travel
  accepts only personally discovered destinations and advances one legal step
  at a time.
- `src/campgroundState.ts` hydrates deterministic placements, NPC assignments,
  discovery, persistent heavy-rain weather, and hidden idempotence bookkeeping.
  Save/restore preserves this state, but `campgroundViewForState` projects only
  the current address, discovered landmarks, a discovered host's active public
  gathering, and surface weather while the player is on level zero.
- `src/campgroundActions.ts` owns directional talk and landmark-travel actions.
  `src/campgroundProgress.ts` reconciles keyed item ownership and cryptic social
  changes. The missing-flag phases and favor records are server-only safety
  state: there is deliberately no objective, quest log, completion banner, or
  prescribed story destination in `ClientState` or Charm.
- `src/campgroundAtmosphere.ts` schedules once-only discoveries, local surface
  ambience, and rain-aware meal/workshop/dance announcements. Heavy rain uses
  frequent deterministic outdoor lines or sheltered canvas/arrival-gate lines;
  every ambient message is noninterrupting and the surface emits at most one
  message per turn. `src/sounds.ts` increments the world turn once and
  dispatches to surface atmosphere on level zero or tunnel dialogue and
  ambience on level one. Both append through `src/gameplayEvents.ts`, retaining
  bounded monotonic message history.

Fresh games place the player naked and inventory-free on the authored mud
puddle beside the road. Confirming setup appends exactly one semantic arrival
narration: the player wakes face down in mud, hears the rain, and remembers
nothing. It states no quest or objective. Charm presents that event as a
blocking, dismissible opening pane. Restore removes only the retained arrival
event before publishing a new client snapshot, while preserving all other
event history and the monotonic next-event ID, so a reconnect cannot replay
the opening prose. World generation places at least 90 percent of the surface
population beneath tents or roadside awnings during the storm, leaving only a
few travelers and patrols exposed.

The temple stairs lazily merge the persistent first dungeon into the live
world. Its return stairs, exact dust-caked flag, tunnel-hippie greetings,
surface assignments, favor item keys, discovered places, public-event timers,
and atmosphere cooldowns all survive save/restore. None of the hidden item
keys, story phases, or undiscovered coordinates are included in the client
campground projection.

## Validation and workflow notes

Read the root `AGENTS.md` before changing package behavior, and use
`docs/testing-gates.md` to choose focused server validation. Server work
should preserve the shared `GameApi` contract consumed by the Charm client.

Run `pnpm run serve` from the repository root for development. Nodemon watches
the server and shared domain TypeScript sources, waits 200 milliseconds to
coalesce related file writes, then gracefully restarts the server. The
`SIGUSR2` restart path runs the normal shutdown autosave so the live game is
available again after the reload.

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
