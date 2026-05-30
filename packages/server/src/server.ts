import { HttpApiBuilder, HttpMiddleware } from "@effect/platform"
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { Layer } from "effect"
import { createServer } from "node:http"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { ApiLive } from "./Api.js"
import { resolveServerConfig, type ServerRuntimeEnv } from "./config.js"
import { GameRepository } from "./GameRepository.js"

export const makeHttpLive = (env: ServerRuntimeEnv = process.env) => {
  const serverConfig = resolveServerConfig(env)

  return HttpApiBuilder.serve(HttpMiddleware.logger).pipe(
    Layer.provide(ApiLive),
    Layer.provide(GameRepository.Default),
    Layer.provide(NodeHttpServer.layer(createServer, serverConfig)),
    Layer.provide(HttpApiBuilder.middlewareCors())
  )
}

export const runServer = (env: ServerRuntimeEnv = process.env) =>
  Layer.launch(makeHttpLive(env)).pipe(
    NodeRuntime.runMain
  )

const isDirectEntry = () => {
  const entrypointPath = process.argv[1]

  return entrypointPath !== undefined
    && fileURLToPath(import.meta.url) === resolve(entrypointPath)
}

if (isDirectEntry()) {
  runServer()
}
