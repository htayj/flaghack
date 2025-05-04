import { Action } from "@flaghack/domain/schemas"
import { Effect, pipe } from "effect"
import {
  actPlayerAction as apiDoPlayerAction,
  eGetWorld as apiGetWorld,
  getInventory as apiGetInventory
} from "./gameloop.js"
import { getLogs as apiGetLogs } from "./log.js"

export class GameRepository
  extends Effect.Service<GameRepository>()("api/GameRepository", {
    effect: Effect.gen(function*() {
      const getLogs = apiGetLogs
      const getWorld = apiGetWorld
      function doPlayerAction(action: Action) {
        return pipe(
          Effect.succeed(action),
          Effect.andThen(apiDoPlayerAction)
        )
      }
      const getInventory = apiGetInventory("player")

      return {
        getLogs,
        getWorld,
        getInventory,
        doPlayerAction
      } as const
    })
  })
{}
