import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "@effect/platform"
import { Schema } from "effect"
import { GameStateStreamPath } from "./GameStream.js"
import { RoleId } from "./roles.js"
import {
  ClientState,
  ContainerCollection,
  ItemCollection,
  Key,
  SAction,
  World
} from "./schemas.js"

export const LocalMutationHeaderName = "x-flaghack-client-intent"
export const LocalMutationHeaderValue = "local-game-command"

const LocalMutationHeaders = Schema.Struct({
  [LocalMutationHeaderName]: Schema.Literal(LocalMutationHeaderValue)
})

export class GameApiGroup extends HttpApiGroup.make("game")
  .add(
    HttpApiEndpoint.get("getLogs", "/logs").addSuccess(
      Schema.Array(Schema.String)
    )
  )
  .add(
    HttpApiEndpoint.get("getWorld", "/world").addSuccess(World)
  )
  .add(
    HttpApiEndpoint.get("getInventory", "/inventory").addSuccess(
      ItemCollection
    )
  )
  .add(
    HttpApiEndpoint.get("getClientState", "/client-state").addSuccess(
      ClientState
    )
  )
  .add(
    HttpApiEndpoint.get(
      "getClientStateStream",
      GameStateStreamPath
    ).addSuccess(Schema.String)
  )
  .add(
    HttpApiEndpoint.post("selectRole", "/setup/role").setPayload(
      Schema.Struct({ roleId: RoleId })
    )
  )
  .add(
    HttpApiEndpoint.post("confirmSetup", "/setup/confirm").setPayload(
      Schema.Struct({ confirm: Schema.Boolean })
    )
  )
  .add(
    HttpApiEndpoint.post("saveGame", "/save").setHeaders(
      LocalMutationHeaders
    )
  )
  .add(
    HttpApiEndpoint.post("restoreGame", "/restore").setHeaders(
      LocalMutationHeaders
    )
  )
  .add(
    HttpApiEndpoint.post("quitGame", "/quit").setHeaders(
      LocalMutationHeaders
    )
  )
  .add(
    HttpApiEndpoint.get("getPickupItemsFor", "/getPickupFor").addSuccess(
      ItemCollection
    ).setUrlParams(Schema.Struct({ key: Key }))
  )
  .add(
    HttpApiEndpoint.get(
      "getLootContainersFor",
      "/loot/containersFor"
    ).addSuccess(ContainerCollection).setUrlParams(
      Schema.Struct({ key: Key })
    )
  )
  .add(
    HttpApiEndpoint.get("getLootItemsFor", "/loot/itemsFor")
      .addSuccess(ItemCollection)
      .setUrlParams(Schema.Struct({ key: Key, containerKey: Key }))
  )
  .add(
    HttpApiEndpoint.post("doAction", "/act")
      .setPayload(Schema.Struct({ action: SAction }))
  )
{}

export class GameApi extends HttpApi.make("api").add(GameApiGroup) {}
