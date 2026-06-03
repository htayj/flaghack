# Functional programming / immutability cleanup audit

Date: 2026-05-29\
Branch audited: `master`\
Scope: repo-wide TypeScript/React/server code, beyond Effect-specific idioms.

This complements `EFFECT_TS_OPPORTUNITIES.md`. Some findings overlap because hidden mutable state, stale generated code, and render-time side effects are both Effect problems and general functional-programming problems. The emphasis here is pure reducers, immutable data ownership, total functions, explicit validation boundaries, typed state machines, deterministic generation, and stricter TypeScript guardrails.

## Highest-impact roadmap

1. **Make package/build inputs deterministic.** Remove or control stale generated artifacts; ensure every tool sees the same workspace package graph.
2. **Make game state transitions pure/replayable.** Model commands -> reducer -> `{ state, events }`; keep mutation only in one explicit runtime owner.
3. **Fix identity/location modeling.** Branded entity keys, validated world invariants, and a single discriminated location model will eliminate many impossible states.
4. **Make generation deterministic and total.** Thread seeded RNG/ID allocation and return typed failures for impossible generation cases.
5. **Make UI render functions pure.** React/blessed components should render from immutable UI state; effects, focus, key subscriptions, and network calls should live in explicit interpreters/lifecycle hooks.
6. **Choose collection boundaries.** Avoid ad-hoc mixing of Effect `HashMap`, Immutable.js collections, mutable arrays, `null`, and `undefined`.
7. **Turn on stricter TS/lint/tests.** `noUncheckedIndexedAccess`, readonly collections, no `any`, no mutation, no stale generated files, and tests for reducers/schemas/pathfinding/view-models.

## Remediation status (audit-remediation branch)

The findings below remain the original 2026-05-29 `master` audit evidence. This section summarizes the current `audit-remediation` branch and intentionally does not rewrite the historical evidence.

Status terms:

- **Addressed:** this branch has a direct remediation plus targeted tests/gates for the narrow finding.
- **Partial:** risk was reduced or guardrails/tests were added, but the original recommendation is broader.
- **Deferred:** intentionally not completed in this branch; keep the finding open.

Validation note: this docs-only closing slice does not require code changes. Later validation may skip root `pnpm check` if artifact-emission risk is not approved; the generated-file guard, dprint check, and smoke gates remain the safe evidence for this documentation change.

| Status      | Findings / category                                                                                                                                         | Remediation evidence                                                                                                                                                                                                  | Remaining / not claimed                                                                                                                                                                                                           | Validation                                                                                              |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Partial** | 1-3, 31-32, 49-50, 54: generated/workspace/package boundaries, stricter TS/lint/tests/deps/docs                                                             | Workspace inclusion, generated guardrails, dprint/eslint exclusions, `noUncheckedIndexedAccess`, dependency cleanup, targeted tests, and docs/gate policy reduce risk.                                                | Stale generated schema JS/declarations remain tracked until approved regeneration; source-vs-dist package resolution remains; full CI/readiness pipeline and a complete FP lint/mutation policy are deferred.                     | `pnpm generated:guard`; `pnpm format:check`; `pnpm check`; unit/perf/API/E2E smoke gates as applicable. |
| **Partial** | 4-6, 16-22, 40-41: server reducer purity, logs, pathfinding, worldgen, unsafe indexing, hidden nondeterminism, and import side effects                      | Action reducer work, capped log snapshots, immutable pathfinding distance handling, UUID key generation, safer indexing, structural position handling, and narrower AI planning reduce risk.                          | A global state owner still exists; atomic/session store, typed failures, deterministic seeded generation, explicit turn model, and deeper world/AI architecture are deferred.                                                     | Reducer/log/pathfinding/world tests plus smoke gates.                                                   |
| **Partial** | 9-15, 33-39, 47: domain identity/location/actions/API/collections/types/rendering/numeric helpers                                                           | Stats bugs/bounds, tool variants, integer positions, `Schema.is` validation, item collection responses, stale pickup action removal, and exhaustive display handling were addressed.                                  | Branded entity keys, location ADT and world invariant validation, immutable collection boundary policy, public readonly collection cleanup, null/undefined sentinel cleanup, schema annotations, and helper renames are deferred. | Schema/domain/display unit tests plus `pnpm generated:guard`.                                           |
| **Partial** | 7-8, 23-30, 42-46, 48, 51-53: CLI/web render purity, UI state/input/popups, view layering, duplicate UI/client/util code, terminal/color/debug/static state | Render-time fetches moved to lifecycle hooks, app-scoped runtimes, key cleanup, unknown input ignoring, popup selection/focus fixes, deterministic layering, capped messages, and baseline accessibility reduce risk. | Complete UI state machine/remote-data ADT, shared view-model/UI-core/client extraction, terminal state modeling, layout/view-model cleanup, supervised runtime/error handling, and user-visible error handling are deferred.      | CLI/web unit smoke and API/E2E smoke gates as applicable.                                               |

---

## P0 / blockers

### 1. Generated schemas in `src` conflict with source of truth

- **Evidence:** `packages/domain/src/schemas.ts:46-50` has `Pos.z`, but `packages/domain/src/schemas/schemas.js:22-25` omits it; `schemas.ts:95-99` tags `Milk` as `"milk"`, but `schemas.js:56` tags it as `"booze"`; source terrain has `Floor`/`Tunnel` at `schemas.ts:211-219`, generated JS only has `Wall` at `schemas.js:106-107`; source actions have `apply`/`pickupMulti`/`dropMulti` at `schemas.ts:253-263`, generated action is old at `schemas.js:124`.
- **Current pattern:** Generated JS/d.ts artifacts live under `src/` and can be imported by wildcard paths.
- **Recommended FP/immutable pattern:** Treat TypeScript schemas as the single immutable source of truth. Generate JS/d.ts only to build/dist, or commit generated artifacts only with an automated freshness check.
- **Rationale:** Validation boundaries are only useful if runtime schemas match source types. Stale generated code makes the type/runtime model mutable and ambiguous.

### 2. Workspace/build/package boundaries are inconsistent

- **Evidence:** root `package.json:6-8` says `packages/*` are workspaces, but `pnpm-workspace.yaml:1-4` excludes `packages/web`; root `tsconfig.json:4-8` checks web, while `tsconfig.build.json:4-8` omits it; root lint script in `package.json:20` skips TSX.
- **Current pattern:** Different tools see different package sets.
- **Recommended pattern:** Define one authoritative package graph. Include `web` in install/check/build/lint/test, or move it out of the monorepo conventions entirely.
- **Rationale:** FP/immutability rules only work if every package is checked consistently.

### 3. Workspace dependencies point at ignored `dist`

- **Evidence:** `packages/domain/package.json:12-15` publishes from `dist`; lockfile links dependents to `../domain/dist`; `.gitignore:2` ignores `dist`; `scripts/clean.mjs:4-9` deletes build outputs.
- **Current pattern:** Dependents may consume stale or missing built artifacts.
- **Recommended pattern:** During development, link workspace packages to source, or make build/codegen of `dist` a required checked prerequisite.
- **Rationale:** Immutable package boundaries require reproducible inputs.

### 4. Global mutable game state breaks reducer purity

- **Evidence:** `packages/server/src/gameloop.ts:67-76`, `:78-89`, `:129-131`.
- **Current pattern:** `_state` is a module-level mutable singleton; transitions read/compute/write hidden global state.
- **Recommended pattern:** Model game logic as pure reducers: `step(state, command): Either<GameError, { state; events }>` or similar. Keep mutable ownership in one explicit boundary (request/session store, `Ref`, database, etc.).
- **Rationale:** Pure transitions are replayable, testable, serializable, and safe from lost updates.

### 5. Logger uses a mutable global array and exposes it

- **Evidence:** `packages/server/src/log.ts:3`, `:8-12`.
- **Current pattern:** `_log.push(...)` mutates module state; `getLogs` returns the same mutable array reference.
- **Recommended pattern:** Store logs as immutable events in game state, or expose defensive snapshots as `ReadonlyArray<string>` / immutable collections.
- **Rationale:** Callers can mutate the log, and logging is another hidden singleton side effect.

### 6. Pathfinding mutates records inside an immutable collection

- **Evidence:** `packages/server/src/worldUtil.ts:9`, `:32-62`, especially `:52-54`.
- **Current pattern:** `VEntity` has mutable `dist`; `unsafe_dijkstra` stores those objects in an Immutable.js `Set` and mutates `obj.dist`.
- **Recommended pattern:** Represent distances as immutable values, e.g. `HashMap<EntityKey, Distance>` plus predecessor map; each step returns new state.
- **Rationale:** Mutating objects inside persistent collections defeats value semantics and can create equality/cache surprises.

### 7. UI render paths perform side effects

- **Evidence:** CLI `packages/cli/src/components/BPlaying.tsx:105-111`; web `packages/web/src/Playing.tsx:92-103`; web StrictMode at `packages/web/src/main.tsx:6-9`.
- **Current pattern:** Components fetch world data and set state during render when `world` is empty.
- **Recommended pattern:** Model remote state with an ADT (`NotAsked | Loading | Loaded | Failed`) and fetch in `useEffect` or a command interpreter. Render should be pure.
- **Rationale:** Empty world and “not loaded yet” are conflated; render can issue duplicate requests and update after unmount.

### 8. CLI module imports allocate terminal resources

- **Evidence:** `packages/cli/src/Cli.ts:3`; `packages/cli/src/cliBlessed.tsx:8-27`.
- **Current pattern:** Importing `startblessed` creates a blessed screen, binds keys, and registers process handlers at module load.
- **Recommended pattern:** Allocate terminal resources inside the `play` command and return a disposer/lifecycle object. No top-level terminal side effects.
- **Rationale:** Non-play commands and tests can unexpectedly take over terminal state; lifecycle is not idempotent.

---

## P1 / high priority

### 9. Entity location model admits impossible states

- **Evidence:** `packages/domain/src/schemas.ts:55-57`, `:68-72`.
- **Current pattern:** `Location = Contain | Position` exists, but `EntityBase` requires both `Position` and `Contain`.
- **Recommended pattern:** Use a single discriminated location field, e.g. `{ _tag: "world"; at: Pos } | { _tag: "contained"; container: EntityKey }`.
- **Rationale:** Prevents stale coordinates on inventory items and forces total handling of location cases.

### 10. Keys are unbranded strings and `World` duplicates identity

- **Evidence:** `packages/domain/src/schemas.ts:52-53`, `:299`.
- **Current pattern:** `World` maps arbitrary strings to entities that also carry `key`; the map key and `entity.key` can disagree.
- **Recommended pattern:** Brand `EntityKey`; validate `World` through a smart constructor/refinement that enforces `mapKey === entity.key` and valid containment references, or store identity only in the map key.
- **Rationale:** Avoids denormalized identity bugs and dangling references.

### 11. Actions carry stale/forgeable entity snapshots

- **Evidence:** `packages/domain/src/schemas.ts:257-259`; server planned actions in `packages/server/src/ai/ai.ts:20`; action interpreter in `packages/server/src/actions.ts:71-98`.
- **Current pattern:** `pickup` carries a full `Entity`; planned actions carry `{ entity: Entity; action }`; multi-actions carry raw key arrays.
- **Recommended pattern:** Commands should carry stable branded IDs and intent only, e.g. `{ actorId; action: { _tag: "pickup"; itemId } }`; resolve authoritative entities inside the reducer. Use non-empty, duplicate-free readonly key collections for multi-actions.
- **Rationale:** Whole-object commands can be stale or forged. ID-based commands make reducers replayable and authoritative.

### 12. API response schemas are too broad

- **Evidence:** `packages/domain/src/GameApi.ts:15-22` returns `World` for inventory and pickup items.
- **Current pattern:** Inventory/pickup endpoints can legally return terrain, creatures, or unrelated entities.
- **Recommended pattern:** Define narrow DTOs/schemas like `Inventory = HashMap<EntityKey, Item>` or readonly item summaries.
- **Rationale:** Boundary schemas should make invalid API states unrepresentable.

### 13. Stats schemas contain copy/paste field bugs

- **Evidence:** `packages/domain/src/stats.ts:12`, `:47-50`, `:57-59`.
- **Current pattern:** `Wisdom` uses `"charisma"`; `AllStates` collects `Fixed, Wet`; `HungerP` reuses `"dhp"`.
- **Recommended pattern:** Define explicit field records with `satisfies`, derive unions from literal tuples, and test schema keys.
- **Rationale:** Dynamic `prop(name, schema)` helpers hide duplicate/missing field names from TypeScript.

### 14. Item/tool variants are defined but not reachable

- **Evidence:** `packages/domain/src/schemas.ts:131-140`.
- **Current pattern:** `Hammer`, `Nails`, and `AnyTool` exist, but `AnyItem` excludes `AnyTool`.
- **Recommended pattern:** Include tools in `AnyItem` and add renderer/action cases, or remove them until implemented.
- **Rationale:** Dead variants cause schema/display/action drift.

### 15. Central helpers rely on casts and `any`

- **Evidence:** `packages/domain/src/util.ts:48-51`, `:59-62`; `packages/domain/src/schemas.ts:291-297`.
- **Current pattern:** `allof`, `prop`, and `conforms` cast through generic/`any` types.
- **Recommended pattern:** Constrain helpers more tightly or replace them with explicit `Schema.Struct` objects; type guards should narrow schema `Type`, not `Encoded`.
- **Rationale:** Domain helpers are trust boundaries; casts weaken strict TypeScript at the most important layer.

### 16. Missing actors/items are silently ignored

- **Evidence:** `packages/server/src/actions.ts:52-74`; `packages/server/src/gameloop.ts:104-115`, `:143-155`.
- **Current pattern:** Missing player can no-op; missing pickup/drop keys become `Option.none`; missing pickup target can return empty map.
- **Recommended pattern:** Return typed failures (`NoSuchActor`, `NoSuchItem`, `InvalidAction`) from reducers/interpreters.
- **Rationale:** Silent no-ops hide bugs and make clients unable to distinguish empty results from invalid commands.

### 17. Reducers mix pure-looking state updates with effect/runtime execution

- **Evidence:** `packages/server/src/actions.ts:56-60`, `:65-69`.
- **Current pattern:** `dropItems` / `pickupItems` run `Effect.runSync` inside helpers while returning `GameState`.
- **Recommended pattern:** Keep reducers pure and return `{ state, events }`, or keep the whole path effectful to the boundary. Do not run a runtime inside reducer helpers.
- **Rationale:** Hidden side effects make reducers hard to test, compose, and replay.

### 18. Path reconstruction is partial and mutation-heavy

- **Evidence:** `packages/server/src/worldUtil.ts:104-114`.
- **Current pattern:** Uses `let curr`, `let path = []`, `while`, and `path.push`.
- **Recommended pattern:** Use an unfold/recursive function with explicit visited/step bounds and return `Option<ReadonlyArray<Entity>>` when no path exists.
- **Rationale:** Termination and reachability assumptions are not encoded.

### 19. World generation uses unsafe indexing

- **Evidence:** `packages/server/src/world.ts:144`, `:161`, `:189`, `:213-214`; `tsconfig.base.json:32` disables `noUncheckedIndexedAccess`.
- **Current pattern:** Code assumes non-empty arrays/intersections and indexes directly.
- **Recommended pattern:** Use `NonEmptyReadonlyArray`, `Option`, or `Either<GenerationError, ...>` for empty cases.
- **Rationale:** Invalid split/carve states become runtime exceptions.

### 20. Spatial equality and location helpers are inconsistent

- **Evidence:** `packages/server/src/position.ts:15-17`; `packages/server/src/world.ts:56-59`; `packages/server/src/gamestate.ts:29`.
- **Current pattern:** `collideP` ignores `z`; `isAt` uses reference equality (`e.at === p`); `getLocationOf` returns `TPos | false`.
- **Recommended pattern:** Use structural `posEq(a, b)` including `z`; return `Option<TPos>` / explicit location ADT instead of `false`.
- **Rationale:** Immutable position values should be compared by value, not reference.

### 21. Random IDs are hidden nondeterminism

- **Evidence:** `packages/server/src/util.ts:53`; constructors in `creatures.ts`, `items.ts`, `terrain.ts`; duplicated `genKey` in CLI/web utils.
- **Current pattern:** Entity constructors call `Math.random()` even inside seeded world generation.
- **Recommended pattern:** Thread seeded RNG/ID allocation through generation, or pass IDs into pure constructors. Check collisions at the world constructor boundary.
- **Rationale:** `BSPGenLevel(seed, dlvl)` is not actually replayable if keys are random.

### 22. Module imports have significant side effects

- **Evidence:** `packages/server/src/gameloop.ts:47-72`; `packages/server/src/server.ts:15-17`; `packages/server/src/testBSP.ts:3-14`; `packages/server/src/testDrawUtils.ts:7`.
- **Current pattern:** Importing modules can generate worlds, initialize singleton state, print to console, or launch a server.
- **Recommended pattern:** Keep modules as pure declarations; move initialization/launch/logging into explicit main/test entrypoints.
- **Rationale:** Import-time work makes tests order-dependent and utility modules unsafe to import.

### 23. UI state is split into impossible combinations

- **Evidence:** CLI `packages/cli/src/components/BPlaying.tsx:95-97`, `:130-135`, `:160-186`; web `packages/web/src/Playing.tsx:86-99`, `:117-123`, `:188-222`.
- **Current pattern:** UI state is spread across refs, booleans, popup-local arrays, `mode`, and imperative `show`/`hide` calls.
- **Recommended pattern:** Use one discriminated UI state/reducer, e.g. `Normal | LoadingPickup | PickupOpen | InventoryOpen | Failed`, and derive visibility/focus from it.
- **Rationale:** Prevents stale/impossible UI combinations and makes transitions exhaustive.

### 24. Input decoders are partial and too loosely typed

- **Evidence:** CLI `packages/cli/src/components/BPlaying.tsx:42-62`, `:119-147`; web `packages/web/src/Playing.tsx:42-64`, `:114-137`; popup `event: any` and `keyCode` in `packages/web/src/PickupPopup.tsx:32-37`.
- **Current pattern:** Input is `any`; unknown keys become `noop`; decoders log; branches are unreachable/dead.
- **Recommended pattern:** Decode `unknown`/keyboard events to `Option<UiCommand>` or `Either<InputError, UiCommand>` with exact event types and no logging. Interpret commands separately.
- **Rationale:** Prevents unrelated keys from causing commands and makes input handling testable.

### 25. Popup selection starts invalid and allows duplicates

- **Evidence:** CLI `packages/cli/src/components/PickupPopup.tsx:20`, `packages/cli/src/components/popup.tsx:20`; web `packages/web/src/PickupPopup.tsx:21`.
- **Current pattern:** `marked` starts as `["asdf"]` and is an array.
- **Recommended pattern:** Use an empty `ReadonlySet<EntityKey>` / immutable set, validated against visible items.
- **Rationale:** Submitting before marking can send an invalid key; arrays allow duplicates.

### 26. Blessed key subscriptions leak/stale handlers

- **Evidence:** `packages/cli/src/components/BPlaying.tsx:117-156`; `packages/cli/src/components/PickupPopup.tsx:30-66`; `packages/cli/src/components/popup.tsx:30-66`.
- **Current pattern:** Effects register handlers; cleanup calls `unkey` with a new no-op callback, not the registered callback.
- **Recommended pattern:** Store stable listener identities and return cleanup using the same handler; consider a reusable `useBlessedKeys` hook.
- **Rationale:** Prevents duplicate commands and stale closures.

### 27. Unsupervised UI callbacks cause races/stale UI

- **Evidence:** CLI `packages/cli/src/components/BPlaying.tsx:125-176`; web `packages/web/src/Playing.tsx:100-136`, `:188-194`.
- **Current pattern:** Event handlers fire asynchronous work without error/loading/race handling; pickup/drop do not consistently refresh world/inventory.
- **Recommended pattern:** Let handlers emit commands to a single interpreter/reducer that records `loading/success/error`, cancels/ignores stale responses, and applies one immutable state transition.
- **Rationale:** Avoids unhandled failures and inconsistent UI snapshots.

### 28. Browser package externalizes runtime domain schemas

- **Evidence:** `packages/web/vite.config.ts:7-11`; imports in `packages/web/src/GameClient.ts`, `Inventory.tsx`, `PickupPopup.tsx`, `Playing.tsx`.
- **Current pattern:** Browser bundle may contain bare `@flaghack/domain/schemas` imports.
- **Recommended pattern:** Bundle browser-safe domain modules, split type-only imports, or provide an explicit import map/CDN boundary.
- **Rationale:** Browser apps need runtime schema values available and resolvable.

### 29. Browser client imports/provides server middleware

- **Evidence:** `packages/web/src/GameClient.ts:1`, `:39-42`.
- **Current pattern:** Web client imports `HttpApiBuilder` and provides CORS middleware.
- **Recommended pattern:** Keep CORS/server middleware on the server. Browser client should only provide browser HTTP/client layers.
- **Rationale:** Keeps platform boundaries clean and browser bundles smaller.

### 30. `@ts-ignore`, `any`, and non-null assertions weaken browser boundaries

- **Evidence:** `packages/web/src/GameBoard.tsx:4-5`, `Inventory.tsx:3-4`, `Messages.tsx:2-3`, `Playing.tsx:22-23`; `packages/web/src/Playing.tsx:42`; `packages/web/src/PickupPopup.tsx:32`; `packages/web/src/main.tsx:6`.
- **Current pattern:** React imports are suppressed; events are `any`; root DOM node uses `!`.
- **Recommended pattern:** Remove unused React value imports under `react-jsx` or import types only; type events precisely; guard DOM lookup with an explicit failure path.
- **Rationale:** UI/input/DOM are boundary code and should narrow unknowns rather than suppressing checks.

---

## P2 / medium priority

### 31. Strict TypeScript settings are not strong enough for totality

- **Evidence:** `tsconfig.base.json:20`, `:24`, `:32`; web tsconfigs do not extend the base.
- **Current pattern:** `noImplicitReturns`, `noEmitOnError`, and `noUncheckedIndexedAccess` are disabled; web lacks some base strictness.
- **Recommended pattern:** Enable these at least for `packages/domain` and pure server modules; make web extend base or intentionally override with documented reasons.
- **Rationale:** Total functions and safe indexing are core FP guardrails.

### 32. ESLint misses TSX/JS and permits mutation/unsafe typing

- **Evidence:** `package.json:20`; `eslint.config.mjs:38-42`, `:64-67`, `:87-89`.
- **Current pattern:** TSX/JS are skipped; parser is not type-aware; `no-explicit-any`, non-null assertions, and ban-ts-comment are off; mutation rules are minimal.
- **Recommended pattern:** Include `**/*.{ts,tsx,js,mjs}`; add type-aware strict rules; add restrictions for property/parameter mutation, mutable array methods, `any`, non-null assertions, and casts.
- **Rationale:** FP style needs automated guardrails.

### 33. Collection policy is mixed and conversion-heavy

- **Evidence:** domain `World` uses Effect `HashMap`; server mixes `HashMap`, arrays, and Immutable.js `Set`; UI converts `HashMap` to Immutable.js `Map/List` in `packages/cli/src/components/BPlaying.tsx:74-90`, `packages/web/src/Playing.tsx:73-84`.
- **Current pattern:** Effect collections, Immutable.js, plain mutable arrays, `null`, `undefined`, and `scala-ts/UndefOr` all appear without clear boundaries.
- **Recommended pattern:** Pick a policy: domain/server use `HashMap` + `ReadonlyArray`/immutable collections; React receives readonly view models; isolate Immutable.js or remove it.
- **Rationale:** Reduces equality surprises, ordering ambiguity, and unnecessary allocation.

### 34. Public types expose mutable arrays

- **Evidence:** CLI `Tile[][]` / `Key[]` in `packages/cli/src/components/BGameBoard.tsx`, `packages/cli/src/components/BPlaying.tsx`; web `Tile[][]`; server generation arrays in `packages/server/src/world.ts` and `terrain.ts`.
- **Current pattern:** Mostly non-mutating code but mutable types at boundaries.
- **Recommended pattern:** Use `ReadonlyArray<ReadonlyArray<Tile>>`, `ReadonlyArray<EntityKey>`, or immutable collection types.
- **Rationale:** Immutability should be part of the type contract, not a convention.

### 35. `null`/`undefined` sentinels are common

- **Evidence:** `UndefOr` and `nullMatrix` in `packages/server/src/util.ts:5-22`, `packages/cli/src/util.ts:7-23`, `packages/web/src/util.ts:7-23`; rendering conversions to null/undefined in server/CLI/web drawing code.
- **Current pattern:** Absence is represented with `null`, `undefined`, or `false` depending on site.
- **Recommended pattern:** Use `Option<T>`/tagged ADTs for domain/application absence, and convert to `null` only at UI/React DOM boundaries if required.
- **Rationale:** Consistent absence modeling improves totality and exhaustiveness.

### 36. `nullMatrix` uses aliased mutable row arrays

- **Evidence:** `packages/server/src/util.ts:8-13`; `packages/cli/src/util.ts:10-15`; `packages/web/src/util.ts:10-15`; duplicated in `BPlaying`/`Playing`.
- **Current pattern:** `rows.fill(Array(w).fill(null))` reuses the same row before conversion.
- **Recommended pattern:** Construct rows independently: `Array.from({ length: h }, () => Array.from({ length: w }, () => null))`, then freeze/convert to readonly if needed.
- **Rationale:** Currently safe only because rows are not mutated before conversion; fragile pattern.

### 37. Casts hide rendering and tuple type issues

- **Evidence:** `packages/domain/src/display.ts:73`; `packages/server/src/testDrawUtils.ts:52`, `:98`; `packages/server/src/world.ts:97`.
- **Current pattern:** `as Tile` and tuple assertions bypass checking.
- **Recommended pattern:** Use explicit return types, `satisfies Tile`, or typed helper constructors.
- **Rationale:** Casts hide missing/invalid fields in view-model code.

### 38. Rendering mappings are not exhaustive

- **Evidence:** `packages/domain/src/display.ts:3-29`, `:46-73`; variants in `packages/domain/src/schemas.ts:190-203`.
- **Current pattern:** `DirectionalVariant` values fall through a default branch; `getTile` casts final result.
- **Recommended pattern:** Use `satisfies Record<DirectionalVariant, Glyph>` and exhaustive match/switch with `never` fallback.
- **Rationale:** Adding a variant should force render updates at compile time.

### 39. Numeric schemas are too broad

- **Evidence:** positions in `packages/domain/src/schemas.ts:46-50`; timing/points in `packages/domain/src/stats.ts:26-29`, `:56-59`.
- **Current pattern:** Raw numbers allow fractions/negative values for likely grid coordinates, turns, durations, and counters.
- **Recommended pattern:** Introduce refined/branded schemas like `GridCoord`, `Depth`, `Turn`, `Duration`, `NonNegativePoints`, bounded attributes.
- **Rationale:** Runtime schemas should encode domain invariants, not just JS primitives.

### 40. World generation silently falls back to invalid origin

- **Evidence:** `packages/server/src/gameloop.ts:48-53`.
- **Current pattern:** If no floor exists, spawn defaults to `{ x: 0, y: 0, z: 0 }`.
- **Recommended pattern:** Return `Either<GenerationError, InitialState>` when no spawn exists.
- **Rationale:** Silent fallback can place the player in invalid terrain and hide generation failures.

### 41. Wall generation discards dungeon level

- **Evidence:** `packages/server/src/world.ts:90-93`, `:422-424`.
- **Current pattern:** `makeAllWalls(width, height, dlvl)` accepts `dlvl` but calls `wall(x, y, 0)`.
- **Recommended pattern:** Use `dlvl` consistently or remove it until z-levels are supported.
- **Rationale:** Position model includes `z`; generation should preserve it.

### 42. Visual layering depends on map iteration order

- **Evidence:** `packages/web/src/Playing.tsx:69-84`; same pattern in CLI drawing.
- **Current pattern:** Entities are grouped by `x,y`; rendering chooses `.first()` from map-derived ordering and ignores `z`/priority.
- **Recommended pattern:** Define deterministic projection: bounds-check positions, include z/layer policy, sort by render priority, produce readonly tiles.
- **Rationale:** `HashMap` iteration order should not decide what appears on top.

### 43. Lists use array index keys in UIs

- **Evidence:** CLI `packages/cli/src/components/Inventory.tsx:21-22`, `packages/cli/src/components/PickupPopup.tsx:77-79`, `packages/cli/src/components/popup.tsx:78-80`; web `packages/web/src/Inventory.tsx:25-27`, `packages/web/src/PickupPopup.tsx:51-53`.
- **Current pattern:** `key={i}` for rendered domain items.
- **Recommended pattern:** Use stable domain keys: `key={item.key}`.
- **Rationale:** Index keys can preserve stale DOM/blessed nodes after immutable list reordering.

### 44. Duplicate UI/client/util code hides drift

- **Evidence:** `packages/cli/src/util.ts:1-105` and `packages/web/src/util.ts:1-105`; `GameClient` duplicated in CLI/web; play/draw logic duplicated in `BPlaying.tsx` and `Playing.tsx`; popup logic duplicated in CLI `PickupPopup.tsx` and `popup.tsx`.
- **Current pattern:** Copy/paste per platform.
- **Recommended pattern:** Extract pure view-model, input-decoder, drawing, and client protocol code into shared modules; keep platform adapters thin.
- **Rationale:** Pure immutable functions are easiest to test once and reuse.

### 45. Popup/web markup is not a clean view model

- **Evidence:** `packages/web/src/PickupPopup.tsx:51-63`.
- **Current pattern:** Rows use index keys, absolute positioning, and a `content` attribute rather than children.
- **Recommended pattern:** Render stable keyed rows with visible children/semantic controls and readonly selection state.
- **Rationale:** Current UI cannot reliably display/select multiple items and is hard to reason about from state alone.

### 46. Terminal color helpers leak mutable terminal state

- **Evidence:** `packages/cli/src/components/BGameBoard.tsx:39-43`; `packages/cli/src/util.ts:102-105`.
- **Current pattern:** ANSI colors are emitted without reset.
- **Recommended pattern:** Emit reset at cell/row boundaries or use blessed style attributes.
- **Rationale:** Terminal color is global mutable output state; leakage affects neighboring UI.

### 47. Generic utility helpers are incorrectly typed/named

- **Evidence:** `packages/cli/src/util.ts:43-52`, `packages/web/src/util.ts:43-52`; `maybeDo` uses `T extends Function` in util and GameBoard copies.
- **Current pattern:** `cmap` calls `.filter` despite map-like naming; broad `Function` erases types.
- **Recommended pattern:** Remove unused helpers or type them precisely (`(a: A) => B`, endomorphism for `maybeDo`).
- **Rationale:** FP-style pipelines rely on small helpers having truthful names/types.

### 48. Messages/log UI can grow unbounded or render incorrectly

- **Evidence:** web messages in `packages/web/src/Messages.tsx:17-22`; updates in `packages/web/src/Playing.tsx:105-106`.
- **Current pattern:** Messages are joined with `"\n"` inside a normal div; no cap on list length.
- **Recommended pattern:** Render a readonly keyed log list or use `white-space: pre-wrap`; cap logs in reducer/state.
- **Rationale:** Prevents collapsed display and unbounded UI state growth.

---

## P3 / cleanup and guardrails

### 49. Tests are only dummy assertions

- **Evidence:** `packages/domain/test/Dummy.test.ts:1-7`, `packages/server/test/Dummy.test.ts:1-7`, `packages/cli/test/Dummy.test.ts:1-7`.
- **Recommended tests:** schema encode/decode/freshness, entity key/world invariants, deterministic world generation from seed, reducer/action failures, pathfinding no-mutation/no-path cases, position equality, input decoders, popup selection reducers, UI view-model projection.
- **Rationale:** Most immutability/totality issues above are currently unprotected.

### 50. Dependency boundaries are noisy

- **Evidence:** domain declares unused `@effect/sql`; server carries UI deps (`ink`, `meow`, `react`); web has `typescript-language-server` as runtime dependency; React versions differ across packages/lock.
- **Recommended pattern:** Keep packages minimal and platform-specific; place tools in devDeps/root; pin one React major per UI surface unless intentionally isolated.
- **Rationale:** Smaller dependency graphs reduce hidden runtime state and duplicated singleton/context risks.

### 51. CLI command metadata is still template-like

- **Evidence:** `packages/cli/src/Cli.ts:6-27`.
- **Current pattern:** Commands still say `todo` / `Todo CLI` / “Add a new todo”.
- **Recommended pattern:** Rename commands/descriptions to game concepts and make command output explicit.
- **Rationale:** Not strictly FP, but command surfaces should accurately reflect the modeled domain.

### 52. Static state where no state is needed

- **Evidence:** `packages/cli/src/BApp.tsx:8-13`.
- **Current pattern:** `mode` is `useState` but never changes.
- **Recommended pattern:** Use a constant, or model real app mode transitions in the main UI reducer.
- **Rationale:** Avoid unnecessary mutable state.

### 53. Debug logging remains in pure helpers/components

- **Evidence:** `packages/web/src/Playing.tsx:43`, `:116`, `:206`; CLI `drawWorld` default logger in `packages/cli/src/components/BPlaying.tsx:71-72`; server test utilities log at import.
- **Recommended pattern:** Remove debug logs from pure helpers; pass logging explicitly at effect/test boundaries.
- **Rationale:** Pure functions should not write to global console output.

### 54. Docs/CI do not define the intended FP policy

- **Evidence:** root `README.org` says build may fail; package READMEs are template placeholders; no CI workflow files were found.
- **Recommended pattern:** Document collection policy, state ownership, generated-file lifecycle, reducer/event architecture, and root install/codegen/check/build/lint/test workflow.
- **Rationale:** Without docs/CI, future work will keep reintroducing mutable and inconsistent patterns.

---

## Good patterns to preserve

- `strict` and `exactOptionalPropertyTypes` are already enabled in the base TS config.
- Core schemas/actions use tagged structures, which is a good base for discriminated unions.
- `World` uses a persistent `HashMap`, which is a reasonable immutable domain collection if the boundary policy is clear.
- Several entity operations return copied records via spreads rather than mutating inputs (`setPosition`, `movePosition`, pickup/drop helpers).
- BSP split randomness is partly threaded through return values; extend that discipline to entity IDs and all generation decisions.
- Several display transforms are already pure functions outside JSX; centralize and type them more strictly.

## Suggested implementation order

1. **Repo determinism:** fix workspace graph, generated artifacts, dist/source resolution, and root lint/check coverage.
2. **Domain model:** branded keys, location ADT, world smart constructor/invariants, narrower API schemas, fixed stats schemas.
3. **Pure reducer core:** commands by ID, typed failures, event/log outputs, deterministic ID/RNG threading.
4. **World/pathfinding:** remove object mutation, handle empty arrays/intersections with typed failures, structural position equality including z.
5. **UI architecture:** remote-data ADTs, single UI reducers, pure input decoders, lifecycle-managed key subscriptions, no render-time effects.
6. **Collections and view models:** readonly arrays/sets at UI boundaries, deterministic render projection, stable keys, shared draw/input utilities.
7. **Guardrails:** enable stricter TS/lint, add tests for invariants/reducers/generation/view-models, document policy.
