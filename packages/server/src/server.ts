import { HttpApiBuilder, HttpMiddleware } from "@effect/platform"
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { Layer } from "effect"
import { createServer } from "node:http"
import { ApiLive } from "./Api.js"
import { resolveServerConfig } from "./config.js"
import { GameRepository } from "./GameRepository.js"

const serverConfig = resolveServerConfig(process.env)

const HttpLive = HttpApiBuilder.serve(HttpMiddleware.logger).pipe(
  Layer.provide(ApiLive),
  Layer.provide(GameRepository.Default),
  Layer.provide(NodeHttpServer.layer(createServer, serverConfig)),
  Layer.provide(HttpApiBuilder.middlewareCors())
)

Layer.launch(HttpLive).pipe(
  NodeRuntime.runMain
)
