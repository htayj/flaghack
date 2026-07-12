# Effect-TS opportunities audit

Date: 2026-05-29\
Branch audited: `master`\
Scope: `packages/domain`, `packages/server`, `packages/cli`, `packages/web`, root build/lint/test/package configuration.

This is a read-only audit of places where the project can use Effect/Effect-TS more, or use it in more canonical ways. The project already has a good Effect foundation: shared `HttpApi` contracts, `Effect.Service` clients, `HttpApiBuilder` on the server, `Layer.launch` / `NodeRuntime.runMain` at entrypoints, `@effect/language-service`, `@effect/eslint-plugin`, and `@effect/vitest` are present. The main opportunities are to make runtime boundaries explicit, remove hidden globals, make schema/codegen deterministic, and keep React/blessed side effects at managed boundaries.

## Highest-impact roadmap

1. **Fix generated-schema/build lifecycle first.** Stale runtime schema artifacts under `packages/domain/src/schemas/` can invalidate API codecs and package exports.
2. **Complete server state/log service ownership.** `GameStateStore`, `GamePersistence`, and `GameUpdateHub` now provide `Ref`/layer-backed single-game state, lifecycle, and revision ownership; move the remaining logs/session concerns into explicit keyed services.
3. **Stop running Effects inside pure/application logic.** Let application workflows return `Effect` all the way to `server.ts`, CLI `bin.ts`, or UI runtime boundaries.
4. **Create one runtime per UI app.** CLI blessed and web React code should not repeatedly `provide(MainLive)` and `runPromise` in renders/callbacks.
5. **Make domain schemas simpler and typed errors explicit.** Prefer direct `Schema.Struct` / `Schema.TaggedStruct` / `Schema.Data` choices, branded IDs, `Schema.is`, and API error schemas.

## Remediation status (audit-remediation branch)

The findings below remain the original 2026-05-29 `master` audit evidence. This section summarizes later remediation and intentionally does not rewrite the historical evidence.

Post-audit update (verified at `2ba89d6`): the former module `_state` has
been replaced by `GameStateStore`; `GameRepository` serializes lifecycle work;
`GamePersistence` owns configured atomic file saves; and `GameUpdateHub` uses
`Ref` plus replaying `PubSub` for monotonic revisioned updates. Remaining work
includes keyed multi-session ownership, typed application errors, and a more
general domain-event/command-version model.

Status terms:

- **Addressed:** this branch has a direct remediation plus targeted tests/gates for the narrow finding.
- **Partial:** risk was reduced or guardrails/tests were added, but the original recommendation is broader.
- **Deferred:** intentionally not completed in this branch; keep the finding open.

Validation note: this docs-only closing slice does not require code changes. Later validation may skip root `pnpm check` if artifact-emission risk is not approved; the generated-file guard, dprint check, and smoke gates remain the safe evidence for this documentation change.

| Status        | Findings / category                                                                                                 | Remediation evidence                                                                                                                                                                                              | Remaining / not claimed                                                                                                                                                                                                                                                     | Validation                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Partial**   | 1-2, 36-39, 42, 53: build/generated/workspace/dependency/docs tooling                                               | Workspace scope, stricter TypeScript settings, lint/format/generated guardrails, dependency pinning/deduping, real tests, and gate docs were added.                                                               | Generated schema JS/declarations under `packages/domain/src/schemas/` remain tracked/stale until approved regeneration; `pnpm-lock.yaml` source-vs-dist links remain; no full Effect build/codegen lifecycle, CI, Nix, publish-hardening, or package smoke gate is claimed. | `pnpm generated:guard`; `pnpm format:check`; `pnpm check`; unit/perf/API/E2E smoke gates as applicable. |
| **Partial**   | 3-5, 7-8, 17-24: server state, game-loop effects, logging, AI/pathfinding/config/collection boundaries              | `GameStateStore`, `Ref`-backed update state, lifecycle semaphore serialization, `GamePersistence`, save-path config, UUID keys, log snapshots/caps, immutable pathfinding, and narrower AI planning reduce risk.  | Multi-session/game ownership, revision-bearing commands/stale-command rejection, typed application errors, a general event/log architecture, and a complete collection policy remain.                                                                                       | Store/persistence/update-hub plus targeted reducer/log/pathfinding/world and smoke tests.               |
| **Partial**   | 6, 25-31, 43-49, 52: domain schemas, API/display contracts, typed errors                                            | `conforms` now uses `Schema.is`; stats keys/bounds, tool items, integer positions, item collection responses, stale pickup action removal, and display exhaustiveness were addressed.                             | Branded IDs, location ADT/world invariants, schema annotations, canonical helper cleanup, typed `HttpApiEndpoint.addError`, authoritative mutation results, and user-visible error UI are deferred.                                                                         | Schema/domain/API unit tests plus `pnpm generated:guard`.                                               |
| **Partial**   | 9-16, 32-35, 40-41, 50-51: CLI/web runtime, UI effects, duplicate client/UI utilities, metadata, and error handling | App-scoped runtimes/layers, lifecycle fetches, revisioned SSE state with HTTP fallback, stale-revision rejection, key cleanup, popup/focus improvements, capped messages, and baseline accessibility reduce risk. | Shared client/UI-model extraction, complete remote-data/UI state machine, supervised runtime/error handling, timeout/retry/user-visible error handling, revision-bearing commands, and final CLI metadata polish are deferred.                                              | CLI/web stream/runtime unit tests and API/E2E smoke gates as applicable.                                |
| **Addressed** | 54: preserve existing good Effect patterns                                                                          | This section preserves the existing good patterns instead of rewriting them.                                                                                                                                      | No additional remediation is claimed beyond continuing to keep those patterns.                                                                                                                                                                                              | Review of this status section.                                                                          |

---

## P1 / high priority

### 1. Stale generated schema artifacts are tracked under `src`

- **Evidence:** `packages/domain/src/schemas/schemas.js:22-25`, `:56`, `:106-107`, `:124-126` differ from `packages/domain/src/schemas.ts:46-50`, `:95-99`, `:190-219`, `:253-300`. Generated `.d.ts` files also exist under `packages/domain/src/schemas/`.
- **Current pattern:** Partial generated JS/d.ts files live beside TypeScript source and are stale.
- **Canonical Effect direction:** Keep `src` as TypeScript source only and generate JS/types/exports into build artifacts, or commit a complete generated set with a CI freshness check. Make `@effect/build-utils prepare-v2` / `pack-v2` part of the normal lifecycle.
- **Rationale:** Effect schemas are runtime contracts. Stale schema JS can break `HttpApi` encoding/decoding and client/server compatibility.

### 2. Build/codegen/package resolution is not deterministic

- **Evidence:** root `package.json:11-12` build does not run codegen; package build-utils config exists in package manifests; `tsconfig.base.json:41-52` maps package roots to generated/missing `src/index.js` entries; `dist` is ignored/cleaned.
- **Current pattern:** Source checks, generated exports, package manager workspace links, and ignored build outputs are not aligned.
- **Canonical Effect direction:** Make a clean-clone workflow deterministic: `pnpm codegen` before `check/build`, or consistently resolve workspaces to source. Decide whether generated index/export files are committed or build-only.
- **Rationale:** Effect package exports and schemas must be generated from the same source the compiler and tests use.

### 3. Server game state was a mutable module singleton

- **Historical evidence:** `packages/server/src/gameloop.ts:47-72`, `:74-89`, `:129-131`; `packages/server/src/GameRepository.ts:12-39` at the audited commit.
- **Current status:** Addressed for the current single-game runtime by `GameStateStore`, with lifecycle/persistence/update services layered around it. Keyed multi-session ownership remains open.
- **Canonical Effect direction:** Introduce a `GameStateStore` service/layer backed by `Ref` or `SynchronizedRef`, with `get`, `set`, `update`, and `modifyEffect` operations. Provide it in `server.ts`.
- **Rationale:** Makes state explicit, testable, concurrency-safe, hot-reload-friendly, and capable of supporting multiple game instances.

### 4. Game-state updates lacked atomic lifecycle ownership

- **Historical evidence:** `packages/server/src/gameloop.ts:78-89`, `:95-127` at the audited commit.
- **Current status:** Store modifications and lifecycle mutations now run through `GameStateStore` plus a repository semaphore. Commands still lack client-supplied revisions and typed stale-command rejection.
- **Canonical Effect direction:** Use `SynchronizedRef.modifyEffect` / `updateEffect` so a player action and AI tick update state atomically.
- **Rationale:** Concurrent HTTP requests can race and overwrite each other.

### 5. Effects are run inside application logic

- **Evidence:** `packages/server/src/actions.ts:52-69` calls `Effect.runSync` inside reducers.
- **Current pattern:** Nested runtime execution inside game logic.
- **Canonical Effect direction:** Make the action interpreter return `Effect<GameState, DomainError, Services>` and compose with `Effect.reduce` / `Effect.gen`. Only run effects at process/framework edges.
- **Rationale:** Nested runtimes bypass fiber context, logging, interruption, error propagation, and layers.

### 6. Domain/API errors are mostly implicit or swallowed

- **Evidence:** `packages/server/src/gameloop.ts:105-115`, `:143-156`; `packages/server/src/items.ts:11-16`, `:38-55`; `packages/domain/src/GameApi.ts:5-27`.
- **Current pattern:** Missing player/entity can silently no-op or become empty `HashMap`; typed item errors exist but are not propagated through the API contract.
- **Canonical Effect direction:** Define domain errors with `Data.TaggedError` (`PlayerNotFound`, `EntityNotFound`, `InvalidAction`, etc.), use `Effect.fromOption` / `Effect.mapError`, and expose expected failures via `HttpApiEndpoint.addError`.
- **Rationale:** Invalid game states and bad requests should be typed and visible all the way to clients.

### 7. Entity key generation is non-Effect, low entropy, and collision-prone

- **Evidence:** `packages/server/src/util.ts:53`; constructors in `creatures.ts:32,45`, `items.ts:24,35`, `terrain.ts:29,35,41`; `world.ts:426-428`. CLI/web copies also have `genKey` in `packages/cli/src/util.ts:54`, `packages/web/src/util.ts:54`.
- **Current pattern:** `Math.random() * 2 ** 8` generates tiny string keys; `HashMap.fromIterable` can silently overwrite collisions.
- **Canonical Effect direction:** Inject a `KeyGenerator` service backed by `Random`, a seeded deterministic generator for tests, or `crypto.randomUUID` for IDs. Prefer passing keys into pure constructors.
- **Rationale:** Avoids collisions and makes randomness deterministic/testable.

### 8. Logs are mutable globals rather than an Effect service

- **Evidence:** `packages/server/src/log.ts:3-12`; logger provided locally in `packages/server/src/gameloop.ts:86-87`.
- **Current pattern:** Logs are pushed into a module-level array and returned by reference.
- **Canonical Effect direction:** Provide an app-wide log sink service backed by `Ref`, `Queue`, or a bounded ring buffer; integrate with `Logger`/`Effect.log`; return snapshots/copies.
- **Rationale:** Captures logs consistently, avoids mutable leakage, and makes logging testable/configurable.

### 9. CLI executable imports create UI side effects and cycles

- **Evidence:** `packages/cli/src/bin.ts:46-49`, `packages/cli/src/Cli.ts:18`, `packages/cli/src/cliBlessed.tsx:8-27`, `packages/cli/src/components/BPlaying.tsx:10`.
- **Current pattern:** UI code imports `MainLive` from the executable entrypoint; `cliBlessed.tsx` creates a blessed screen at module import time.
- **Canonical Effect direction:** Split `layers.ts` from `bin.ts`; export `MainLive` from a pure layer module; keep `bin.ts` as the only `NodeRuntime.runMain` module; lazily acquire blessed screen in the `play` command.
- **Rationale:** Avoids import cycles and terminal side effects for non-UI commands/tests.

### 10. Blessed screen lifecycle is unmanaged

- **Evidence:** `packages/cli/src/Cli.ts:18`; `packages/cli/src/cliBlessed.tsx:8-27`.
- **Current pattern:** `startblessed()` is wrapped in `Effect.sync`, registers global keys, and calls `process.exit`.
- **Canonical Effect direction:** Model blessed as a scoped effect: acquire screen/render, register keys with finalizers, keep process alive with `Effect.never`, and release via `screen.destroy()` / unmount on interruption. Let `NodeRuntime.runMain` handle shutdown.
- **Rationale:** Gives cleanup, cancellation, and signal behavior to the Effect runtime.

### 11. CLI UI repeatedly provides/runs Effects in render/callbacks

- **Evidence:** `packages/cli/src/components/BPlaying.tsx:105-111`, `:125-151`, `:158-176`.
- **Current pattern:** Component code repeatedly does `Effect.provide(MainLive)` + `Effect.runPromise`; initial world fetch is render-time; promises are not supervised/caught.
- **Canonical Effect direction:** Create one app/runtime context with `ManagedRuntime.make(MainLive)` or equivalent. Run from `useEffect`/handlers using runtime methods; prefer `runFork` with cleanup or `runPromiseExit`; wrap React/blessed state mutations in `Effect.sync`.
- **Rationale:** Prevents repeated layer acquisition, render-time side effects, unhandled rejections, and set-state-after-unmount races.

### 12. CLI blessed key handlers are not cleaned up correctly

- **Evidence:** `packages/cli/src/components/BPlaying.tsx:117-156`, `packages/cli/src/components/PickupPopup.tsx:30-66`, `packages/cli/src/components/popup.tsx:30-66`.
- **Current pattern:** Key handlers are registered in React effects; cleanup calls `unkey` with a new function reference.
- **Canonical Effect direction:** Register stable callback references and clean up the same handler; better, wrap key subscriptions in `Effect.acquireRelease` / scoped subscription helpers.
- **Rationale:** Avoids duplicate key actions, stale closures, and leaked listeners.

### 13. Web React code runs Effects during render

- **Evidence:** `packages/web/src/Playing.tsx:87-103`; StrictMode in `packages/web/src/main.tsx:6-9`.
- **Current pattern:** `getWorld.pipe(..., Effect.runPromise)` runs in the component body when world is empty.
- **Canonical Effect direction:** Move initial fetch to `useEffect`; run through a shared runtime; cancel/interrupt on unmount.
- **Rationale:** React rendering must remain pure. StrictMode can double-run this, and re-renders can launch repeated requests.

### 14. Web runtime/layer provisioning is per-call

- **Evidence:** `packages/web/src/GameClient.ts:39-65`; `LiveRuntime` at `:43` is unused.
- **Current pattern:** Each exported client effect is pre-provided with `MainLive`; components then `runPromise` directly.
- **Canonical Effect direction:** Create one `ManagedRuntime.make(MainLive)` at app startup and expose it through React context or hooks. Dispose it on app teardown/HMR.
- **Rationale:** Layers are resource graphs; app-scoped runtime makes finalizers, cancellation, and configuration coherent.

### 15. Web event handlers fire uncancelled/unhandled Effects

- **Evidence:** `packages/web/src/Playing.tsx:114-139`, `:188-194`.
- **Current pattern:** Handlers call `Effect.runPromise` and ignore the returned promise.
- **Canonical Effect direction:** Wrap each user intent as a single Effect, handle failure with `catchTags` / `catchAllCause`, and run with `runFork` plus interruption or `runPromiseExit`.
- **Rationale:** Avoids unhandled promise rejections, racing keypresses, and stale responses overwriting newer state.

### 16. Game mutation and follow-up reads are not composed transactionally in UIs

- **Evidence:** CLI `packages/cli/src/components/BPlaying.tsx:140-151`, `:158-176`; web `packages/web/src/Playing.tsx:127-136`, `:188-194`.
- **Current pattern:** `doAction -> getWorld` and `getInventory` run as separate effects/promises; pickup/drop often hide popups without refreshing world/inventory.
- **Canonical Effect direction:** Compose one program: perform mutation, then `Effect.all({ world: getWorld, inventory: getInventory, logs: getLogs })`, then update UI state together. Serialize rapid keypresses with `Queue`, `Semaphore`, or in-flight state.
- **Rationale:** Prevents inconsistent UI state and stale inventory/world after mutations.

---

## P2 / medium priority

### 17. `Effect.promise` wraps synchronous AI computation

- **Evidence:** `packages/server/src/ai/ai.ts:54-68`.
- **Current pattern:** Pure AI planning uses `promise(async () => ...)` and TODO concurrency.
- **Canonical Effect direction:** Use `Effect.sync` / `Effect.succeed` for synchronous planning, or `Effect.forEach(HashMap.values(w), plan, { concurrency })` when planning becomes effectful.
- **Rationale:** Avoids unnecessary Promise boundaries and makes concurrency explicit.

### 18. Multi-step server workflows would be clearer with `Effect.gen`

- **Evidence:** `packages/server/src/gameloop.ts:78-127`; `packages/server/src/ai/ai.ts:59-70`; `packages/server/src/GameRepository.ts:14-29`.
- **Current pattern:** Long `pipe(...Effect.andThen...)` chains, including simple value wrapping.
- **Canonical Effect direction:** Prefer `Effect.gen` for workflows with state, logging, Option/error conversion, and services; use `Effect.map` for pure transforms.
- **Rationale:** Easier to read, type, and extend with typed errors/services.

### 19. `Option` failures are converted implicitly/generically

- **Evidence:** `packages/server/src/gameloop.ts:147-155` catches `NoSuchElementException` after treating an `Option` like an effect.
- **Current pattern:** Generic Option failure is caught and replaced with empty `HashMap`.
- **Canonical Effect direction:** Use `Effect.fromOption(() => new EntityNotFound({ key }))` or explicit `Option.match`.
- **Rationale:** Preserves useful domain error detail.

### 20. Mixed boolean/Option style and silent no-ops in state updates

- **Evidence:** `packages/server/src/gamestate.ts:29`, `:38-59`; `packages/server/src/items.ts:43-55`; `packages/server/src/world.ts:62-82`.
- **Current pattern:** Mixed truthy checks, nested `Option.match`, and updates that silently preserve old state on `None`.
- **Canonical Effect direction:** Use `Option.some/none`, `Option.flatMap`, `Option.all`, and explicit `Option.match`; make commands return typed `Effect` errors for missing entities/invalid actions.
- **Rationale:** Makes impossible states and invalid updates visible instead of silently ignored.

### 21. Dijkstra/pathfinding mutates objects and recurses unsafely

- **Evidence:** `packages/server/src/worldUtil.ts:32-61`, `:104-114`.
- **Current pattern:** Recursive `unsafe_dijkstra`, mutable `obj.dist`, `forEach`, `while`, mutable path.
- **Canonical Effect direction:** Keep a pure immutable `HashMap` distance state, or model the loop with `Effect.loop` / `Effect.iterate` and occasional yielding if maps become large.
- **Rationale:** Avoids mutation inside immutable collections, stack risk, and non-interruptible CPU work.

### 22. Import-time computation and console side effects exist in server modules

- **Evidence:** `packages/server/src/gameloop.ts:47-66`; `packages/server/src/testBSP.ts:3`, `:13-15`; `packages/server/src/testDrawUtils.ts:7`.
- **Current pattern:** Level generation and `console.log` happen at module import/test helper import time.
- **Canonical Effect direction:** Move initialization into Layers/effects; use `Effect.log` in runnable programs or tests only.
- **Rationale:** Keeps modules referentially transparent and easier to test.

### 23. Runtime configuration is hard-coded

- **Evidence:** server port in `packages/server/src/server.ts:11`; CLI/web base URLs in `packages/cli/src/GameClient.ts:12-14`, `packages/web/src/GameClient.ts:14-16`.
- **Current pattern:** `3000` and `http://localhost:3000` are compiled into code.
- **Canonical Effect direction:** Use `Config` or a small `GameClientConfig` service/layer, with CLI options and Vite env bridging as needed.
- **Rationale:** Makes local/dev/prod/test runtime configuration explicit and Effect-native.

### 24. Effect collections are mixed with Immutable.js and plain arrays without clear boundaries

- **Evidence:** server `packages/server/src/gameloop.ts:48-50`, `packages/server/src/worldUtil.ts:71-83`; CLI/web components and utilities use Effect `HashMap`, `immutable`, `scala-ts/UndefOr`.
- **Current pattern:** Repeated conversions among Effect collections, Immutable.js collections, arrays, and nullable values.
- **Canonical Effect direction:** Standardize on Effect `HashMap`/`HashSet`/`Chunk` in domain/application code, and convert to plain arrays/objects only at UI rendering boundaries.
- **Rationale:** Reduces semantic drift, equality/hash surprises, and conversion overhead.

### 25. `conforms` reparses schemas and is typed unsafely

- **Evidence:** `packages/domain/src/schemas.ts:291-297`; used by hot-path guards in `packages/server/src/world.ts:46-50` and `packages/server/src/terrain.ts:18`.
- **Current pattern:** `conforms` uses `Schema.validateEither` for type guards and narrows to the encoded type for transformed schemas.
- **Canonical Effect direction:** Use `Schema.is(schema)` directly or type helper as `<A, I>(schema: Schema.Schema<A, I, never>) => (u: unknown) => u is A`; use simple `_tag` guards on hot paths.
- **Rationale:** Better typing and less parse/Either allocation in collision/pathfinding loops.

### 26. Schema composition helpers fight canonical Effect Schema constructors

- **Evidence:** `packages/domain/src/util.ts:6-17`, `:41-52`; `packages/domain/src/schemas.ts:14-21`, `:68-77`.
- **Current pattern:** `allof` / `bothof` wrap `Schema.extend`; comments note this prevents `.make`.
- **Canonical Effect direction:** Prefer direct `Schema.Struct`, `Schema.TaggedStruct`, `Schema.Class`, or field spreading for entity variants. Reserve `Schema.extend` for intentional intersections.
- **Rationale:** Struct/tagged constructors are more readable, generate better types, and preserve `.make` validation/default semantics.

### 27. Entity location model is inconsistent

- **Evidence:** `packages/domain/src/schemas.ts:55-58`, `:68-72`; `packages/server/src/entity.ts:17-22`.
- **Current pattern:** `Location = oneof(Contain, Position)` exists, but `EntityBase = allof(Keyed, Position, Contain)` requires both `at` and `in`.
- **Canonical Effect direction:** If all entities intentionally have both physical position and container, document it and remove dead `Location`; otherwise model `{ loc: Location }` as a tagged union or mutually exclusive shape.
- **Rationale:** Makes containment vs world position semantics representable in the type system.

### 28. Action schemas mix plain tagged structs and `Schema.Data`

- **Evidence:** `packages/domain/src/schemas.ts:253-272`; API uses `SAction` in `packages/domain/src/GameApi.ts:25-26`.
- **Current pattern:** `SAction` is plain tagged structs; `SEAction = S.Data(SAction)` and `EAction` typed from it are defined, but `SEAction` is mostly unused.
- **Canonical Effect direction:** Choose one representation: plain tagged structs plus `Data.taggedEnum<Action>()`, or use `SEAction` as the API payload and export `Action = typeof SEAction.Type`.
- **Rationale:** Avoids ambiguity about whether decoded actions are plain objects or Effect Data values.

### 29. API `HashMap` response shape should be an intentional choice

- **Evidence:** `packages/domain/src/schemas.ts:299`; `packages/domain/src/GameApi.ts:12-21`.
- **Current pattern:** API returns `Schema.HashMap` for world/inventory/pickup items.
- **Canonical Effect direction:** Preserve this if all clients are Effect clients. If external JSON consumers are intended, expose DTOs with `Schema.Record({ key, value })` or explicit arrays and transform at the boundary.
- **Rationale:** `Schema.HashMap` encodes as tuples, not a plain JSON object keyed by entity id.

### 30. API path/query parameters can be more idiomatic

- **Evidence:** `packages/domain/src/GameApi.ts:20-22`.
- **Current pattern:** `getPickupItemsFor` uses path `"/getPickupFor"` with URL params `{ key }`.
- **Canonical Effect direction:** If `key` identifies a resource, prefer a path parameter (`/pickup/:key`) with the platform's path-param schema support. Keep query params only if it is query-like.
- **Rationale:** Clearer HTTP contract and generated client ergonomics.

### 31. API has no typed error schemas

- **Evidence:** `packages/domain/src/GameApi.ts:7-27`; client call sites do not handle typed API failures.
- **Current pattern:** Endpoints define successes but no expected errors.
- **Canonical Effect direction:** Add `addError` schemas for expected domain/API failures and handle them in CLI/web clients.
- **Rationale:** Lets `HttpApiClient` carry typed failures instead of generic transport/parse errors.

### 32. React/blessed state setters are hidden inside Effect chains

- **Evidence:** CLI `packages/cli/src/components/BPlaying.tsx:105-151`; web `packages/web/src/Playing.tsx:100`, `:119`, `:129`, `:135`, `:190-192`.
- **Current pattern:** Directly passing `setWorld`, `setInventory`, etc. to `Effect.andThen`.
- **Canonical Effect direction:** Use `Effect.tap((value) => Effect.sync(() => setWorld(value)))`, or run the effect to an `Exit` and update state outside Effect.
- **Rationale:** Makes the React/blessed UI side-effect boundary explicit.

### 33. Keyboard input is loosely typed and unknown keys become API calls

- **Evidence:** CLI `packages/cli/src/components/BPlaying.tsx:42-62`; web `packages/web/src/Playing.tsx:42-63`; `PickupPopup.tsx` event handlers use `any`/numeric key codes.
- **Current pattern:** `parseInput` defaults to `EAction.noop()`, so unrecognized keys can still trigger network work.
- **Canonical Effect direction:** Decode keyboard input to `Option<Action>` or `Either<InputError, Action>`; only call the API for `Some(action)`; use `Match`/schema-like decoders for event boundaries.
- **Rationale:** Avoids accidental no-op requests and clarifies UI command handling.

### 34. Popup selection state starts with an invalid sentinel

- **Evidence:** CLI `packages/cli/src/components/PickupPopup.tsx:20`, `packages/cli/src/components/popup.tsx:20`; web `packages/web/src/PickupPopup.tsx:21`.
- **Current pattern:** `marked` initializes to `["asdf"]`.
- **Canonical Effect direction:** Start with `[]` or an Effect `HashSet<Key>`; validate selected keys before `pickupMulti` / `dropMulti`.
- **Rationale:** Prevents bogus API actions.

### 35. Browser client provides server CORS middleware

- **Evidence:** `packages/web/src/GameClient.ts:39-42`; server CORS is in `packages/server/src/server.ts:8-13`.
- **Current pattern:** Web client layer includes `HttpApiBuilder.middlewareCors()`.
- **Canonical Effect direction:** Remove CORS middleware from browser client layers. Keep CORS on the server; configure browser request options via HTTP client if needed.
- **Rationale:** CORS middleware is a server concern.

### 36. Web build externalizes shared domain schemas

- **Evidence:** `packages/web/vite.config.ts:7-11`; browser code imports `@flaghack/domain/schemas` and `GameApi`.
- **Current pattern:** Rollup externalizes a package subpath needed at runtime for API codecs.
- **Canonical Effect direction:** Bundle shared domain schemas into the web app via workspace alias/source, or intentionally publish/serve them with import maps.
- **Rationale:** Browser `HttpApiClient` needs runtime schemas for encode/decode.

### 37. Web package is inconsistently in the workspace graph

- **Evidence:** root `package.json:6-8` includes `packages/*`; `pnpm-workspace.yaml:1-4` omits web; root `tsconfig.json:4-9` references web; root `tsconfig.build.json:4-8` excludes web; `vitest.workspace.ts:13-17` includes packages.
- **Current pattern:** Web is partly included and partly excluded.
- **Canonical Effect direction:** Decide whether `web` is first-class. If yes, add it to pnpm workspace and root build/test/lint. If no, remove it from root TS/Vitest conventions.
- **Rationale:** Platform-specific Effect layers stay correct only if browser/node packages participate consistently.

### 38. Effect ESLint rules do not cover the full repo

- **Evidence:** root `eslint.config.mjs:24-29`, `:107-118`; root lint script in `package.json:20` excludes TSX/JS config/web files; `packages/web/eslint.config.js:7-28` lacks Effect rules.
- **Current pattern:** Effect/dprint linting applies unevenly.
- **Canonical Effect direction:** Use one flat ESLint policy with package overrides, include `**/*.{ts,tsx,js,mjs}`, and add browser/React globals only where needed.
- **Rationale:** Current TSX code contains Effect/style drift that configured rules cannot see.

### 39. `@effect/vitest` is installed but tests are only dummies

- **Evidence:** `setupTests.ts:1-3`; `packages/*/test/Dummy.test.ts:3-7`; `vitest.shared.ts:29-33` aliases are unscoped.
- **Current pattern:** Equality testers are installed, but no Effect/layer/schema tests exist.
- **Canonical Effect direction:** Add `it.effect`, `it.scoped`, `it.layer`, schema roundtrip tests with `Schema.decodeUnknownEither`, service tests with test layers, and aliases aligned with `@flaghack/*` imports.
- **Rationale:** Effect code should be tested through typed failures, layers, scopes, and service substitution.

### 40. Client services are duplicated between CLI and web

- **Evidence:** `packages/cli/src/GameClient.ts:8-35`; `packages/web/src/GameClient.ts:10-37`.
- **Current pattern:** Nearly identical `GameClient` services with hard-coded base URLs and different platform layers.
- **Canonical Effect direction:** Share one protocol/client service in a common package; inject base URL via Config/service; provide only transport layers (`NodeHttpClient` vs `BrowserHttpClient`) at app entry.
- **Rationale:** Prevents CLI/web drift and enables reusable tests.

### 41. Shared UI/domain utilities are duplicated

- **Evidence:** `packages/cli/src/util.ts:1-105` and `packages/web/src/util.ts:1-105`; tile/color logic in `packages/cli/src/components/BGameBoard.tsx:14-40`, `packages/web/src/GameBoard.tsx:27-60`, `packages/domain/src/display.ts:31-45`; drawWorld logic in `packages/cli/src/components/BPlaying.tsx:23-90`, `packages/web/src/Playing.tsx:25-84`.
- **Current pattern:** Render-independent game-display logic is copied per client.
- **Canonical Effect direction:** Move `Tile`, `Tiles`, `drawWorld`, matrix/layering, and key decoding to domain or a shared UI-model package; keep blessed/browser rendering platform-specific.
- **Rationale:** Reduces drift and lets `@effect/vitest` cover shared rendering once.

### 42. Dependency declarations are noisy and version-skew-prone

- **Evidence:** `"latest"` Effect deps in `packages/domain/package.json:26-29`, `packages/server/package.json:23-33`, `packages/cli/package.json:28-54`, `packages/web/package.json:12-27`; unused `@effect/sql` in domain; tools such as `typescript-language-server` as runtime deps in web.
- **Current pattern:** Floating versions, duplicated runtime/dev dependencies, and unused deps.
- **Canonical Effect direction:** Pin Effect-family packages via pnpm catalog/overrides, keep runtime deps only where imported by shipped code, and keep tools/types in root/package devDeps.
- **Rationale:** Effect packages are tightly coupled; floating/duplicated deps increase version skew and package size.

---

## P3 / lower priority and cleanup

### 43. `display.ts` hides type errors with casts and naming collisions

- **Evidence:** `packages/domain/src/display.ts:1-3`, `:31-73`.
- **Current pattern:** Imports `Entity` value and defines `type Entity` with the same name; `EEntity.$match` result is cast `as Tile`.
- **Canonical Effect direction:** Alias schema imports (`Entity as EntitySchema`) and type the match return so each branch satisfies `Tile` without a cast.
- **Rationale:** Preserves exhaustive checking and catches invalid glyph/color payloads.

### 44. Wall variant rendering is not exhaustive

- **Evidence:** `packages/domain/src/display.ts:3-29`; variants in `packages/domain/src/schemas.ts:190-203`.
- **Current pattern:** Default branch handles `"none"` and any future variant.
- **Canonical Effect direction:** Use explicit cases with a `never` fallback or Effect `Match`.
- **Rationale:** Future variants should fail visibly instead of rendering as a blank.

### 45. Broad strings/numbers should be branded/refined where they are domain concepts

- **Evidence:** `packages/domain/src/schemas.ts:46-52`, `:233-242`, `:299`.
- **Current pattern:** `Key` is plain `String`; positions are broad numbers.
- **Canonical Effect direction:** Use `Schema.Int` / finite number refinements for coordinates, and `Schema.String.pipe(Schema.brand("EntityKey"))` for entity keys.
- **Rationale:** Prevents mixing arbitrary strings/numbers with domain identifiers and coordinates.

### 46. Public schemas lack identifiers/annotations

- **Evidence:** public schemas throughout `packages/domain/src/schemas.ts` and API contracts in `packages/domain/src/GameApi.ts`.
- **Current pattern:** Few/no `.annotations({ identifier })` on API-facing schemas.
- **Canonical Effect direction:** Add identifiers to `Pos`, `Entity`, `SAction`/`SEAction`, `World`, `GameState`, and error schemas.
- **Rationale:** Improves parse errors, generated docs/OpenAPI, and debugging.

### 47. Schema helper wrappers obscure canonical Effect APIs

- **Evidence:** `packages/domain/src/util.ts:54-72`; `packages/domain/src/stats.ts` uses `collect`, `prop`, `number`, `boolean` heavily.
- **Current pattern:** Custom wrappers hide `Schema.Struct`, `Schema.Number.pipe(Schema.between(...))`, `Schema.Union`, and derived schemas.
- **Canonical Effect direction:** Prefer direct Effect Schema combinators unless a helper adds clear domain value.
- **Rationale:** More idiomatic, easier to search, and easier for maintainers to understand.

### 48. Stats schema has copy/paste bugs that tests should catch

- **Evidence:** `packages/domain/src/stats.ts:12`, `:50`, `:57-59`.
- **Current pattern:** `Wisdom` uses `"charisma"`; `AllStates/AnyState` collect `Fixed/Wet`; `HungerP` uses `"dhp"`.
- **Canonical Effect direction:** Use explicit `Schema.Struct` field objects for attribute/state/point groups and add schema tests.
- **Rationale:** These are domain correctness bugs and show that helper-heavy schemas are easy to mis-copy.

### 49. Domain package contains presentation mapping

- **Evidence:** `packages/domain/src/display.ts:31-73`.
- **Current pattern:** Domain exports tile colors/glyphs.
- **Canonical Effect direction:** Preserve if `domain` intentionally includes shared rendering metadata; otherwise move to a shared UI-model package.
- **Rationale:** Presentation concerns may not belong in the core API/schema package.

### 50. CLI commands still use template names/descriptions

- **Evidence:** `packages/cli/src/Cli.ts:6-27`.
- **Current pattern:** Root command/name/description are still `todo` / `Todo CLI`; inventory handler does not print useful output.
- **Canonical Effect direction:** Use domain command names, `Console.log` for command output, and CLI options for base URL/player/logging config.
- **Rationale:** More idiomatic `@effect/cli` and observable behavior.

### 51. UI/network error handling needs timeouts, retries, and user-visible failures

- **Evidence:** CLI/web `GameClient` and `runPromise` call sites.
- **Current pattern:** HTTP failures flow to unhandled promises or `runMain` without UI messages.
- **Canonical Effect direction:** Add typed error mapping, `Effect.timeout`, intentional `Schedule` retry where appropriate, and render/log `Cause.pretty` or typed user messages.
- **Rationale:** Server-down/network/parse failures should not silently break terminal/browser state.

### 52. `HttpApiEndpoint` no-content behavior can be preserved intentionally

- **Evidence:** `packages/domain/src/GameApi.ts:24-27`.
- **Current pattern:** `doAction` has payload but no `addSuccess`.
- **Canonical Effect direction:** Preserve if mutation intentionally returns no content; otherwise return updated `GameState`/`World` to reduce follow-up client reads.
- **Rationale:** Effect Platform defaults no-success endpoints to `NoContent`; this is okay if deliberate.

### 53. Root/package docs do not describe the Effect workflow

- **Evidence:** root `README.org` says build may fail; package READMEs are template placeholders.
- **Current pattern:** Docs omit codegen, generated artifact policy, service/layer graph, and check/test/build workflow.
- **Canonical Effect direction:** Document install, codegen, check, lint, test, build, serve; document generated-file policy and the intended service/layer boundaries.
- **Rationale:** Prevents recurrence of stale generated files and inconsistent package conventions.

### 54. Preserve the good Effect patterns already present

- **Shared API contract:** `packages/domain/src/GameApi.ts:5-30` is a good Effect Platform contract-first boundary.
- **Server entrypoint:** `packages/server/src/Api.ts:6-19` and `packages/server/src/server.ts:15-16` keep API handlers and runtime launch in reasonable places.
- **Client service baseline:** `packages/cli/src/GameClient.ts:8-34` and `packages/web/src/GameClient.ts:10-35` use `Effect.Service` and `HttpApiClient.make`, which are good abstraction points.
- **Effect collections:** `Schema.HashMap` / `HashMap` is fine for Effect-only clients; only change the wire shape if non-Effect JSON consumers are expected.
- **Tagged data matching:** `Data.taggedEnum` / `$match` is a good fit for exhaustive action/entity handling; the opportunity is to make schema/data representation consistent.

---

## Suggested implementation order

1. **Generated artifacts/codegen:** remove or regenerate stale `src/schemas/*` artifacts; fix package exports/index generation; add a freshness check.
2. **Server state/log services:** add `GameStateStore` and `GameLogStore` services with `Layer`s; update `GameRepository` to depend on those services.
3. **Typed domain errors:** model missing player/entity/invalid action errors and expose them in `GameApi`.
4. **Action workflow cleanup:** remove `runSync` from reducers; make action handling return `Effect`; use `SynchronizedRef.modifyEffect`.
5. **Client runtime boundaries:** introduce shared client service/config plus app-scoped runtimes for CLI/web; move render-time fetches into effects with cleanup.
6. **Schema cleanup:** replace `allof`/`extend` patterns with explicit structs/tagged structs, fix `stats.ts`, brand keys/positions, and use `Schema.is`.
7. **Testing/lint/docs:** expand `@effect/vitest` coverage, fix ESLint scope, pin deps, and document the canonical workflow.
