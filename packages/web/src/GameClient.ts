import { HttpApiClient } from "@effect/platform"
import { BrowserHttpClient } from "@effect/platform-browser"
import { GameApi } from "@flaghack/domain/GameApi"
import type { Action, Key } from "@flaghack/domain/schemas"
import { Effect, Layer, ManagedRuntime } from "effect"
import { resolveWebApiBaseUrl } from "./config.js"

type Key = typeof Key.Type

export class GameClient
  extends Effect.Service<GameClient>()("web/GameClient", {
    accessors: true,
    effect: Effect.gen(function*() {
      const client = yield* HttpApiClient.make(GameApi, {
        baseUrl: resolveWebApiBaseUrl(import.meta.env)
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
  Layer.provide(BrowserHttpClient.layerXMLHttpRequest)
)
export const LiveRuntime = ManagedRuntime.make(MainLive)

export const doPlayerAction = GameClient.doPlayerAction
export const getLogs = GameClient.getLogs
export const getPickupItemsFor = GameClient.getPickupItemsFor
export const getInventory = GameClient.getInventory
export const getWorld = GameClient.getWorld
