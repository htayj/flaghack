import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "@effect/platform"
import { Schema } from "effect"
import { Key, SAction, World } from "./schemas.js"

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
      World
    )
  )
  .add(
    HttpApiEndpoint.get("getPickupItemsFor", "/getPickupFor").addSuccess(
      World
    ).setUrlParams(Schema.Struct({ key: Key }))
  )
  .add(
    HttpApiEndpoint.post("doAction", "/act")
      .setPayload(Schema.Struct({ action: SAction }))
  )
{}

export class GameApi extends HttpApi.make("api").add(GameApiGroup) {}
