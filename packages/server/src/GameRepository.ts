import type { Action } from "@flaghack/domain/schemas"
import { Effect, HashMap } from "effect"
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
import { GameStateStore } from "./GameStateStore.js"
import { getLogs as apiGetLogs } from "./log.js"
import { measureEffect } from "./perf.js"

export class GameRepository
  extends Effect.Service<GameRepository>()("api/GameRepository", {
    dependencies: [DefaultGameStateStoreLive],
    effect: Effect.gen(function*() {
      const store = yield* GameStateStore
      const withStore = <A, E>(
        effect: Effect.Effect<A, E, GameStateStore>
      ): Effect.Effect<A, E> =>
        Effect.provideService(effect, GameStateStore, store)

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
          withStore(apiGetWorld)
        ),
        getInventory: measureEffect(
          {
            counts: (inventory) => ({
              itemCount: HashMap.size(inventory)
            }),
            operation: "backend.api",
            phase: "getInventory"
          },
          withStore(apiGetInventory("player"))
        ),
        getClientState: measureEffect(
          {
            counts: (state) => ({
              itemCount: HashMap.size(state.inventory),
              worldSize: HashMap.size(state.world)
            }),
            operation: "backend.api",
            phase: "getClientState"
          },
          withStore(apiGetClientState)
        ),
        getPickupItemsFor(k: TKey) {
          return measureEffect(
            {
              counts: (items) => ({ itemCount: HashMap.size(items) }),
              operation: "backend.api",
              phase: "getPickupItemsFor",
              traceId: k
            },
            withStore(apiGetPickupItemsFor(k))
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
            withStore(apiGetLootContainersFor(k))
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
            withStore(apiGetLootItemsFor(k, containerKey))
          )
        },
        doPlayerAction(action: Action) {
          return measureEffect(
            {
              operation: "backend.api",
              phase: "doPlayerAction",
              traceId: action._tag
            },
            withStore(apiDoPlayerAction(action))
          )
        }
      } as const
    })
  })
{}
