import { HttpApiClient } from "@effect/platform"
import { GameApi } from "@flaghack/domain/GameApi"
import { Action, Key } from "@flaghack/domain/schemas"
import { Effect } from "effect"

type Key = typeof Key.Type

export class GameClient
  extends Effect.Service<GameClient>()("cli/GameClient", {
    accessors: true,
    effect: Effect.gen(function*() {
      const client = yield* HttpApiClient.make(GameApi, {
        baseUrl: "http://localhost:3000"
      })

      const getLogs = client.game.getLogs()
      const getInventory = client.game.getInventory()
      const getWorld = client.game.getWorld()
      function getPickupItemsFor(key: Key) {
        return client.game.getPickupItemsFor({ urlParams: { key } })
      }
      function doPlayerAction(action: Action) {
        return client.game.doAction({ payload: { action } })
      }

      return {
        getLogs,
        getWorld,
        getInventory,
        getPickupItemsFor,
        doPlayerAction
      } as const
    })
  })
{}
