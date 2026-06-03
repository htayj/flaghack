import type { Action } from "@flaghack/domain/schemas"
import { Effect } from "effect"
import type { TKey } from "./entity.js"
import {
  actPlayerAction as apiDoPlayerAction,
  eGetWorld as apiGetWorld,
  getInventory as apiGetInventory,
  getPickupItemsFor as apiGetPickupItemsFor
} from "./gameloop.js"
import { getLogs as apiGetLogs } from "./log.js"

export class GameRepository
  extends Effect.Service<GameRepository>()("api/GameRepository", {
    effect: Effect.succeed(
      {
        getLogs: apiGetLogs,
        getWorld: apiGetWorld,
        getInventory: apiGetInventory("player"),
        getPickupItemsFor(k: TKey) {
          return apiGetPickupItemsFor(k)
        },
        doPlayerAction(action: Action) {
          return apiDoPlayerAction(action)
        }
      } as const
    )
  })
{}
