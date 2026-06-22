import { HttpApiClient } from "@effect/platform"
import { BrowserHttpClient } from "@effect/platform-browser"
import { GameApi } from "@flaghack/domain/GameApi"
import type { RoleId } from "@flaghack/domain/roles"
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

      const ensureDefaultSetup = client.game.selectRole({
        payload: { roleId: "virgin" }
      }).pipe(
        Effect.zipRight(
          client.game.confirmSetup({ payload: { confirm: true } })
        )
      )
      const getLogs = client.game.getLogs()
      const getInventory = ensureDefaultSetup.pipe(
        Effect.zipRight(client.game.getInventory())
      )
      const getWorld = ensureDefaultSetup.pipe(
        Effect.zipRight(client.game.getWorld())
      )
      function getPickupItemsFor(key: Key) {
        return client.game.getPickupItemsFor({ urlParams: { key } })
      }
      function doPlayerAction(action: Action) {
        return ensureDefaultSetup.pipe(
          Effect.zipRight(client.game.doAction({ payload: { action } }))
        )
      }
      function selectRole(roleId: RoleId) {
        return client.game.selectRole({ payload: { roleId } })
      }
      function confirmSetup(confirm: boolean) {
        return client.game.confirmSetup({ payload: { confirm } })
      }

      return {
        getLogs,
        getWorld,
        getInventory,
        getPickupItemsFor,
        doPlayerAction,
        selectRole,
        confirmSetup
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
export const selectRole = GameClient.selectRole
export const confirmSetup = GameClient.confirmSetup
