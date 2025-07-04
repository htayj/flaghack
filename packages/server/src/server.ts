import { HttpApiBuilder, HttpMiddleware } from "@effect/platform"
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { Layer } from "effect"
import { createServer } from "node:http"
import { ApiLive } from "./Api.js"
import { GameRepository } from "./GameRepository.js"

const HttpLive = HttpApiBuilder.serve(HttpMiddleware.logger).pipe(
  Layer.provide(ApiLive),
  Layer.provide(GameRepository.Default),
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 })),
  Layer.provide(HttpApiBuilder.middlewareCors())
)

Layer.launch(HttpLive).pipe(
  NodeRuntime.runMain
)
