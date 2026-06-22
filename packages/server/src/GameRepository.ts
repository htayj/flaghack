import type { Action } from "@flaghack/domain/schemas"
import { Effect, HashMap, Option, Ref } from "effect"
import type { TKey } from "./entity.js"
import {
  actPlayerAction as apiDoPlayerAction,
  confirmSetup as apiConfirmSetup,
  DefaultGameStateStoreLive,
  eGetWorld as apiGetWorld,
  getClientState as apiGetClientState,
  getInventory as apiGetInventory,
  getLootContainersFor as apiGetLootContainersFor,
  getLootItemsFor as apiGetLootItemsFor,
  getPickupItemsFor as apiGetPickupItemsFor,
  selectRoleForSetup as apiSelectRoleForSetup
} from "./gameloop.js"
import { GamePersistence } from "./GamePersistence.js"
import { getPlayer } from "./gamestate.js"
import { GameStateStore } from "./GameStateStore.js"
import { getLogs as apiGetLogs } from "./log.js"
import { measureEffect } from "./perf.js"
import { availableRoles } from "./setup.js"

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
    dependencies: [DefaultGameStateStoreLive],
    scoped: Effect.gen(function*() {
      const store = yield* GameStateStore
      const persistence = yield* GamePersistence
      const lifecycleSemaphore = yield* Effect.makeSemaphore(1)
      const terminalLifecycleRef = yield* Ref.make(false)
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

        const restored = yield* persistence.restoreAndConsume.pipe(
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

      const withRestoredMutationAndSave = <E>(
        effect: Effect.Effect<void, E, GameStateStore>
      ) =>
        ensureRestoredUnlocked.pipe(
          Effect.zipRight(
            isTerminalEmptyState.pipe(
              Effect.flatMap((isTerminalEmpty) =>
                isTerminalEmpty
                  ? Effect.void
                  : withStore(effect).pipe(
                    Effect.tap(() => saveCurrentGameUnlocked)
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
          return
        }

        if (Option.isNone(getPlayer(maybeState.value))) {
          yield* persistence.deleteSave.pipe(Effect.orDie)
          yield* store.reset
          yield* Ref.set(terminalLifecycleRef, true)
          return
        }

        yield* persistence.save(maybeState.value).pipe(Effect.orDie)
        yield* store.reset
        yield* Ref.set(terminalLifecycleRef, true)
      }).pipe(lifecycleSemaphore.withPermits(1))

      const restoreGame = Effect.gen(function*() {
        const restored = yield* persistence.restoreAndConsume.pipe(
          Effect.orDie
        )
        yield* Ref.set(terminalLifecycleRef, false)
        yield* store.reset
        if (Option.isSome(restored)) {
          yield* store.set(restored.value)
        }
      }).pipe(lifecycleSemaphore.withPermits(1))

      const quitGame = Effect.gen(function*() {
        yield* persistence.deleteSave.pipe(Effect.orDie)
        yield* store.reset
        yield* Ref.set(terminalLifecycleRef, true)
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
            Effect.succeed({
              inventory: HashMap.empty(),
              roles: [...availableRoles],
              setup: { phase: "complete" as const },
              world: HashMap.empty()
            })
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
        selectRole(roleId: Parameters<typeof apiSelectRoleForSetup>[0]) {
          return measureEffect(
            {
              operation: "backend.api",
              phase: "selectRole",
              traceId: roleId
            },
            withRestoredMutationAndSave(apiSelectRoleForSetup(roleId))
          )
        },
        confirmSetup(confirm: boolean) {
          return measureEffect(
            {
              counts: { confirm },
              operation: "backend.api",
              phase: "confirmSetup"
            },
            withRestoredMutationAndSave(apiConfirmSetup(confirm))
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
            withRestoredMutationAndSave(apiDoPlayerAction(action))
          )
        }
      } as const
    })
  })
{}
