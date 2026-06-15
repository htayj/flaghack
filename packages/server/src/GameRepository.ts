import type { Action } from "@flaghack/domain/schemas"
import { Effect } from "effect"
import type { TKey } from "./entity.js"
import {
  actPlayerAction as apiDoPlayerAction,
  DefaultGameStateStoreLive,
  eGetWorld as apiGetWorld,
  getInventory as apiGetInventory,
  getPickupItemsFor as apiGetPickupItemsFor
} from "./gameloop.js"
import { GameStateStore } from "./GameStateStore.js"
import { getLogs as apiGetLogs } from "./log.js"

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
        getLogs: apiGetLogs,
        getWorld: withStore(apiGetWorld),
        getInventory: withStore(apiGetInventory("player")),
        getPickupItemsFor(k: TKey) {
          return withStore(apiGetPickupItemsFor(k))
        },
        doPlayerAction(action: Action) {
          return withStore(apiDoPlayerAction(action))
        }
      } as const
    })
  })
{}
