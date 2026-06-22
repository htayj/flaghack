import { HttpApiClient } from "@effect/platform"
import {
  GameApi,
  LocalMutationHeaderName,
  LocalMutationHeaderValue
} from "@flaghack/domain/GameApi"
import type { RoleId } from "@flaghack/domain/roles"
import type { Action, Key } from "@flaghack/domain/schemas"
import { Effect } from "effect"
import { resolveCliApiBaseUrl } from "./config.js"

type Key = typeof Key.Type

const localMutationHeaders = {
  [LocalMutationHeaderName]: LocalMutationHeaderValue
} as const

export class GameClient
  extends Effect.Service<GameClient>()("cli/GameClient", {
    accessors: true,
    effect: Effect.gen(function*() {
      const client = yield* HttpApiClient.make(GameApi, {
        baseUrl: resolveCliApiBaseUrl(process.env)
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
      function getLootContainersFor(key: Key) {
        return client.game.getLootContainersFor({ urlParams: { key } })
      }
      function getLootItemsFor(key: Key, containerKey: Key) {
        return client.game.getLootItemsFor({
          urlParams: { containerKey, key }
        })
      }
      function doPlayerAction(action: Action) {
        return ensureDefaultSetup.pipe(
          Effect.zipRight(client.game.doAction({ payload: { action } }))
        )
      }
      const saveGame = client.game.saveGame({
        headers: localMutationHeaders
      })
      const restoreGame = client.game.restoreGame({
        headers: localMutationHeaders
      })
      const quitGame = client.game.quitGame({
        headers: localMutationHeaders
      })
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
        getLootContainersFor,
        getLootItemsFor,
        doPlayerAction,
        saveGame,
        restoreGame,
        quitGame,
        selectRole,
        confirmSetup
      } as const
    })
  })
{}
