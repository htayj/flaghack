import type {
  ClientStateStreamSource,
  ClientStateStreamTerminal
} from "@flaghack/domain/GameStream"
import type { RoleId } from "@flaghack/domain/roles"
import type { Action } from "@flaghack/domain/schemas"
import { Effect, HashMap, Option, Ref } from "effect"
import type { TKey } from "./entity.js"
import {
  actPlayerAction as apiDoPlayerAction,
  DefaultGameStateStoreLive,
  eGetWorld as apiGetWorld,
  getClientState as apiGetClientState,
  getInventory as apiGetInventory,
  getLootContainersFor as apiGetLootContainersFor,
  getLootItemsFor as apiGetLootItemsFor,
  getPickupItemsFor as apiGetPickupItemsFor
} from "./gameloop.js"
import { GamePersistence } from "./GamePersistence.js"
import type { GameState } from "./gamestate.js"
import { getPlayer } from "./gamestate.js"
import { GameStateStore } from "./GameStateStore.js"
import { GameUpdateHub } from "./GameUpdateHub.js"
import { getLogs as apiGetLogs } from "./log.js"
import { measureEffect } from "./perf.js"
import {
  availableRoles,
  confirmSetupForGameState,
  selectRoleForGameState
} from "./setup.js"

type AutosaveRegistration = () => Effect.Effect<void>
type UnregisterAutosave = () => void

const autosaveRegistrations = new Set<AutosaveRegistration>()

const registerAutosaveOnShutdown = (
  autosave: AutosaveRegistration
): UnregisterAutosave => {
  autosaveRegistrations.add(autosave)
  return () => {
    autosaveRegistrations.delete(autosave)
  }
}

export const runRegisteredAutosaves = Effect.gen(function*() {
  const registrations = yield* Effect.sync(() =>
    Array.from(autosaveRegistrations)
  )
  yield* Effect.forEach(registrations, (autosave) => autosave(), {
    discard: true
  })
})

export class GameRepository
  extends Effect.Service<GameRepository>()("api/GameRepository", {
    dependencies: [DefaultGameStateStoreLive, GameUpdateHub.Default],
    scoped: Effect.gen(function*() {
      const store = yield* GameStateStore
      const persistence = yield* GamePersistence
      const updateHub = yield* GameUpdateHub
      const lifecycleSemaphore = yield* Effect.makeSemaphore(1)
      const terminalLifecycleRef = yield* Ref.make(false)
      const terminalLifecycleKindRef = yield* Ref.make<
        ClientStateStreamTerminal | undefined
      >(undefined)
      const withStore = <A, E>(
        effect: Effect.Effect<A, E, GameStateStore>
      ): Effect.Effect<A, E> =>
        Effect.provideService(effect, GameStateStore, store)

      const isTerminalEmptyState = Effect.gen(function*() {
        const terminalLifecycle = yield* Ref.get(terminalLifecycleRef)
        if (!terminalLifecycle) return false

        const currentState = yield* store.peek
        return Option.isNone(currentState)
      })

      const ensureRestoredUnlocked = Effect.gen(function*() {
        const currentState = yield* store.peek
        if (Option.isSome(currentState)) return

        const terminalLifecycle = yield* Ref.get(terminalLifecycleRef)
        if (terminalLifecycle) return

        const restored = yield* persistence.restorePreserving.pipe(
          Effect.orDie
        )
        if (Option.isSome(restored)) {
          yield* store.set(restored.value)
        }
      })

      const withRestoredStore = <A, E>(
        effect: Effect.Effect<A, E, GameStateStore>,
        fallback: Effect.Effect<A>
      ) =>
        ensureRestoredUnlocked.pipe(
          Effect.zipRight(
            isTerminalEmptyState.pipe(
              Effect.flatMap((isTerminalEmpty) =>
                isTerminalEmpty ? fallback : withStore(effect)
              )
            )
          ),
          lifecycleSemaphore.withPermits(1)
        )

      const emptyClientState = {
        inventory: HashMap.empty(),
        roles: [...availableRoles],
        setup: { phase: "complete" as const },
        world: HashMap.empty()
      }

      const getClientStateUnlocked = isTerminalEmptyState.pipe(
        Effect.flatMap((isTerminalEmpty) =>
          isTerminalEmpty
            ? Effect.succeed(emptyClientState)
            : withStore(apiGetClientState)
        )
      )

      const publishClientStateUnlocked = (
        source: ClientStateStreamSource,
        terminal?: ClientStateStreamTerminal | undefined
      ) =>
        getClientStateUnlocked.pipe(
          Effect.flatMap((clientState) =>
            updateHub.publishClientState(source, clientState, terminal)
          ),
          Effect.asVoid
        )

      const saveCurrentGameUnlocked = Effect.gen(function*() {
        const currentState = yield* store.peek
        if (Option.isNone(currentState)) return

        if (Option.isSome(getPlayer(currentState.value))) {
          yield* persistence.save(currentState.value).pipe(Effect.orDie)
        } else {
          yield* persistence.deleteSave.pipe(Effect.orDie)
        }
      })

      const saveCurrentGame = saveCurrentGameUnlocked.pipe(
        lifecycleSemaphore.withPermits(1)
      )

      const deleteSaveIfPlayerMissingUnlocked = Effect.gen(function*() {
        const currentState = yield* store.peek
        if (
          Option.isSome(currentState)
          && Option.isNone(getPlayer(currentState.value))
        ) {
          yield* persistence.deleteSave.pipe(Effect.orDie)
        }
      })

      const withRestoredMutationWithoutAutosave = <E>(
        source: ClientStateStreamSource,
        effect: Effect.Effect<void, E, GameStateStore>
      ) =>
        ensureRestoredUnlocked.pipe(
          Effect.zipRight(
            isTerminalEmptyState.pipe(
              Effect.flatMap((isTerminalEmpty) =>
                isTerminalEmpty
                  ? Effect.void
                  : withStore(effect).pipe(
                    Effect.tap(() => deleteSaveIfPlayerMissingUnlocked),
                    Effect.tap(() => publishClientStateUnlocked(source))
                  )
              )
            )
          ),
          lifecycleSemaphore.withPermits(1)
        )

      const withRestoredTransformAndSaveIfChanged = (
        source: ClientStateStreamSource,
        transform: (state: GameState) => GameState
      ) =>
        ensureRestoredUnlocked.pipe(
          Effect.zipRight(
            isTerminalEmptyState.pipe(
              Effect.flatMap((isTerminalEmpty) =>
                isTerminalEmpty
                  ? Effect.void
                  : store.modifyEffect((state) => {
                    const nextState = transform(state)
                    return Effect.succeed(
                      [
                        nextState !== state,
                        nextState
                      ] as const
                    )
                  }).pipe(
                    Effect.flatMap((changed) =>
                      changed
                        ? saveCurrentGameUnlocked.pipe(
                          Effect.zipRight(
                            publishClientStateUnlocked(source)
                          )
                        )
                        : deleteSaveIfPlayerMissingUnlocked
                    )
                  )
              )
            )
          ),
          lifecycleSemaphore.withPermits(1)
        )

      const saveGame = Effect.gen(function*() {
        yield* ensureRestoredUnlocked
        const maybeState = yield* store.peek
        if (Option.isNone(maybeState)) {
          yield* Ref.set(terminalLifecycleRef, true)
          yield* Ref.set(terminalLifecycleKindRef, "save")
          yield* publishClientStateUnlocked("save", "save")
          return
        }

        if (Option.isNone(getPlayer(maybeState.value))) {
          yield* persistence.deleteSave.pipe(Effect.orDie)
          yield* store.reset
          yield* Ref.set(terminalLifecycleRef, true)
          yield* Ref.set(terminalLifecycleKindRef, "save")
          yield* publishClientStateUnlocked("save", "save")
          return
        }

        yield* persistence.save(maybeState.value).pipe(Effect.orDie)
        yield* store.reset
        yield* Ref.set(terminalLifecycleRef, true)
        yield* Ref.set(terminalLifecycleKindRef, "save")
        yield* publishClientStateUnlocked("save", "save")
      }).pipe(lifecycleSemaphore.withPermits(1))

      const restoreGame = Effect.gen(function*() {
        const restored = yield* persistence.restoreAndConsume.pipe(
          Effect.orDie
        )
        yield* Ref.set(terminalLifecycleRef, false)
        yield* Ref.set(terminalLifecycleKindRef, undefined)
        yield* store.reset
        if (Option.isSome(restored)) {
          yield* store.set(restored.value)
        }
        yield* publishClientStateUnlocked("restore")
      }).pipe(lifecycleSemaphore.withPermits(1))

      const quitGame = Effect.gen(function*() {
        yield* persistence.deleteSave.pipe(Effect.orDie)
        yield* store.reset
        yield* Ref.set(terminalLifecycleRef, true)
        yield* Ref.set(terminalLifecycleKindRef, "quit")
        yield* publishClientStateUnlocked("quit", "quit")
      }).pipe(lifecycleSemaphore.withPermits(1))

      const autosaveOnShutdown = saveCurrentGame
      const unregisterAutosave = registerAutosaveOnShutdown(() =>
        autosaveOnShutdown
      )

      yield* Effect.addFinalizer(() =>
        autosaveOnShutdown.pipe(
          Effect.catchAllCause(() => Effect.void),
          Effect.zipRight(Effect.sync(unregisterAutosave))
        )
      )

      return {
        getLogs: measureEffect(
          { operation: "backend.api", phase: "getLogs" },
          apiGetLogs
        ),
        getWorld: measureEffect(
          {
            counts: (world) => ({ worldSize: HashMap.size(world) }),
            operation: "backend.api",
            phase: "getWorld"
          },
          withRestoredStore(apiGetWorld, Effect.succeed(HashMap.empty()))
        ),
        getInventory: measureEffect(
          {
            counts: (inventory) => ({
              itemCount: HashMap.size(inventory)
            }),
            operation: "backend.api",
            phase: "getInventory"
          },
          withRestoredStore(
            apiGetInventory("player"),
            Effect.succeed(HashMap.empty())
          )
        ),
        getClientState: measureEffect(
          {
            counts: (state) => ({
              itemCount: HashMap.size(state.inventory),
              roleCount: state.roles.length,
              worldSize: HashMap.size(state.world)
            }),
            operation: "backend.api",
            phase: "getClientState"
          },
          withRestoredStore(
            apiGetClientState,
            Effect.succeed(emptyClientState)
          )
        ),
        saveGame: measureEffect(
          { operation: "backend.api", phase: "saveGame" },
          saveGame
        ),
        restoreGame: measureEffect(
          { operation: "backend.api", phase: "restoreGame" },
          restoreGame
        ),
        quitGame: measureEffect(
          { operation: "backend.api", phase: "quitGame" },
          quitGame
        ),
        autosaveOnShutdown: measureEffect(
          { operation: "backend.api", phase: "autosaveOnShutdown" },
          autosaveOnShutdown
        ),
        clientStateEvents: updateHub.clientStateEvents,
        getClientStateStreamSnapshot: measureEffect(
          {
            counts: (event) => ({
              revision: event.revision,
              worldSize: HashMap.size(event.clientState.world)
            }),
            operation: "backend.api",
            phase: "getClientStateStreamSnapshot"
          },
          ensureRestoredUnlocked.pipe(
            Effect.zipRight(getClientStateUnlocked),
            Effect.flatMap((clientState) =>
              Ref.get(terminalLifecycleKindRef).pipe(
                Effect.flatMap((terminal) =>
                  updateHub.makeClientStateEvent(
                    "initial",
                    clientState,
                    terminal
                  )
                )
              )
            ),
            lifecycleSemaphore.withPermits(1)
          )
        ),
        selectRole(roleId: RoleId) {
          return measureEffect(
            {
              operation: "backend.api",
              phase: "selectRole",
              traceId: roleId
            },
            withRestoredTransformAndSaveIfChanged(
              "setup",
              (state) => selectRoleForGameState(state, roleId)
            )
          )
        },
        confirmSetup(confirm: boolean) {
          return measureEffect(
            {
              counts: { confirm },
              operation: "backend.api",
              phase: "confirmSetup"
            },
            withRestoredTransformAndSaveIfChanged(
              "setup",
              (state) => confirmSetupForGameState(state, confirm)
            )
          )
        },
        getPickupItemsFor(k: TKey) {
          return measureEffect(
            {
              counts: (items) => ({ itemCount: HashMap.size(items) }),
              operation: "backend.api",
              phase: "getPickupItemsFor",
              traceId: k
            },
            withRestoredStore(
              apiGetPickupItemsFor(k),
              Effect.succeed(HashMap.empty())
            )
          )
        },
        getLootContainersFor(k: TKey) {
          return measureEffect(
            {
              counts: (containers) => ({
                containerCount: HashMap.size(containers)
              }),
              operation: "backend.api",
              phase: "getLootContainersFor",
              traceId: k
            },
            withRestoredStore(
              apiGetLootContainersFor(k),
              Effect.succeed(HashMap.empty())
            )
          )
        },
        getLootItemsFor(k: TKey, containerKey: TKey) {
          return measureEffect(
            {
              counts: (items) => ({ itemCount: HashMap.size(items) }),
              operation: "backend.api",
              phase: "getLootItemsFor",
              traceId: containerKey
            },
            withRestoredStore(
              apiGetLootItemsFor(k, containerKey),
              Effect.succeed(HashMap.empty())
            )
          )
        },
        doPlayerAction(action: Action) {
          return measureEffect(
            {
              operation: "backend.api",
              phase: "doPlayerAction",
              traceId: action._tag
            },
            withRestoredMutationWithoutAutosave(
              "action",
              apiDoPlayerAction(action)
            )
          )
        }
      } as const
    })
  })
{}
