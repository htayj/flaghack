import { NodeContext, NodeHttpClient } from "@effect/platform-node"
import { Layer } from "effect"
import { GameClient } from "./GameClient.js"

export const MainLive = GameClient.Default.pipe(
  Layer.provide(NodeHttpClient.layerUndici),
  Layer.merge(NodeContext.layer)
)
