import { HttpApiBuilder, HttpMiddleware } from "@effect/platform"
import { NodeHttpServer } from "@effect/platform-node"
import { LocalMutationHeaderName } from "@flaghack/domain/GameApi"
import { Effect, Exit, Layer } from "effect"
import { createServer } from "node:http"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { ApiLive } from "./Api.js"
import { resolveServerConfig, type ServerRuntimeEnv } from "./config.js"
import { GamePersistence } from "./GamePersistence.js"
import {
  GameRepository,
  runRegisteredAutosaves
} from "./GameRepository.js"

const localCorsAllowedOrigins = [
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  "http://localhost:5173"
] as const

export const makeHttpLive = (env: ServerRuntimeEnv = process.env) => {
  const serverConfig = resolveServerConfig(env)

  return HttpApiBuilder.serve(HttpMiddleware.logger).pipe(
    Layer.provide(ApiLive),
    Layer.provide(GameRepository.Default),
    Layer.provide(GamePersistence.Default(serverConfig.saveFilePath)),
    Layer.provide(NodeHttpServer.layer(createServer, serverConfig)),
    Layer.provide(
      HttpApiBuilder.middlewareCors({
        allowedHeaders: ["content-type", LocalMutationHeaderName],
        allowedMethods: ["GET", "POST", "OPTIONS"],
        allowedOrigins: localCorsAllowedOrigins
      })
    )
  )
}

const serverExitCode = (exit: Exit.Exit<unknown, unknown>): number =>
  Exit.isSuccess(exit) ? 0 : 1

export const runServer = (env: ServerRuntimeEnv = process.env): void => {
  const keepAlive = setInterval(() => undefined, 2 ** 31 - 1)
  const fiber = Effect.runFork(Layer.launch(makeHttpLive(env)))
  const shutdownSignals = ["SIGINT", "SIGTERM", "SIGUSR2"] as const
  let receivedSignal = false
  let signalExitCode = 0

  const cleanupSignalHandlers = () => {
    for (const signal of shutdownSignals) {
      process.removeListener(signal, onSignal)
    }
  }

  const shutdown = runRegisteredAutosaves.pipe(
    Effect.catchAllCause((cause) =>
      Effect.sync(() => {
        signalExitCode = 1
        process.stderr.write(
          `Flag Hack autosave failed during shutdown: ${String(cause)}\n`
        )
      })
    ),
    Effect.zipRight(
      Effect.sync(() => fiber.unsafeInterruptAsFork(fiber.id()))
    )
  )

  function onSignal() {
    if (receivedSignal) return
    receivedSignal = true
    Effect.runFork(shutdown)
  }

  fiber.addObserver((exit) => {
    cleanupSignalHandlers()
    clearInterval(keepAlive)
    const code = receivedSignal ? signalExitCode : serverExitCode(exit)
    if (receivedSignal || code !== 0) {
      process.exit(code)
    }
  })

  for (const signal of shutdownSignals) {
    process.on(signal, onSignal)
  }
}

const isDirectEntry = () => {
  const entrypointPath = process.argv[1]

  return entrypointPath !== undefined
    && fileURLToPath(import.meta.url) === resolve(entrypointPath)
}

if (isDirectEntry()) {
  runServer()
}
