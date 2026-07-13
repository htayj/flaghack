#!/usr/bin/env tsx

import { HttpApiClient } from "@effect/platform"
import { NodeHttpClient } from "@effect/platform-node"
import { GameApi } from "@flaghack/domain/GameApi"
import { Effect, HashMap } from "effect"
import {
  type ChildProcessWithoutNullStreams,
  execFileSync,
  spawn
} from "node:child_process"
import { mkdtemp, writeFile } from "node:fs/promises"
import { Socket } from "node:net"
import { tmpdir } from "node:os"
import * as path from "node:path"

const DEFAULT_TEST_PORT = 3000
const HOST = "127.0.0.1"
const TEST_PORT_ENV = "FLAGHACK_TEST_PORT"
const WAIT_TIMEOUT_MS = 20_000
const POLL_INTERVAL_MS = 250
const TAIL_LIMIT = 8_000

type Entity = {
  readonly _tag: string
  readonly key: string
  readonly in: string
  readonly at: {
    readonly x: number
    readonly y: number
    readonly z: number
  }
}
type Direction = "N" | "E" | "S" | "W" | "NE" | "NW" | "SE" | "SW"
type Position = Entity["at"]
type ProcessTail = {
  readonly stdout: () => string
  readonly stderr: () => string
}

const movementDeltas = {
  N: { x: 0, y: -1, z: 0 },
  E: { x: 1, y: 0, z: 0 },
  S: { x: 0, y: 1, z: 0 },
  W: { x: -1, y: 0, z: 0 },
  NE: { x: 1, y: -1, z: 0 },
  NW: { x: -1, y: -1, z: 0 },
  SE: { x: 1, y: 1, z: 0 },
  SW: { x: -1, y: 1, z: 0 }
} as const satisfies Readonly<Record<Direction, Position>>

const searchDirections = [
  "W",
  "N",
  "E",
  "S",
  "NW",
  "NE",
  "SE",
  "SW"
] as const satisfies ReadonlyArray<Direction>

const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms))

const parsePort = (name: string, value: string): number => {
  const port = Number(value)
  if (
    !Number.isFinite(port) || !Number.isInteger(port) || port < 1
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

const shellQuote = (value: string): string =>
  `'${value.replaceAll("'", `'"'"'`)}'`

const perfEnvAssignments = () =>
  ["FLAGHACK_PERF_FILE", "FLAGHACK_PERF_STDOUT", "FLAGHACK_PERF_RUN_ID"]
    .flatMap((name) => {
      const value = process.env[name]?.trim()
      return value === undefined || value === ""
        ? []
        : [`${name}=${shellQuote(value)}`]
    })
    .join(" ")

const perfExportCommands = () => {
  const assignments = perfEnvAssignments()
  return assignments === "" ? "" : `export ${assignments}; `
}

const tmux = (args: ReadonlyArray<string>) =>
  execFileSync("tmux", [...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  })

const tmuxQuiet = (args: ReadonlyArray<string>) => {
  try {
    tmux(args)
  } catch {
    // Cleanup commands should be best-effort.
  }
}

const ansiEscapePattern = new RegExp(
  `${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`,
  "gu"
)
const stripAnsi = (value: string) => value.replace(ansiEscapePattern, "")
const capturePane = (pane: string) =>
  tmux(["capture-pane", "-p", "-t", pane, "-S", "-200"])
const paneDead = (pane: string) =>
  tmux(["display-message", "-p", "-t", pane, "#{pane_dead}"]).trim()
    === "1"

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

  return { stdout: () => stdout, stderr: () => stderr }
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

const apiEffect = <A>(
  fn: (
    client: Awaited<ReturnType<typeof HttpApiClient.make<typeof GameApi>>>
  ) => Effect.Effect<A, unknown>
) =>
  Effect.gen(function*() {
    const client = yield* HttpApiClient.make(GameApi, {
      baseUrl: BASE_URL
    })
    return yield* fn(client)
  }).pipe(Effect.provide(NodeHttpClient.layerUndici))

const getWorld = () => apiEffect((client) => client.game.getWorld())
const selectVirginRole = () =>
  apiEffect((client) =>
    client.game.selectRole({ payload: { roleId: "virgin" } })
  )
const confirmSetup = () =>
  apiEffect((client) =>
    client.game.confirmSetup({ payload: { confirm: true } })
  )
const doMove = (dir: Direction) =>
  apiEffect((client) =>
    client.game.doAction({ payload: { action: { _tag: "move", dir } } })
  )
const getInventory = () =>
  apiEffect((client) => client.game.getInventory())
const getLootContainers = () =>
  apiEffect((client) =>
    client.game.getLootContainersFor({ urlParams: { key: "player" } })
  )
const getLootItems = (containerKey: string) =>
  apiEffect((client) =>
    client.game.getLootItemsFor({
      urlParams: { containerKey, key: "player" }
    })
  )
const getPickupItems = () =>
  apiEffect((client) =>
    client.game.getPickupItemsFor({ urlParams: { key: "player" } })
  )

const itemLetterAlphabet = "abcdefghijklmnopstuvwxyz"
const sortedItemsForLetters = (items: ReadonlyArray<Entity>) =>
  [...items].sort((left, right) => {
    const keyOrder = left.key.localeCompare(right.key)
    return keyOrder === 0 ? left._tag.localeCompare(right._tag) : keyOrder
  })
const letterForItem = (
  items: ReadonlyArray<Entity>,
  itemKey: string
): string => {
  const index = sortedItemsForLetters(items).findIndex((item) =>
    item.key === itemKey
  )
  if (index < 0) throw new Error(`item ${itemKey} not present in picker`)
  const letter = itemLetterAlphabet[index]
  if (letter === undefined) {
    throw new Error(`item ${itemKey} is beyond supported letter alphabet`)
  }
  return letter
}

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
      await Effect.runPromise(getWorld())
      return
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      await delay(POLL_INTERVAL_MS)
    }
  }
  throw new Error(`timed out waiting for API readiness: ${lastError}`)
}

const posKey = (pos: Position): string => `${pos.x},${pos.y},${pos.z}`
const samePos = (left: Position, right: Position): boolean =>
  left.x === right.x && left.y === right.y && left.z === right.z
const addPos = (left: Position, right: Position): Position => ({
  x: left.x + right.x,
  y: left.y + right.y,
  z: left.z + right.z
})
const isCreature = (entity: Entity): boolean =>
  entity._tag === "player" || entity._tag === "ranger"
  || entity._tag === "hippie" || entity._tag === "wook"
  || entity._tag === "acidcop" || entity._tag.endsWith("egregore")
const isPassableTerrain = (entity: Entity): boolean =>
  entity.in === "world" && entity._tag !== "wall"
  && ["floor", "tunnel", "tent", "sign", "effigy", "temple", "stairs-down"]
    .includes(
      entity._tag
    )

const findPath = (
  worldValues: ReadonlyArray<Entity>,
  start: Position,
  target: Position
): ReadonlyArray<Direction> => {
  const passable = new Set(
    worldValues.filter(isPassableTerrain).map((entity) =>
      posKey(entity.at)
    )
  )
  const blocked = new Set(
    worldValues.filter((entity) =>
      entity.in === "world" && isCreature(entity)
      && !samePos(entity.at, start)
    ).map((entity) => posKey(entity.at))
  )
  const targetKey = posKey(target)
  const queue: Array<
    { readonly pos: Position; readonly path: ReadonlyArray<Direction> }
  > = [{ pos: start, path: [] }]
  const seen = new Set([posKey(start)])

  while (queue.length > 0) {
    const current = queue.shift()
    if (current === undefined) break
    if (samePos(current.pos, target)) return current.path

    for (const dir of searchDirections) {
      const next = addPos(current.pos, movementDeltas[dir])
      const key = posKey(next)
      if (
        seen.has(key) || !passable.has(key)
        || (blocked.has(key) && key !== targetKey)
      ) continue
      seen.add(key)
      queue.push({ pos: next, path: [...current.path, dir] })
    }
  }
  return []
}

const chooseReachableLootTarget = (worldValues: ReadonlyArray<Entity>) => {
  const player = worldValues.find((entity) => entity.key === "player")
  if (player === undefined) throw new Error("player not found")
  const coolers = worldValues
    .filter((entity) => entity._tag === "cooler" && entity.in === "world")
    .filter((cooler) =>
      worldValues.some((entity) => entity.in === cooler.key)
    )
    .sort((left, right) => left.key.localeCompare(right.key))

  for (const cooler of coolers) {
    const path = findPath(worldValues, player.at, cooler.at)
    if (path.length > 0 || samePos(player.at, cooler.at)) {
      return { container: cooler, path }
    }
  }
  throw new Error("no reachable floor cooler with contents found")
}

const waitForGameplayReady = async (pane: string) => {
  const startedAt = Date.now()
  let lastCapture = ""
  while (Date.now() - startedAt < WAIT_TIMEOUT_MS) {
    if (paneDead(pane)) {
      throw new Error("CLI tmux pane exited before rendering output")
    }
    lastCapture = stripAnsi(capturePane(pane))
    if (lastCapture.includes("Flag Hack · ? help")) return
    await delay(POLL_INTERVAL_MS)
  }
  throw new Error(
    `timed out waiting for CLI gameplay screen: ${lastCapture}`
  )
}

const sendKeys = async (
  pane: string,
  keys: ReadonlyArray<string>,
  waitMs: number
) => {
  for (const key of keys) {
    tmux(["send-keys", "-t", pane, key])
    await delay(waitMs)
  }
}

const assertNoCrash = (capture: string) => {
  const stripped = stripAnsi(capture)
  if (stripped.trim().length === 0) {
    throw new Error("CLI capture was empty")
  }
  const reject =
    /NoSuchElement|Generation|LevelGenerationError|(?:^|\n)Error:|Unhandled|panic/u
  if (reject.test(stripped)) {
    throw new Error("CLI capture contained crash/error signature")
  }
}

const run = async () => {
  if (await isTcpPortOpen(PORT, HOST)) {
    throw new Error(
      `localhost:${PORT} is already in use; stop the existing server before running the loot tmux feature gate`
    )
  }

  const artifactDir = await mkdtemp(
    path.join(tmpdir(), "flag-hack-tmux-loot-")
  )
  const capturePath = path.join(artifactDir, "cli-pane.txt")
  const saveFilePath = path.join(artifactDir, "save.json")
  const server = spawn(
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
  const tail = tailProcess(server)
  const session = `flag-hack-loot-${process.pid}-${Date.now()}`
  let sessionCreated = false
  let cliPane: string | undefined

  try {
    await waitForApiReady(server)
    await Effect.runPromise(selectVirginRole())
    await Effect.runPromise(confirmSetup())
    const initialWorld = Array.from(
      HashMap.values(await Effect.runPromise(getWorld()))
    ) as ReadonlyArray<Entity>
    const target = chooseReachableLootTarget(initialWorld)

    for (const dir of target.path) {
      await Effect.runPromise(doMove(dir))
    }

    const containersAtPlayer = await Effect.runPromise(getLootContainers())
    if (!HashMap.has(containersAtPlayer, target.container.key)) {
      throw new Error(
        `player did not reach loot container ${target.container.key}`
      )
    }
    const initialContents = await Effect.runPromise(
      getLootItems(target.container.key)
    )
    const initialContentItems = sortedItemsForLetters(
      Array.from(HashMap.values(initialContents)) as ReadonlyArray<Entity>
    )
    const movedItem = initialContentItems[0]
    if (movedItem === undefined) {
      throw new Error("target container had no contents before looting")
    }
    const takeLetter = letterForItem(initialContentItems, movedItem.key)

    tmux([
      "new-session",
      "-d",
      "-s",
      session,
      "-c",
      process.cwd(),
      "-x",
      "130",
      "-y",
      "40",
      `export FLAGHACK_API_URL=${
        shellQuote(BASE_URL)
      }; ${perfExportCommands()}pnpm run cli`
    ])
    sessionCreated = true
    cliPane = tmux([
      "display-message",
      "-p",
      "-t",
      `${session}:0.0`,
      "#{pane_id}"
    ]).trim()
    await waitForGameplayReady(cliPane)

    await sendKeys(cliPane, ["M-l"], 1_500)
    await delay(1_000)
    let capture = stripAnsi(capturePane(cliPane))
    await writeFile(capturePath, capture)
    assertNoCrash(capture)
    if (
      !capture.includes("choose action") || !capture.includes("t - take")
    ) {
      throw new Error(`loot action stage was not visible: ${capture}`)
    }

    await sendKeys(cliPane, ["t"], 1_000)
    await delay(1_000)
    capture = stripAnsi(capturePane(cliPane))
    await writeFile(capturePath, capture)
    assertNoCrash(capture)
    if (!capture.includes(`${takeLetter} - ${movedItem._tag}`)) {
      throw new Error(
        `loot take item letter ${takeLetter} for ${movedItem._tag} was not visible: ${capture}`
      )
    }

    await sendKeys(cliPane, [takeLetter, "Space"], 1_500)
    await delay(2_000)
    capture = stripAnsi(capturePane(cliPane))
    await writeFile(capturePath, capture)
    assertNoCrash(capture)

    const inventoryAfterTake = Array.from(
      HashMap.values(await Effect.runPromise(getInventory()))
    ) as ReadonlyArray<Entity>
    if (
      !inventoryAfterTake.some((entity) => entity.key === movedItem.key)
    ) {
      throw new Error(
        `loot take did not move ${movedItem.key} into inventory`
      )
    }

    const dropLetter = letterForItem(inventoryAfterTake, movedItem.key)
    await sendKeys(cliPane, ["d"], 1_500)
    await delay(1_000)
    capture = stripAnsi(capturePane(cliPane))
    await writeFile(capturePath, capture)
    assertNoCrash(capture)
    if (!capture.includes(`${dropLetter} - ${movedItem._tag}`)) {
      throw new Error(
        `drop item letter ${dropLetter} for ${movedItem._tag} was not visible: ${capture}`
      )
    }
    await sendKeys(cliPane, [dropLetter, "Space"], 1_500)
    await delay(2_000)

    const inventoryAfterDrop = Array.from(
      HashMap.values(await Effect.runPromise(getInventory()))
    ) as ReadonlyArray<Entity>
    if (
      inventoryAfterDrop.some((entity) => entity.key === movedItem.key)
    ) {
      throw new Error(
        `drop did not remove ${movedItem.key} from inventory`
      )
    }

    const pickupItems = Array.from(
      HashMap.values(await Effect.runPromise(getPickupItems()))
    ) as ReadonlyArray<Entity>
    const pickupLetter = letterForItem(pickupItems, movedItem.key)
    await sendKeys(cliPane, [","], 1_500)
    await delay(1_000)
    capture = stripAnsi(capturePane(cliPane))
    await writeFile(capturePath, capture)
    assertNoCrash(capture)
    if (!capture.includes(`${pickupLetter} - ${movedItem._tag}`)) {
      throw new Error(
        `pickup item letter ${pickupLetter} for ${movedItem._tag} was not visible: ${capture}`
      )
    }
    await sendKeys(cliPane, [pickupLetter, "Space"], 1_500)
    await delay(2_000)

    const inventoryAfterPickup = Array.from(
      HashMap.values(await Effect.runPromise(getInventory()))
    ) as ReadonlyArray<Entity>
    if (
      !inventoryAfterPickup.some((entity) => entity.key === movedItem.key)
    ) {
      throw new Error(
        `pickup did not return ${movedItem.key} to inventory`
      )
    }

    const putLetter = letterForItem(inventoryAfterPickup, movedItem.key)
    await sendKeys(cliPane, ["M-l"], 1_500)
    await delay(1_000)
    capture = stripAnsi(capturePane(cliPane))
    await writeFile(capturePath, capture)
    assertNoCrash(capture)
    if (
      !capture.includes("choose action") || !capture.includes("p - put")
    ) {
      throw new Error(`loot put action stage was not visible: ${capture}`)
    }
    await sendKeys(cliPane, ["p"], 1_000)
    await delay(1_000)
    capture = stripAnsi(capturePane(cliPane))
    await writeFile(capturePath, capture)
    assertNoCrash(capture)
    if (!capture.includes(`${putLetter} - ${movedItem._tag}`)) {
      throw new Error(
        `loot put item letter ${putLetter} for ${movedItem._tag} was not visible: ${capture}`
      )
    }
    await sendKeys(cliPane, [putLetter, "Space"], 1_500)
    await delay(2_000)

    const contentsAfterPut = Array.from(
      HashMap.values(
        await Effect.runPromise(getLootItems(target.container.key))
      )
    ) as ReadonlyArray<Entity>
    if (!contentsAfterPut.some((entity) => entity.key === movedItem.key)) {
      throw new Error(
        `loot put did not move ${movedItem.key} back into ${target.container.key}`
      )
    }

    console.log(
      `tmux loot feature passed; container=${target.container.key}; item=${movedItem.key}; capture=${capturePath}${
        process.env.FLAGHACK_PERF_FILE === undefined
          ? ""
          : `; perf=${process.env.FLAGHACK_PERF_FILE}`
      }`
    )
  } catch (error) {
    if (cliPane !== undefined) {
      await writeFile(capturePath, capturePane(cliPane))
      console.error(`CLI capture written to ${capturePath}`)
    }
    console.error("--- server stdout tail ---")
    console.error(tail.stdout() || "<empty>")
    console.error("--- server stderr tail ---")
    console.error(tail.stderr() || "<empty>")
    throw error
  } finally {
    if (sessionCreated) {
      tmuxQuiet(["send-keys", "-t", session, "C-c"])
      await delay(500)
      tmuxQuiet(["kill-session", "-t", session])
    }
    await stopChild(server)
  }
}

await run()
