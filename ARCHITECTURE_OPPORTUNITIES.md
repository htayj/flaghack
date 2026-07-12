# General architecture audit

Date: 2026-05-29\
Branch audited: `master`\
Scope: package layout, build/release architecture, domain/application/server boundaries, API/client contracts, UI architecture, testing/tooling/docs/dependency hygiene.

This complements `EFFECT_TS_OPPORTUNITIES.md` and `FP_IMMUTABILITY_OPPORTUNITIES.md`. Some issues appear in all three reports because they are foundational architectural concerns: stale generated artifacts, unclear state ownership, and UI components doing runtime work.

## Architectural north star

A cleaner target shape for this project would be:

- **`domain` / game engine:** pure model, identifiers, invariants, reducer, world generation, domain errors/events.
- **`contracts` / `api-contract`:** HTTP/RPC schemas and DTOs, separate from internal domain storage shape.
- **`application`:** use cases such as “submit player command”, turn orchestration, AI scheduling, state/session ports.
- **`server`:** HTTP server, config, layers, adapters, in-memory/db/file persistence, logging; no game rules hidden here.
- **`client` / `ui-core`:** shared typed API client factory, input-to-command decoding, world-to-view-model projection, popup/selection reducers.
- **`cli` and `web`:** thin platform renderers/adapters around shared client/UI-core behavior.

## Highest-impact roadmap

1. **Unify workspace/build/source-of-truth rules.** Fix the `web` workspace mismatch, source-vs-dist resolution, generated artifact policy, package exports, and emitted import suffixes before deep refactors.
2. **Move actual game rules out of `server`.** The server package currently owns the game engine; make game state transitions, world generation, commands, events, and errors a pure domain/application layer.
3. **Extend explicit game/session/state ownership.** The single-game `GameStateStore`/persistence/update services now make ownership explicit; key them by game/player/session when multi-session support is introduced.
4. **Stabilize API contracts.** Build on revisioned full-state streaming with DTOs, typed errors, revision-bearing commands/stale-command rejection, and mutation responses that return authoritative state/events.
5. **Extract shared client/UI-core.** CLI and web currently duplicate input handling, rendering projection, API wrappers, and popup logic.
6. **Make tooling enforce architecture.** Add curated exports, CI/verify, real tests, format/lint coverage, dependency pinning, and docs explaining package ownership.

## Remediation status (audit-remediation branch)

The findings below remain the original 2026-05-29 `master` audit evidence. This section summarizes later remediation and intentionally does not rewrite the historical evidence.

Post-audit update (verified at `2ba89d6`): `GameStateStore`, file persistence,
a lifecycle semaphore, and `GameUpdateHub` now provide explicit single-game
state ownership, serialized lifecycle mutations, and revisioned authoritative
full-state SSE updates. The remaining architectural gaps are multi-session
identity/ownership, revision-bearing commands and stale-command rejection,
typed API errors, a durable domain-event model, and authoritative mutation
response bodies.

Status terms:

- **Addressed:** this branch has a direct remediation plus targeted tests/gates for the narrow finding.
- **Partial:** risk was reduced or guardrails/tests were added, but the original recommendation is broader.
- **Deferred:** intentionally not completed in this branch; keep the finding open.

Validation note: this docs-only closing slice does not require code changes. Later validation may skip root `pnpm check` if artifact-emission risk is not approved; the generated-file guard, dprint check, and smoke gates remain the safe evidence for this documentation change.

| Status      | Findings / category                                                                                                                                                                               | Remediation evidence                                                                                                                                                                                                                   | Remaining / not claimed                                                                                                                                                                                                                                                             | Validation                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Partial** | 1-4, 7-9, 31-32, 39-44, 48-49: workspace/build/package/export/test/dependency/docs/CI/deploy/flake architecture                                                                                   | Workspace/build scope alignment, fail-closed TypeScript settings, generated guardrails, lint/format/test gates, dependency cleanup, package ownership/testing docs, and web externalization cleanup reduce risk.                       | Source-vs-dist resolution, generated artifact regeneration/codegen lifecycle, curated public exports/package smoke, CLI `dist` release architecture, CI/readiness pipeline, Nix flake checks, web deployment architecture, and publish-hardening beyond current gates are deferred. | `pnpm generated:guard`; `pnpm format:check`; `pnpm check`; unit/perf/API/E2E smoke gates as applicable. |
| **Partial** | 10, 15-19, 25, 36, 45-46: domain/API contracts, trust boundaries, location/identity invariants, mutation results, typed errors, versioning, and presentation leakage                              | Narrow domain schema/action fixes, item collection responses, display exhaustiveness, combined client state, and revisioned authoritative SSE snapshots reduce risk.                                                                   | A separate contract/application package, DTO split, typed API errors/error UI, revision-bearing command/stale-command handling, authoritative mutation response bodies, branded keys, location ADT, world invariants, and full domain/presentation split are deferred.              | Schema/domain/API/display and stream tests plus smoke gates.                                            |
| **Partial** | 11-14, 20-24, 47: game engine ownership, state/session/persistence, repository/game-loop responsibilities, worldgen, ID generation, AI scheduling, logs/events, and side-effectful server exports | `GameStateStore`, `GamePersistence`, lifecycle serialization, `GameUpdateHub`, UUID keys, safer worldgen, creature-only AI planning, and log snapshots/caps provide a real single-game state/persistence/update boundary.              | Moving the engine out of `server`, multiple keyed sessions/actors, revision-bearing commands, a durable domain-event/log architecture, scheduler, general save-version migration, and side-effect-free server export architecture are deferred.                                     | Store/persistence/update-hub/reducer/world/API smoke tests as applicable.                               |
| **Partial** | 5-6, 26-30, 33-35, 37-38: UI runtime ownership, render lifecycle, UI state machine, shared view model/input/client wrappers, config/transport boundaries, accessibility/layout                    | App-scoped runtimes, lifecycle loads, revisioned SSE full-state updates with HTTP fallback, stale-revision rejection, key cleanup, popup/focus fixes, deterministic layering, capped messages, and baseline accessibility reduce risk. | Shared `client`/`ui-core`, complete UI mode/remote-data state machine, revision-bearing commands, supervised runtime/error handling, and a shared layout/view model remain deferred.                                                                                                | CLI/web stream/runtime unit tests and API/E2E smoke gates as applicable.                                |

---

## P0 / blockers

### 1. Workspace source of truth is split around `web`

- **Evidence:** root `package.json:6-8` says all `packages/*` are workspaces; `pnpm-workspace.yaml:1-4` lists only `cli`, `domain`, and `server`; root `tsconfig.json:4-8` references `web`; root `tsconfig.build.json:4-8` omits it; `packages/web/package.json:2` is named `web` while root paths define `@flaghack/web` in `tsconfig.base.json:47-49`.
- **Current architecture smell:** Different tools disagree on whether `web` is a first-class package/app. Recursive pnpm scripts can skip it while TypeScript includes it.
- **Recommended architecture:** Make one workspace source of truth, usually `pnpm-workspace.yaml` with `packages/*`. Rename web to `@flaghack/web` or remove the alias. Decide explicitly whether web participates in root build/test/lint.
- **Rationale:** Prevents unbuilt apps, stale lockfile/import behavior, and unclear ownership.

### 2. Dev/runtime resolution points at different artifacts

- **Evidence:** TS path aliases resolve `@flaghack/*` to source files in `tsconfig.base.json:40-52`; lockfile workspace consumers link to generated `../domain/dist`; `scripts/clean.mjs:4-9` deletes `dist`; server dev runs source with `tsx src/server.ts` in `packages/server/nodemon.json:2-4`.
- **Current architecture smell:** Typechecking sees source, while runtime/package manager may see generated dist. A clean checkout or `pnpm clean` can remove package targets other packages resolve to.
- **Recommended architecture:** Choose one model: source-linked workspaces during development, or build-first dist-linked packages with predev/pretest build guarantees. Avoid mixing source path aliases with dist workspace links.
- **Rationale:** Eliminates stale contract/runtime mismatches.

### 3. Generated artifacts are stale, invalid, and leak into package output

- **Evidence:** `packages/domain/src/schemas/schemas.js:22-25` has `Pos` without `z`, while `packages/domain/src/schemas.ts:46-50` includes `z`; `packages/domain/src/schemas/schemas.js:56` tags `Milk` as `"booze"`, while source uses `"milk"` at `schemas.ts:98`; generated build index is syntactically invalid at `packages/domain/build/esm/index.js:4-9`; dist exports bogus `.d` subpaths in `packages/domain/dist/package.json:42-50`; dist includes editor/source debris such as `packages/domain/dist/src/index.ts~` and `packages/server/dist/src/#creatures.ts#`.
- **Current architecture smell:** No clean generated-artifact boundary; codegen scans/copies generated, ignored, and editor backup files.
- **Recommended architecture:** Keep generated output outside `src`, exclude `**/*.d.ts`, backups, build artifacts, and tests from export generation, and publish via allowlisted `files`/exports or a clean pack step. Add clean-check and `pack --dry-run` CI.
- **Rationale:** Prevents broken package exports and accidental publication of junk/stale code.

### 4. CLI emitted imports can reference files that are not emitted

- **Evidence:** TSX source imports `.jsx` modules in `packages/cli/src/components/BPlaying.tsx:12`, `:14`; emitted ESM preserves those imports in `packages/cli/build/esm/components/BPlaying.js:11-13`; TS emits `.js` files with root `jsx: "react"` in `tsconfig.base.json:25`.
- **Current architecture smell:** Source import suffixes do not match release artifacts.
- **Recommended architecture:** For NodeNext TS packages, use `.js` import specifiers in TS/TSX source, or configure a build that consistently emits `.jsx`. Enforce via lint/import checks.
- **Rationale:** CLI can typecheck/build yet fail at runtime.

### 5. UI components own executable/runtime side effects

- **Evidence:** CLI `BPlaying` imports `MainLive` from the executable entrypoint at `packages/cli/src/components/BPlaying.tsx:10`; `packages/cli/src/bin.ts:46-48` runs the CLI at module top level; `BPlaying` directly provides runtime and calls `Effect.runPromise` at `packages/cli/src/components/BPlaying.tsx:105-111`, `:125-151`, `:158-176`.
- **Current architecture smell:** React UI imports an executable composition root and owns runtime provisioning.
- **Recommended architecture:** Move runtime/layer creation to side-effect-free `runtime.ts`/`layers.ts`; entrypoints wire runtime to platform adapters; UI receives a `GameService` interface via props/context/hooks.
- **Rationale:** Separates composition root from presentation, avoids accidental process startup on import, and enables component tests with fakes.

### 6. Async effects run during render

- **Evidence:** CLI fetches world in component body at `packages/cli/src/components/BPlaying.tsx:105-112`; web does the same at `packages/web/src/Playing.tsx:99-103`; web StrictMode is enabled at `packages/web/src/main.tsx:6-9`.
- **Current architecture smell:** Render path performs network side effects. “Empty world” is used as “not loaded yet”.
- **Recommended architecture:** Create a shared `useGameSession` / controller hook where initial load runs in lifecycle/effect code with loading/error states and cancellation/ignore-on-unmount behavior.
- **Rationale:** React render should be pure. Current code can duplicate requests and update state after unmount.

---

## P1 / high priority

### 7. Public package API is auto-exporting internals

- **Evidence:** packages generate exports from `**/*.ts` in `packages/domain/package.json:31-37`, `packages/server/package.json:40-49`, `packages/cli/package.json:56-65`; generated server exports include internals and test utilities in `packages/server/dist/package.json:91-99`; `tsconfig.base.json:41-52` expects `src/index.js`, but source index files are missing.
- **Current architecture smell:** Internal file layout becomes public contract.
- **Recommended architecture:** Maintain explicit `src/index.ts` entrypoints and curated `exports`. Make `server` private or expose only intentional server entry/API facade; expose CLI binary only; expose domain/contracts intentionally.
- **Rationale:** Enables refactors without breaking consumers and prevents test/scratch modules becoming API.

### 8. CLI `dist` has conflicting meanings

- **Evidence:** CLI publish output is `dist` in `packages/cli/package.json:12-15`; package build uses `build-utils pack-v2` at `packages/cli/package.json:18`; dev/play uses Vite to write `dist/bin.js` at `packages/cli/package.json:25` and `packages/cli/vite.config.js:6-12`.
- **Current architecture smell:** App bundle output and package publish output collide.
- **Recommended architecture:** Use separate outputs, e.g. `bundle/` for Vite executable and `dist/` for package publishing, or choose one build pipeline.
- **Rationale:** Avoids overwrites and non-reproducible release contents.

### 9. Web bundle partially externalizes domain

- **Evidence:** `packages/web/vite.config.ts:7-10` externalizes only `@flaghack/domain/schemas`; web also imports `@flaghack/domain/display`, `@flaghack/domain/GameApi`, and schemas in `packages/web/src/Playing.tsx:1-3` and `packages/web/src/GameClient.ts:3-5`.
- **Current architecture smell:** Browser output may contain both bundled domain internals and a bare external schema import.
- **Recommended architecture:** Either bundle all domain subpaths into the web app, or externalize all `@flaghack/domain/*` with an explicit import-map/runtime contract.
- **Rationale:** Prevents duplicate schema instances and missing browser modules.

### 10. `domain` owns too many architectural concerns

- **Evidence:** core schemas live in `packages/domain/src/schemas.ts`; HTTP API contract imports `@effect/platform` in `packages/domain/src/GameApi.ts:1-3`; display glyph/color mapping lives in `packages/domain/src/display.ts:31-73`; domain package deps include platform/sql at `packages/domain/package.json:26-29`.
- **Current architecture smell:** “Domain” mixes pure model, transport contract, presentation mapping, and unused infrastructure dependencies.
- **Recommended architecture:** Split into sub-boundaries/packages: `model`/schemas/invariants, `api-contract`, and `display`/view projection. Remove unused deps from pure model.
- **Rationale:** Keeps dependency direction clean and reduces transitive weight for clients needing only types/schemas.

### 11. Actual game engine lives in `server`, not domain/application

- **Evidence:** `packages/domain` mostly contains schemas/API/display; server owns entity factories, movement, world generation, AI, and reducers in files such as `packages/server/src/world.ts`, `packages/server/src/actions.ts`, `packages/server/src/ai/ai.ts`, `packages/server/src/items.ts`, and `packages/server/src/entity.ts`.
- **Current architecture smell:** Server package is both game engine and infrastructure.
- **Recommended architecture:** Move pure game rules/engine to domain/application. Keep `server` as HTTP/config/layer/adapters only.
- **Rationale:** Game rules become testable without HTTP/server, reusable by tools/clients/tests, and easier to persist/replay.

### 12. State ownership lacks a keyed session boundary

- **Historical evidence:** a global mutable singleton existed in `packages/server/src/gameloop.ts:47-72`, `:74-76` at the audited commit.
- **Current status:** `GameStateStore`, `GamePersistence`, and `GameUpdateHub` now provide explicit single-game state, file persistence, and update boundaries. One process-global game and hard-coded `"player"` identity still prevent keyed sessions/multiple games.
- **Recommended architecture:** Introduce `GameSession` / `GameStateStore` keyed by game id and player/actor id, with `load`, `save`, and atomic `update` operations. Keep in-memory storage as one infrastructure adapter.
- **Rationale:** Needed for persistence, save/load, multiple games, reconnects, multiplayer, and test isolation.

### 13. `GameRepository` name does not match its responsibilities

- **Evidence:** `packages/server/src/GameRepository.ts:12-39` is an `Effect.Service`, but delegates to imported application/global-state functions and stores nothing.
- **Current architecture smell:** It is an application facade/use-case service named like a persistence repository.
- **Recommended architecture:** Rename to `GameService` / `GameUseCases`, or define a real repository port below it. Keep persistence adapters separate from command handling.
- **Rationale:** Prevents confusion when adding DB/file/event-sourced persistence.

### 14. Game loop/reducer responsibilities are tangled

- **Evidence:** `actPlayerAction` plans AI, appends player action, filters noops, executes actions, logs, and sets state in `packages/server/src/gameloop.ts:95-127`; reducers call `Effect.runSync` in `packages/server/src/actions.ts:52-69`; missing player silently continues at `packages/server/src/gameloop.ts:104-109`.
- **Current architecture smell:** Command validation, AI planning, action resolution, state mutation, logging, and error policy are bundled together.
- **Recommended architecture:** Use a pure reducer such as `reduce(state, command): Result<{ state; events }, DomainError>`. Application layer orchestrates AI, logging, persistence, and side effects around the reducer.
- **Rationale:** Pure reducers are easier to unit test, replay, persist, and reason about.

### 15. API/action trust boundary exposes internal entity objects

- **Evidence:** `pickup` action can carry a full `Entity` in `packages/domain/src/schemas.ts:253-259`; server action handler uses that shape in `packages/server/src/actions.ts:95-97`.
- **Current architecture smell:** External clients submit internal object snapshots instead of intent/ids.
- **Recommended architecture:** Separate `PlayerCommand` DTOs from internal `ResolvedAction`. Commands should carry ids and intent, e.g. `{ _tag: "pickup", itemId }`; server resolves against authoritative state.
- **Rationale:** Avoids stale/forged payloads and keeps API stable if entity model changes.

### 16. Entity location invariant is muddled

- **Evidence:** `Location` is defined as contain-or-position in `packages/domain/src/schemas.ts:55-57`, but `EntityBase` requires key + position + containment simultaneously at `schemas.ts:68-72`; pickup stores contained items at dummy coordinates in `packages/server/src/items.ts:65-68`.
- **Current architecture smell:** Entities are always both “at” and “in”. Contained items carry fake/stale positions.
- **Recommended architecture:** Model location as an explicit component/ADT: `{ _tag: "InWorld", at } | { _tag: "InContainer", containerId }`.
- **Rationale:** Cleaner invariants, simpler persistence, fewer inventory/collision edge cases.

### 17. API exposes raw internal storage shape

- **Evidence:** `getWorld`, `getInventory`, and `getPickupItemsFor` all return `World` in `packages/domain/src/GameApi.ts:12-22`; `World` is a `Schema.HashMap` at `packages/domain/src/schemas.ts:299`; `Entity` is a broad union at `schemas.ts:227`.
- **Current architecture smell:** Wire contract is internal game model. Inventory/pickup endpoints can return terrain/creature-capable schema.
- **Recommended architecture:** Define endpoint-specific DTOs such as `WorldView`, `InventoryView`, `PickupOption[]`, `GameSnapshot`, and command DTOs.
- **Rationale:** Stable DTOs reduce payload size, narrow invalid states, and allow internal model evolution.

### 18. Mutation responses still omit authoritative post-action state

- **Historical evidence:** `doAction` declared no success body and clients manually re-read state at the audited commit.
- **Current status:** the server now publishes authoritative revisioned full `ClientState` after mutations and primary clients subscribe with HTTP fallback. The mutation response itself is still empty, so delivery/error semantics and clients without the stream remain less explicit than a typed `TurnResult`.
- **Recommended architecture:** Make `POST /act` return a `TurnResult` / `GameSnapshot` containing turn/version, changed world/inventory/logs/events, or a server-issued invalidation token. At minimum, centralize post-mutation invalidation in a shared client state layer.
- **Rationale:** Prevents stale UI and duplicated refresh logic.

### 19. No typed API error envelope

- **Evidence:** `packages/domain/src/GameApi.ts:7-27` defines successes but no `addError` schemas; missing player silently skips action in `packages/server/src/gameloop.ts:104-115`; missing pickup target becomes empty `HashMap` at `gameloop.ts:143-156`; clients use `runPromise` without visible error handling.
- **Current architecture smell:** Invalid requests look like valid empty/no-op responses, and clients only see generic transport/parse errors.
- **Recommended architecture:** Define errors such as `PlayerNotFound`, `EntityNotFound`, `InvalidAction`, `StaleTurn`, expose them in the API contract, and require clients to handle them.
- **Rationale:** Typed failures make behavior observable, testable, and recoverable.

### 20. Snapshot freshness is modeled, but command freshness is not

- **Historical evidence:** `World` / `GameState` had no turn/version field and state workflows lacked explicit sequencing at the audited commit.
- **Current status:** `GameUpdateHub` assigns monotonic revisions to authoritative full-state events, clients reject older snapshots, and repository lifecycle work is serialized. Commands still do not carry an expected revision, so the server cannot reject stale concurrent intent explicitly.
- **Recommended architecture:** Include `turn`/`version` in snapshots and command requests; add stale-turn handling; make server updates atomic through a store/transaction.
- **Rationale:** Freshness metadata and atomic transitions prevent lost updates and make caching/invalidation explicit.

### 21. No game/session/actor in the API

- **Evidence:** hard-coded `"player"` in `packages/server/src/GameRepository.ts:29`, `packages/server/src/gamestate.ts:19-22`; clients call `getPickupItemsFor("player")` in `packages/web/src/Playing.tsx:118` and CLI equivalent.
- **Current architecture smell:** All clients mutate the same process-local player and game.
- **Recommended architecture:** Introduce `gameId` and actor/player identity in paths or request context, e.g. `/games/{gameId}/actors/{actorId}/...`.
- **Rationale:** Required for multiple clients, tests, reconnects, save/load, and future auth.

### 22. World generation is server-owned and partly display-sized

- **Evidence:** BSP generation is in `packages/server/src/world.ts`; dimensions are hard-coded at `packages/server/src/world.ts:85-86`; `dlvl` is accepted but walls are generated at z `0` in `world.ts:90-93` and `:422-424`.
- **Current architecture smell:** Generation lives in infrastructure package and is coupled to fixed dimensions/depth assumptions.
- **Recommended architecture:** Move generation to domain/application engine with explicit `WorldGenConfig`, deterministic ID generator, and level/depth handling.
- **Rationale:** Enables deterministic tests and avoids coupling maps to server/terminal assumptions.

### 23. ID generation is not architecture-controlled

- **Evidence:** constructors call `genKey()` in `packages/server/src/terrain.ts`, `creatures.ts`, `items.ts`; `genKey` uses `Math.random()` in `packages/server/src/util.ts:53`; worlds are keyed by entity key at `packages/server/src/world.ts:426-428`.
- **Current architecture smell:** IDs come from ambient randomness outside seeded world generation and persistence control.
- **Recommended architecture:** Inject `IdGenerator`, derive deterministic ids during worldgen, or allocate ids through state/session store; brand `EntityId`.
- **Rationale:** Stable IDs are essential for saves, events, replay, API refs, and deterministic tests.

### 24. AI scheduling/action pipeline is implicit

- **Evidence:** AI plans over the whole world in `packages/server/src/ai/ai.ts:56-67`; non-AI entities fall through to `noop` at `ai.ts:45-52`; synchronous AI is wrapped like async at `ai.ts:54-55`.
- **Current architecture smell:** AI selection, scheduling, initiative, and execution order are implicit; terrain/items are considered every turn.
- **Recommended architecture:** Add explicit creature query and turn scheduler/initiative. Keep AI pure where possible: `plan(state, actor): ActionIntent`.
- **Rationale:** Better performance, determinism, and testability.

### 25. Error, domain event, player-visible message, and log architecture are conflated

- **Evidence:** logs are a global mutable array in `packages/server/src/log.ts:3-12`; invalid states often no-op; item errors exist in `packages/server/src/items.ts:11-16` but are not used by the main action path.
- **Current architecture smell:** Debug logs, player messages, reducer events, and API errors are not distinct concepts.
- **Recommended architecture:** Define domain errors and domain events separately. Reducer returns events; application maps events to player messages; infrastructure logger records structured operational logs; API maps errors to typed failures.
- **Rationale:** Improves debugging, UI feedback, replay, and event-sourcing readiness.

### 26. UI mode is not a real state machine

- **Evidence:** mode unions are barely used in CLI `packages/cli/src/components/BPlaying.tsx:92`, `:104` and web `packages/web/src/Playing.tsx:86`, `:98`; CLI uses imperative popup refs at `BPlaying.tsx:123-135`; web uses `showPickup` boolean at `Playing.tsx:96`, `:117-123`; `setMode(action)` is dead/wrongly modeled because parsing returns action/noop.
- **Current architecture smell:** Modal/UI state is scattered across refs, booleans, and unused mode unions.
- **Recommended architecture:** Implement a reducer/state machine: `playing | loading | pickupSelecting | dropSelecting | inventoryOpen | error`, with explicit transitions.
- **Rationale:** Makes input routing, focus, cancellation, and tests much simpler.

### 27. Shared view-model/rendering logic is duplicated and diverging

- **Evidence:** `parseInput`, `nullMatrix`, `drawWorld`, position keying, and board size are duplicated in CLI `packages/cli/src/components/BPlaying.tsx:23-90` and web `packages/web/src/Playing.tsx:25-85`; CLI sorts terrain behind non-terrain using `isTerrain`/zindex at `BPlaying.tsx:31`, `:69`, `:82-85`; web takes first entity at `Playing.tsx:77-82`; `packages/cli/src/util.ts` and `packages/web/src/util.ts` are effectively identical.
- **Current architecture smell:** Platform components contain shared game projection logic and already diverge.
- **Recommended architecture:** Extract shared `ui-core`/view module functions: `worldToBoard(world, viewport)`, `inputToCommand(key)`, `inventoryView(world)`, popup selection reducer/view model.
- **Rationale:** Terminal and web should differ only in rendering/adapters, not game interpretation.

### 28. Input handling is platform-specific and fragile

- **Evidence:** CLI registers blessed keys imperatively in `packages/cli/src/components/BPlaying.tsx:117-156`; web relies on focusable root div at `packages/web/src/Playing.tsx:203-207` but does not auto-focus; web popup has `onKeyDown` but no `tabIndex` or focus management; `pickupRef` is declared but unused in `packages/web/src/PickupPopup.tsx:14-19`.
- **Current architecture smell:** Input routing is embedded in views rather than normalized through command adapters.
- **Recommended architecture:** Create platform key adapters that normalize blessed/DOM key events into shared `GameCommand`s, then feed commands into the same reducer/controller.
- **Rationale:** Consistent vi-key behavior, modal-specific keymaps, testable input, and better web accessibility.

### 29. Web accessibility architecture is missing

- **Evidence:** main interactive region is a generic `div tabIndex={0}` at `packages/web/src/Playing.tsx:203-207`; messages are plain div text in `packages/web/src/Messages.tsx:9-23`; popup is a generic absolutely positioned div at `packages/web/src/PickupPopup.tsx:39-50`; inventory lacks semantic list/heading structure in `packages/web/src/Inventory.tsx:14-30`; board is spans/brs at `packages/web/src/GameBoard.tsx:51-81`.
- **Current architecture smell:** Web renderer treats DOM like terminal drawing primitives.
- **Recommended architecture:** Add semantic platform components: board as `<pre aria-label="Game map">` or ARIA grid, messages as `role="log" aria-live="polite"`, inventory as section/list, popup as modal dialog/listbox with focus management.
- **Rationale:** Improves keyboard/screen-reader usability and clarifies platform renderer responsibilities.

### 30. Popup/list selection model is duplicated and partially broken

- **Evidence:** CLI `PickupPopup` and generic `popup` duplicate selection/key registration in `packages/cli/src/components/PickupPopup.tsx:20-66` and `packages/cli/src/components/popup.tsx:20-66`; web repeats similar state in `packages/web/src/PickupPopup.tsx:21-37`; web item text is placed in a non-rendered `content` attribute and absolutely overlaps at `PickupPopup.tsx:51-63`.
- **Current architecture smell:** Selection behavior is coupled to platform widgets and copied.
- **Recommended architecture:** Extract `useSelectionList` or a pure reducer `{ marked, toggle, markAll, submit, cancel }` plus platform renderers.
- **Rationale:** One tested selection model can back pickup/drop on CLI and web.

---

## P2 / medium priority

### 31. TS project references blur source/test/build boundaries

- **Evidence:** CLI/server source configs reference `../domain`; domain root config includes source and tests; build configs reference domain build; web config does not extend root/base or reference domain.
- **Current architecture smell:** Package source checks can pull dependency test configs, while web uses a separate compiler universe.
- **Recommended architecture:** Use explicit `tsconfig.src.json` references for source, `tsconfig.test.json` for tests, and `tsconfig.build.json` for build. Decide whether web is package-reference-based or Vite-app-only.
- **Rationale:** Makes dependency graph predictable.

### 32. Build is not fail-closed

- **Evidence:** root TS config sets `noEmitOnError: false` at `tsconfig.base.json:24`; README warns build “will probably fail” at `README.org:18-21`.
- **Current architecture smell:** Release artifacts can be emitted despite type errors.
- **Recommended architecture:** Override build configs to `noEmitOnError: true`; keep relaxed settings only in local exploratory configs if needed.
- **Rationale:** Release output should represent a valid typechecked graph.

### 33. Base URL and server port are hard-coded

- **Evidence:** server port `3000` at `packages/server/src/server.ts:11`; CLI base URL at `packages/cli/src/GameClient.ts:12-14`; web base URL at `packages/web/src/GameClient.ts:14-16`.
- **Current architecture smell:** Clients are compiled for local development only.
- **Recommended architecture:** Introduce `GameClientConfig` / app config with CLI flag/env support and Vite env/proxy support. Prefer relative `/api` for browser production.
- **Rationale:** Deployability and testability require configurable endpoints.

### 34. Transport/platform concerns leak across packages

- **Evidence:** web client imports `HttpApiBuilder` at `packages/web/src/GameClient.ts:1` and provides server CORS middleware at `GameClient.ts:39-42`; server already provides CORS in `packages/server/src/server.ts:8-12`.
- **Current architecture smell:** Server middleware appears in browser client code.
- **Recommended architecture:** Keep CORS only on the server. Browser client only provides browser HTTP/client layers.
- **Rationale:** Cleaner platform boundaries and smaller browser bundles.

### 35. CLI and web duplicate API client wrappers

- **Evidence:** CLI wrapper maps the same methods at `packages/cli/src/GameClient.ts:16-24`; web repeats at `packages/web/src/GameClient.ts:18-26`.
- **Current architecture smell:** Endpoint wrapper behavior can drift across clients.
- **Recommended architecture:** Extract `@flaghack/client` or `makeGameClient(config)` factory. CLI/web provide only platform HTTP layer and configuration.
- **Rationale:** Gives consistent retry/error/state semantics across platforms.

### 36. Compatibility/versioning is lockstep-only

- **Evidence:** API paths are unversioned in `packages/domain/src/GameApi.ts:7-27`; package versions are `0.0.0`; Effect/platform deps use `latest` across package manifests.
- **Current architecture smell:** Clients/server must be upgraded together; no API version path or compatibility matrix.
- **Recommended architecture:** Version HTTP API (`/api/v1` or equivalent), semver shared contract package, pin dependency ranges, and add compatibility tests around encoded request/response shapes.
- **Rationale:** API contracts need intentional evolution once deployments are independent.

### 37. Presentation/layout constants are hard-coded in components

- **Evidence:** board dimensions hard-coded to 20x80 in CLI `packages/cli/src/components/BPlaying.tsx:71-72` and web `packages/web/src/Playing.tsx:70-71`; fixed CLI layout sizes in `Messages.tsx`, `Inventory.tsx`, `BGameBoard.tsx`; fixed/absolute web layout in `GameBoard.tsx`, `Inventory.tsx`, `Messages.tsx`.
- **Current architecture smell:** Layout policy is mixed into leaf renderers.
- **Recommended architecture:** Introduce layout/viewport model per platform and pass dimensions to pure renderers.
- **Rationale:** Supports terminal resizing, responsive browser layout, and shared viewport tests.

### 38. Web/CLI presentation duplication hides platform-specific needs

- **Evidence:** board, inventory, and messages are duplicated in CLI and web components.
- **Current architecture smell:** Components are copied by feature then adjusted per platform.
- **Recommended architecture:** Split each feature into shared view model plus `cli/*View.tsx` and `web/*View.tsx` renderers.
- **Rationale:** Preserves platform-specific rendering while eliminating duplicated behavior.

### 39. Tests are placeholders and no architectural test layers exist

- **Evidence:** all package tests assert `true` in `packages/cli/test/Dummy.test.ts`, `packages/domain/test/Dummy.test.ts`, `packages/server/test/Dummy.test.ts`; no web test script in `packages/web/package.json`.
- **Current architecture smell:** Test suite verifies runner wiring, not behavior or architecture.
- **Recommended architecture:** Add tests for pure reducer/action fixtures, schema roundtrips/freshness, deterministic world generation, API contract/server handlers, built package smoke, input mapping, world-to-tiles, popup selection reducers, and UI controller state machine.
- **Rationale:** Architecture cleanup needs behavioral safety nets.

### 40. Lint/format guardrails miss important files

- **Evidence:** root lint script covers only `*.ts`/`*.mjs` at `package.json:20`; web has separate config but is excluded from pnpm workspace; `import/no-unresolved` is disabled in `eslint.config.mjs:75`; `dprint.json` exists but no root script runs dprint.
- **Current architecture smell:** TSX UI, JS config, package JSON, docs, and unresolved imports can bypass guardrails.
- **Recommended architecture:** Add `format:check`, include `ts/tsx/js/mjs/json/md/yaml`, enable import resolution for workspace packages, and make web lint part of root verification.
- **Rationale:** Tooling cannot catch package/export/UI drift if files are not checked.

### 41. Dependency hygiene is weak

- **Evidence:** many package deps use `latest`; root has `@effect/vitest: latest` while overriding Vitest; CLI duplicates runtime deps in devDeps; web duplicates platform/domain deps; React majors/types diverge across CLI/server/web.
- **Current architecture smell:** Installs can drift; type/runtime compatibility is unclear.
- **Recommended architecture:** Pin dependency ranges intentionally, dedupe runtime/dev deps, align React/runtime majors per package, and add dependency audit/depcheck.
- **Rationale:** Dependency drift undermines reproducible builds and UI typing.

### 42. No visible CI/readiness pipeline

- **Evidence:** no `.github/workflows` or other CI was found; root scripts provide separate `build`, `check`, `lint`, `test`, `coverage` but no `verify`/`ci`; flake exposes formatter/devShell but no checks.
- **Current architecture smell:** Readiness depends on humans knowing which commands to run.
- **Recommended architecture:** Add `pnpm verify` and CI: frozen install, codegen freshness, format check, lint, typecheck, tests, build, and built-package smoke tests.
- **Rationale:** Architecture guardrails need to run consistently.

### 43. Vitest source/dist matrix is incomplete

- **Evidence:** `vitest.shared.ts:4-9` has `TEST_DIST` logic, but no script sets it; aliases are `cli/domain/server`, not scoped `@flaghack/*`, while source imports `@flaghack/domain/*`.
- **Current architecture smell:** Tests may not exercise production package resolution.
- **Recommended architecture:** Add `test:source` and `test:dist` scripts, alias scoped workspace package names consistently, and add built-package smoke tests.
- **Rationale:** Would catch broken dist exports before runtime.

### 44. Docs do not describe package ownership or workflow

- **Evidence:** package READMEs are template placeholders; root `README.org:18-20` says build may fail; `originalreadme.md` duplicates older build/test docs.
- **Current architecture smell:** No authoritative developer workflow or package responsibility map.
- **Recommended architecture:** Replace template docs with root architecture/workflow docs and package READMEs documenting ownership, public API, commands, fixtures, generated artifact policy, and state/session architecture.
- **Rationale:** Maintainers need to know which package owns contracts, engine, server state, clients, and UI adapters.

---

## P3 / lower-priority cleanup

### 45. Domain dependency hygiene

- **Evidence:** `packages/domain/package.json:26-30` includes `@effect/platform` and `@effect/sql`, but SQL is unused in inspected domain source.
- **Current architecture smell:** Pure model package carries infrastructure dependencies.
- **Recommended architecture:** Move HTTP contract and SQL-related dependencies out unless deliberately part of public API; keep model package lightweight.
- **Rationale:** Reduces transitive dependency weight and makes package boundaries clearer.

### 46. Presentation leakage and duplication

- **Evidence:** tile/color mapping lives in `packages/domain/src/display.ts:31-73`; server test draw utils duplicate mapping in `packages/server/src/testDrawUtils.ts:28-52`.
- **Current architecture smell:** Rendering/read-model concerns are split across domain and server utilities.
- **Recommended architecture:** Put view/display projection in a presentation/shared-view module, or define it as an explicit read-model projection.
- **Rationale:** Avoids duplicating rendering rules and keeps core model UI-agnostic if desired.

### 47. Server package exports side-effectful launchers

- **Evidence:** server generated package exports include internals/test utilities; `packages/server/src/server.ts:15-17` launches on import.
- **Current architecture smell:** Importing library modules can start a server.
- **Recommended architecture:** Keep side-effect launchers as binaries/entrypoints outside library exports; expose pure factory functions for tests.
- **Rationale:** Prevents accidental startup and improves testability.

### 48. Web build/deploy architecture is unclear

- **Evidence:** web uses Vite, direct local server URL, partial externalization, and is not in pnpm workspace; root build excludes it.
- **Current architecture smell:** It is unclear whether web is a dev prototype, deployable app, or package.
- **Recommended architecture:** Decide: if deployable app, add to workspace/build/test, use env/proxy, bundle contracts, and add preview/build smoke; if prototype, document and exclude intentionally.
- **Rationale:** Avoids hidden production-only failures.

### 49. Nix flake lacks project checks

- **Evidence:** `flake.nix` provides dev shell/formatter but no checks.
- **Current architecture smell:** Nix can create environment but not validate the project.
- **Recommended architecture:** Add flake checks or document that CI is npm/pnpm-based only.
- **Rationale:** Gives reproducible validation in Nix workflows.

---

## Good architecture to preserve

- **Contract-first seam exists:** `packages/domain/src/GameApi.ts` defines a shared API, server binds handlers in `packages/server/src/Api.ts`, and CLI/web clients use `HttpApiClient.make(GameApi)`.
- **Dependency direction is mostly one-way:** domain does not import `@flaghack/*`; server/cli/web consume domain subpaths.
- **Thin handler start:** server `Api.ts` delegates to a service rather than embedding all logic in route handlers.
- **Shared display seed:** domain `getTile` centralizes some entity-to-tile mapping and both clients consume it.
- **Strict TS baseline exists:** root has `strict`, `exactOptionalPropertyTypes`, project references, and shared Vitest setup.

## Suggested implementation sequence

1. **Repository/package hygiene:** workspace graph, dist/source resolution, generated artifacts, import suffixes, curated exports, fail-closed build.
2. **Domain/application split:** move game rules, reducers, entity factories, worldgen, AI planning types, errors/events out of `server`.
3. **State/session architecture:** `GameSession`/`GameStateStore`, game/player ids, atomic updates, persistence-ready ports.
4. **Contract reshape:** DTOs, command ids, `TurnResult` snapshots, API errors, version/turn fields, configurable base URLs.
5. **Client/UI-core extraction:** shared API client factory, command decoder, world projection, popup reducer, UI state machine.
6. **Platform renderers:** CLI blessed adapter and web semantic/accessibility adapter, with lifecycle/focus managed at edges.
7. **Guardrails:** tests, CI/verify, lint/format coverage, dependency pinning, docs/architecture map.
