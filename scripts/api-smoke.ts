#!/usr/bin/env tsx

import { HttpApiClient } from "@effect/platform"
import { NodeHttpClient } from "@effect/platform-node"
import { GameApi } from "@flaghack/domain/GameApi"
import { Effect, HashMap } from "effect"
import {
  type ChildProcessWithoutNullStreams,
  spawn
} from "node:child_process"
import { Socket } from "node:net"
import {
  makePerfTraceId,
  measureAsync,
  measureEffect
} from "./perf-output.js"

const DEFAULT_TEST_PORT = 3000
const HOST = "127.0.0.1"
const TEST_PORT_ENV = "FLAGHACK_TEST_PORT"
const WAIT_TIMEOUT_MS = 20_000
const POLL_INTERVAL_MS = 250
const TAIL_LIMIT = 8_000

type ProcessTail = {
  readonly stdout: () => string
  readonly stderr: () => string
}

const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms))

const parsePort = (name: string, value: string): number => {
  const port = Number(value)
  if (
    !Number.isFinite(port)
    || !Number.isInteger(port)
    || port < 1
    || port > 65_535
  ) {
    throw new Error(`${name} must be an integer from 1 to 65535`)
  }
  return port
}

const resolveTestPort = (env: NodeJS.ProcessEnv): number => {
  const value = env[TEST_PORT_ENV]?.trim()
  return value === undefined || value === ""
    ? DEFAULT_TEST_PORT
    : parsePort(TEST_PORT_ENV, value)
}

const PORT = resolveTestPort(process.env)
const BASE_URL = `http://${HOST}:${PORT}`

const tailProcess = (
  child: ChildProcessWithoutNullStreams
): ProcessTail => {
  let stdout = ""
  let stderr = ""

  child.stdout.setEncoding("utf8")
  child.stderr.setEncoding("utf8")
  child.stdout.on("data", (chunk: string) => {
    stdout = `${stdout}${chunk}`.slice(-TAIL_LIMIT)
  })
  child.stderr.on("data", (chunk: string) => {
    stderr = `${stderr}${chunk}`.slice(-TAIL_LIMIT)
  })

  return {
    stdout: () => stdout,
    stderr: () => stderr
  }
}

const isTcpPortOpen = (port: number, host: string): Promise<boolean> =>
  new Promise((resolve) => {
    const socket = new Socket()
    let settled = false
    const finish = (open: boolean) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(open)
    }

    socket.setTimeout(500)
    socket.once("connect", () => finish(true))
    socket.once("timeout", () => finish(false))
    socket.once("error", () => finish(false))
    socket.connect(port, host)
  })

const waitForExit = (
  child: ChildProcessWithoutNullStreams,
  timeoutMs: number
): Promise<boolean> =>
  new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve(true)
      return
    }

    const timeout = setTimeout(() => {
      child.off("exit", onExit)
      resolve(false)
    }, timeoutMs)
    const onExit = () => {
      clearTimeout(timeout)
      resolve(true)
    }

    child.once("exit", onExit)
  })

const stopChild = async (child: ChildProcessWithoutNullStreams) => {
  if (child.exitCode !== null || child.signalCode !== null) return

  child.kill("SIGTERM")
  if (await waitForExit(child, 2_000)) return

  child.kill("SIGKILL")
  await waitForExit(child, 2_000)
}

const measureClientEffect = <A, E, R>(
  phase: string,
  effect: Effect.Effect<A, E, R>,
  counts?: (value: A) => Record<string, number | string | boolean>
) =>
  measureEffect(
    {
      counts,
      operation: "client.api",
      phase,
      source: "api-smoke",
      suite: "api-smoke"
    },
    effect
  )

const makeClientSmoke = (recordPerf: boolean) =>
  Effect.gen(function*() {
    const client = yield* HttpApiClient.make(GameApi, {
      baseUrl: BASE_URL
    })
    const run = <A, E, R>(
      phase: string,
      effect: Effect.Effect<A, E, R>,
      counts?: (value: A) => Record<string, number | string | boolean>
    ) => recordPerf ? measureClientEffect(phase, effect, counts) : effect

    const world = yield* run(
      "getWorld",
      client.game.getWorld(),
      (value) => ({
        worldSize: HashMap.size(value)
      })
    )
    const logsBefore = yield* run(
      "getLogs.before",
      client.game.getLogs(),
      (value) => ({
        logCount: value.length
      })
    )
    const inventory = yield* run(
      "getInventory",
      client.game.getInventory(),
      (value) => ({
        itemCount: HashMap.size(value)
      })
    )
    const lootContainers = yield* run(
      "getLootContainersFor",
      client.game.getLootContainersFor({
        urlParams: { key: "player" }
      }),
      (value) => ({ containerCount: HashMap.size(value) })
    )
    const firstLootContainer =
      Array.from(HashMap.values(lootContainers))[0]
    const lootItems = firstLootContainer === undefined
      ? HashMap.empty()
      : yield* run(
        "getLootItemsFor",
        client.game.getLootItemsFor({
          urlParams: {
            containerKey: firstLootContainer.key,
            key: "player"
          }
        }),
        (value) => ({ itemCount: HashMap.size(value) })
      )
    yield* run(
      "doAction.move",
      client.game.doAction({
        payload: { action: { _tag: "move", dir: "E" } }
      })
    )
    const logsAfter = yield* run(
      "getLogs.after",
      client.game.getLogs(),
      (value) => ({
        logCount: value.length
      })
    )

    return {
      inventory,
      logsAfter,
      logsBefore,
      lootContainers,
      lootItems,
      world
    } as const
  }).pipe(Effect.provide(NodeHttpClient.layerUndici))

const waitForApiReady = async (child: ChildProcessWithoutNullStreams) => {
  const startedAt = Date.now()
  let lastError = "server did not respond"

  while (Date.now() - startedAt < WAIT_TIMEOUT_MS) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(
        `server exited before API readiness (code=${child.exitCode}, signal=${child.signalCode})`
      )
    }

    try {
      await Effect.runPromise(makeClientSmoke(false))
      return
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      await delay(POLL_INTERVAL_MS)
    }
  }

  throw new Error(`timed out waiting for API readiness: ${lastError}`)
}

const run = async () => {
  if (await isTcpPortOpen(PORT, HOST)) {
    throw new Error(
      `localhost:${PORT} is already in use; stop the existing server before running the disposable API smoke gate`
    )
  }

  const child = spawn(
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    ["exec", "tsx", "packages/server/src/server.ts"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        FLAGHACK_PORT: String(PORT),
        FORCE_COLOR: "0"
      },
      stdio: ["ignore", "pipe", "pipe"]
    }
  )
  const tail = tailProcess(child)

  try {
    await measureAsync(
      {
        operation: "server.spawn_to_ready",
        phase: "total",
        source: "api-smoke",
        suite: "api-smoke",
        traceId: makePerfTraceId("api-ready")
      },
      () => waitForApiReady(child)
    )
    const result = await Effect.runPromise(makeClientSmoke(true))
    const worldSize = HashMap.size(result.world)
    const inventorySize = HashMap.size(result.inventory)
    const lootContainerSize = HashMap.size(result.lootContainers)
    const lootItemSize = HashMap.size(result.lootItems)

    if (worldSize <= 0) {
      throw new Error("getWorld returned an empty world")
    }
    if (
      !Array.isArray(result.logsBefore) || !Array.isArray(result.logsAfter)
    ) {
      throw new Error("getLogs did not decode to an array")
    }

    console.log(
      `API smoke passed: world=${worldSize}, inventory=${inventorySize}, lootContainers=${lootContainerSize}, lootItems=${lootItemSize}, logs=${result.logsAfter.length}`
    )
  } catch (error) {
    console.error("API smoke failed.")
    console.error("--- server stdout tail ---")
    console.error(tail.stdout() || "<empty>")
    console.error("--- server stderr tail ---")
    console.error(tail.stderr() || "<empty>")
    throw error
  } finally {
    await stopChild(child)
  }
}

await run()
