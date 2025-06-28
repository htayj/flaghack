import { HttpApiBuilder, HttpApiClient } from "@effect/platform"
import { BrowserHttpClient } from "@effect/platform-browser"
import { GameApi } from "@flaghack/domain/GameApi"
import { Key } from "@flaghack/domain/schemas"
import type { Action } from "@flaghack/domain/schemas"
import { Effect, Layer, ManagedRuntime, pipe } from "effect"

type Key = typeof Key.Type

export class GameClient
  extends Effect.Service<GameClient>()("web/GameClient", {
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

export const MainLive = GameClient.Default.pipe(
  Layer.provide(BrowserHttpClient.layerXMLHttpRequest),
  Layer.provide(HttpApiBuilder.middlewareCors())
)
export const LiveRuntime = ManagedRuntime.make(MainLive)

// const apiDoPlayerAction = pipe(GameClient.doPlayerAction, Effect.provide(LiveRuntime))
// const apiDoPlayerAction = pipe(GameClient.doPlayerAction, Effect.provide(MainLive))
export const doPlayerAction = (
  action: Action
) =>
  GameClient.doPlayerAction(action).pipe(
    Effect.provide(MainLive)
  )

export const getLogs = GameClient.getLogs.pipe(
  Effect.provide(MainLive)
)
export const getPickupItemsFor = (key: string) =>
  GameClient.getPickupItemsFor(key).pipe(
    Effect.provide(MainLive)
  )
export const getInventory = GameClient.getInventory.pipe(
  Effect.provide(MainLive)
)
export const getWorld = GameClient.getWorld.pipe(
  Effect.provide(MainLive)
)
