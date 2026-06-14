import { NodeContext, NodeHttpClient } from "@effect/platform-node"
import { Layer, ManagedRuntime } from "effect"
import { GameClient } from "./GameClient.js"

export const MainLive = GameClient.Default.pipe(
  Layer.provide(NodeHttpClient.layerUndici),
  Layer.merge(NodeContext.layer)
)

export const LiveRuntime = ManagedRuntime.make(MainLive)
