#!/usr/bin/env tsx

import { HttpApiClient } from "@effect/platform"
import { NodeHttpClient } from "@effect/platform-node"
import { isCreatureTag } from "@flaghack/domain/creatureCapabilities"
import {
  GameApi,
  LocalMutationHeaderName,
  LocalMutationHeaderValue
} from "@flaghack/domain/GameApi"
import { GameStateStreamPath } from "@flaghack/domain/GameStream"
import type { ClientStateStreamEvent } from "@flaghack/domain/GameStream"
import {
  AnyCreature,
  conforms,
  type Entity as EntitySchema,
  type World as WorldSchema
} from "@flaghack/domain/schemas"
import { Effect, HashMap } from "effect"
import {
  type ChildProcessWithoutNullStreams,
  spawn
} from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { Socket } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
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

type Entity = typeof EntitySchema.Type
type World = typeof WorldSchema.Type

const schemaIsCreature = conforms(AnyCreature)

const assertRuntimeCreatureAttributes = (
  label: string,
  world: World,
  options: { readonly requireNonPlayer: boolean }
) => {
  const entities = Array.from(HashMap.values(world))
  const player = entities.find((entity) => entity._tag === "player")
  if (player === undefined) {
    throw new Error(`${label} did not include a player entity`)
  }
  if (!schemaIsCreature(player)) {
    throw new Error(
      `${label} player did not include schema-valid attributes`
    )
  }

  const nonPlayerCreatures = entities.filter((entity): entity is Entity =>
    entity._tag !== "player" && isCreatureTag(entity._tag)
  )
  if (options.requireNonPlayer && nonPlayerCreatures.length === 0) {
    throw new Error(
      `${label} did not include generated non-player creatures`
    )
  }
  for (const creature of nonPlayerCreatures) {
    if (!schemaIsCreature(creature)) {
      throw new Error(
        `${label} creature ${creature.key} did not include schema-valid attributes`
      )
    }
  }
}

const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms))

type SseReader = {
  readonly abort: () => void
  readonly nextEvent: () => Promise<ClientStateStreamEvent>
}

const withTimeout = async <A>(
  promise: Promise<A>,
  timeoutMs: number,
  label: string
): Promise<A> =>
  await new Promise<A>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
      timeoutMs
    )
    promise.then(
      (value) => {
        clearTimeout(timeout)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timeout)
        reject(error)
      }
    )
  })

const openClientStateStream = async (): Promise<SseReader> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5_000)
  let response: Response
  try {
    response = await fetch(`${BASE_URL}${GameStateStreamPath}`, {
      headers: { Accept: "text/event-stream" },
      signal: controller.signal
    })
  } finally {
    clearTimeout(timeout)
  }
  if (!response.ok || response.body === null) {
    controller.abort()
    throw new Error(
      `${GameStateStreamPath} failed: ${response.status} ${response.statusText}`
    )
  }
  const contentType = response.headers.get("content-type") ?? ""
  if (!contentType.includes("text/event-stream")) {
    controller.abort()
    throw new Error(
      `${GameStateStreamPath} content-type ${contentType}, want text/event-stream`
    )
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  const parseBlock = (
    block: string
  ): ClientStateStreamEvent | undefined => {
    const data = block.split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trimStart())
      .join("\n")
    return data === ""
      ? undefined
      : JSON.parse(data) as ClientStateStreamEvent
  }

  const nextEvent = async (): Promise<ClientStateStreamEvent> => {
    while (true) {
      const boundary = buffer.indexOf("\n\n")
      if (boundary >= 0) {
        const block = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const event = parseBlock(block)
        if (event !== undefined) return event
      }

      const { done, value } = await reader.read()
      if (done) throw new Error("client-state stream closed")
      buffer += decoder.decode(value, { stream: true })
    }
  }

  return {
    abort: () => {
      controller.abort()
      void reader.cancel().catch(() => undefined)
    },
    nextEvent
  }
}

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
const localMutationHeaders = {
  [LocalMutationHeaderName]: LocalMutationHeaderValue
} as const

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

const assertMissingMutationHeadersRejected = async () => {
  for (const path of ["/save", "/restore", "/quit"] as const) {
    const response = await fetch(`${BASE_URL}${path}`, { method: "POST" })
    if (response.ok) {
      throw new Error(`${path} accepted a mutation without intent header`)
    }
  }
}

const makeApiPing = () =>
  Effect.gen(function*() {
    const client = yield* HttpApiClient.make(GameApi, {
      baseUrl: BASE_URL
    })
    yield* client.game.getWorld()
  }).pipe(Effect.provide(NodeHttpClient.layerUndici))

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
    const initialClientState = yield* run(
      "getClientState.initial",
      client.game.getClientState(),
      (value) => ({
        itemCount: HashMap.size(value.inventory),
        roleCount: value.roles.length,
        setupPhase: value.setup.phase,
        worldSize: HashMap.size(value.world)
      })
    )
    yield* run(
      "selectRole.virgin",
      client.game.selectRole({ payload: { roleId: "virgin" } })
    )
    const selectedClientState = yield* run(
      "getClientState.selectedRole",
      client.game.getClientState(),
      (value) => ({
        roleCount: value.roles.length,
        setupPhase: value.setup.phase,
        worldSize: HashMap.size(value.world)
      })
    )
    yield* run(
      "confirmSetup.y",
      client.game.confirmSetup({ payload: { confirm: true } })
    )
    const clientState = yield* run(
      "getClientState.complete",
      client.game.getClientState(),
      (value) => ({
        itemCount: HashMap.size(value.inventory),
        roleCount: value.roles.length,
        setupPhase: value.setup.phase,
        worldSize: HashMap.size(value.world)
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
    const stream = yield* Effect.promise(() => openClientStateStream())
    const { streamAfterMove } = yield* Effect.gen(
      function*() {
        const streamInitial = yield* Effect.promise(() =>
          withTimeout(
            stream.nextEvent(),
            5_000,
            "initial client-state stream event"
          )
        )
        yield* run(
          "doAction.move",
          client.game.doAction({
            payload: { action: { _tag: "move", dir: "E" } }
          })
        )
        const streamAfterMove = yield* Effect.promise(() =>
          withTimeout(
            (async () => {
              for (let attempt = 0; attempt < 10; attempt += 1) {
                const event = await withTimeout(
                  stream.nextEvent(),
                  5_000,
                  "next client-state stream event"
                )
                if (event.revision > streamInitial.revision) return event
              }
              throw new Error(
                `stream revision did not advance after action from ${streamInitial.revision}`
              )
            })(),
            10_000,
            "client-state stream action update"
          )
        )
        return { streamAfterMove }
      }
    ).pipe(Effect.ensuring(Effect.sync(() => stream.abort())))
    if (streamAfterMove.source !== "action") {
      throw new Error(
        `stream event after action had source ${streamAfterMove.source}`
      )
    }
    const logsAfter = yield* run(
      "getLogs.after",
      client.game.getLogs(),
      (value) => ({
        logCount: value.length
      })
    )
    yield* run(
      "saveGame",
      client.game.saveGame({ headers: localMutationHeaders })
    )
    yield* run(
      "restoreGame",
      client.game.restoreGame({ headers: localMutationHeaders })
    )
    const restoredClientState = yield* run(
      "getClientState.restoredAfterSave",
      client.game.getClientState(),
      (value) => ({
        itemCount: HashMap.size(value.inventory),
        roleCount: value.roles.length,
        setupPhase: value.setup.phase,
        worldSize: HashMap.size(value.world)
      })
    )
    yield* run(
      "quitGame",
      client.game.quitGame({ headers: localMutationHeaders })
    )

    return {
      clientState,
      initialClientState,
      inventory,
      logsAfter,
      logsBefore,
      lootContainers,
      lootItems,
      restoredClientState,
      selectedClientState,
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
      await Effect.runPromise(makeApiPing())
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

  const artifactDir = await mkdtemp(join(tmpdir(), "flag-hack-api-"))
  const saveFilePath = join(artifactDir, "save.json")
  const child = spawn(
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    ["exec", "tsx", "packages/server/src/server.ts"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        FLAGHACK_PORT: String(PORT),
        FLAGHACK_SAVE_PATH: saveFilePath,
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
    await assertMissingMutationHeadersRejected()
    const result = await Effect.runPromise(makeClientSmoke(true))
    const worldSize = HashMap.size(result.world)
    const inventorySize = HashMap.size(result.inventory)
    const clientStateWorldSize = HashMap.size(result.clientState.world)
    const lootContainerSize = HashMap.size(result.lootContainers)
    const lootItemSize = HashMap.size(result.lootItems)
    const restoredWorldSize = HashMap.size(
      result.restoredClientState.world
    )

    if (worldSize <= 0) {
      throw new Error("getWorld returned an empty world")
    }
    assertRuntimeCreatureAttributes("getWorld", result.world, {
      requireNonPlayer: true
    })
    assertRuntimeCreatureAttributes(
      "getClientState.complete",
      result.clientState.world,
      { requireNonPlayer: false }
    )
    if (result.initialClientState.setup.phase !== "selectRole") {
      throw new Error(
        `fresh client state did not start at role selection: ${result.initialClientState.setup.phase}`
      )
    }
    if (result.selectedClientState.setup.phase !== "confirm") {
      throw new Error(
        `role selection did not advance to confirmation: ${result.selectedClientState.setup.phase}`
      )
    }
    if (result.clientState.setup.phase !== "complete") {
      throw new Error(
        `setup confirmation did not complete setup: ${result.clientState.setup.phase}`
      )
    }
    if (clientStateWorldSize <= 0 || clientStateWorldSize >= worldSize) {
      throw new Error(
        `getClientState returned an invalid viewport world size: ${clientStateWorldSize} of ${worldSize}`
      )
    }
    if (
      !Array.isArray(result.logsBefore) || !Array.isArray(result.logsAfter)
    ) {
      throw new Error("getLogs did not decode to an array")
    }
    if (restoredWorldSize <= 0) {
      throw new Error("save/restore lifecycle returned an empty world")
    }

    console.log(
      `API smoke passed: world=${worldSize}, clientStateWorld=${clientStateWorldSize}, inventory=${inventorySize}, lootContainers=${lootContainerSize}, lootItems=${lootItemSize}, logs=${result.logsAfter.length}`
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
    await rm(artifactDir, { force: true, recursive: true })
  }
}

await run()
