#!/usr/bin/env tsx

import { HttpApiClient } from "@effect/platform"
import { NodeHttpClient } from "@effect/platform-node"
import { GameApi } from "@flaghack/domain/GameApi"
import { Effect } from "effect"
import { execFileSync } from "node:child_process"
import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { Socket } from "node:net"
import { tmpdir } from "node:os"
import * as path from "node:path"

const DEFAULT_TEST_PORT = 3000
const HOST = "127.0.0.1"
const TEST_PORT_ENV = "FLAGHACK_TEST_PORT"
const API_WAIT_TIMEOUT_MS = 20_000
const CLI_WAIT_TIMEOUT_MS = 15_000
const POLL_INTERVAL_MS = 250
const DEFAULT_WINDOW_WIDTH = 120
const DEFAULT_WINDOW_HEIGHT = 40
const COMPACT_WINDOW_WIDTH = 80
const COMPACT_WINDOW_HEIGHT = 24

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

const dimensionFromEnv = (
  name: string,
  defaultValue: number,
  minimum: number
): number => {
  const value = process.env[name]?.trim()
  const dimension = value === undefined || value === ""
    ? defaultValue
    : Number(value)
  if (!Number.isInteger(dimension) || dimension < minimum) {
    throw new Error(`${name} must be an integer of at least ${minimum}`)
  }
  return dimension
}

const PORT = resolveTestPort(process.env)
const BASE_URL = `http://${HOST}:${PORT}`
const DEFAULT_CLI_COMMAND = "pnpm run cli"

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

const tmux = (args: Array<string>) =>
  execFileSync("tmux", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  })

const tmuxQuiet = (args: Array<string>) => {
  try {
    tmux(args)
  } catch {
    // Cleanup commands should be best-effort.
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

const apiPing = () =>
  Effect.gen(function*() {
    const client = yield* HttpApiClient.make(GameApi, {
      baseUrl: BASE_URL
    })
    yield* client.game.getWorld()
  }).pipe(Effect.provide(NodeHttpClient.layerUndici))

const paneDead = (pane: string) =>
  tmux(["display-message", "-p", "-t", pane, "#{pane_dead}"]).trim()
    === "1"

const capturePane = (pane: string) =>
  tmux(["capture-pane", "-p", "-t", pane, "-S", "-200"])

const capturePaneQuiet = (pane: string): string | undefined => {
  try {
    return capturePane(pane)
  } catch {
    return undefined
  }
}

type PaneDimensions = {
  readonly height: number
  readonly width: number
}

const paneDimensions = (pane: string): PaneDimensions => {
  const output = tmux([
    "display-message",
    "-p",
    "-t",
    pane,
    "#{pane_width}\t#{pane_height}"
  ]).trim()
  const [rawWidth, rawHeight] = output.split("\t")
  const width = Number(rawWidth)
  const height = Number(rawHeight)
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    throw new Error(`could not read CLI pane dimensions from ${output}`)
  }
  return { height, width }
}

const assertPaneDimensions = (
  pane: string,
  expected: PaneDimensions
): PaneDimensions => {
  const actual = paneDimensions(pane)
  if (
    actual.width !== expected.width || actual.height !== expected.height
  ) {
    throw new Error(
      `CLI pane is ${actual.width}x${actual.height}; expected ${expected.width}x${expected.height}`
    )
  }
  return actual
}

const ansiEscapePattern = new RegExp(
  `${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`,
  "gu"
)

const ansiOscPattern = new RegExp(
  `${String.fromCharCode(27)}\\][^${String.fromCharCode(7)}]*?`
    + `(?:${String.fromCharCode(7)}|${String.fromCharCode(27)}\\\\)`,
  "gu"
)

const stripAnsi = (value: string) =>
  value.replace(ansiOscPattern, "").replace(ansiEscapePattern, "")

const isFullWidthCodePoint = (codePoint: number): boolean =>
  codePoint >= 0x1100
  && (
    codePoint <= 0x115f
    || codePoint === 0x2329
    || codePoint === 0x232a
    || (codePoint >= 0x2e80 && codePoint <= 0xa4cf
      && codePoint !== 0x303f)
    || (codePoint >= 0xac00 && codePoint <= 0xd7a3)
    || (codePoint >= 0xf900 && codePoint <= 0xfaff)
    || (codePoint >= 0xfe10 && codePoint <= 0xfe19)
    || (codePoint >= 0xfe30 && codePoint <= 0xfe6f)
    || (codePoint >= 0xff00 && codePoint <= 0xff60)
    || (codePoint >= 0xffe0 && codePoint <= 0xffe6)
    || (codePoint >= 0x1f300 && codePoint <= 0x1faff)
    || (codePoint >= 0x20000 && codePoint <= 0x3fffd)
  )

const graphemeSegmenter = new Intl.Segmenter(undefined, {
  granularity: "grapheme"
})

const displayWidth = (value: string): number => {
  let width = 0
  for (const { segment } of graphemeSegmenter.segment(value)) {
    const visible = Array.from(segment).filter((character) =>
      !/[\p{Cc}\p{Cf}\p{Mark}]/u.test(character)
    )
    const first = visible[0]
    if (first === undefined) continue
    const codePoint = first.codePointAt(0)
    if (codePoint === undefined) continue
    width += /\p{Extended_Pictographic}/u.test(segment)
        || isFullWidthCodePoint(codePoint)
      ? 2
      : 1
  }
  return width
}

const visibleLines = (capture: string): ReadonlyArray<string> => {
  const lines = stripAnsi(capture).replaceAll("\r", "").split("\n")
  while (lines.at(-1)?.trim() === "") lines.pop()
  return lines
}

const assertDefaultPlayingCapture = (
  capture: string,
  dimensions: PaneDimensions
) => {
  const lines = visibleLines(capture)
  if (lines.length === 0) {
    throw new Error("CLI tmux capture was empty after movement input")
  }
  if (lines.length > dimensions.height) {
    throw new Error(
      `CLI rendered ${lines.length} visible rows in a ${dimensions.height}-row pane`
    )
  }
  const overflowingLine = lines.find((line) =>
    displayWidth(line) > dimensions.width
  )
  if (overflowingLine !== undefined) {
    throw new Error(
      `CLI rendered a ${
        displayWidth(overflowingLine)
      }-column line in a ${dimensions.width}-column pane`
    )
  }

  const fullTopBorder = (line: string) =>
    line.startsWith("┌") && line.endsWith("┐")
    && displayWidth(line) === dimensions.width
  const fullBottomBorder = (line: string) =>
    line.startsWith("└") && line.endsWith("┘")
    && displayWidth(line) === dimensions.width
  const eventTop = lines.findIndex(fullTopBorder)
  const eventBottom = lines.findIndex((line, index) =>
    index > eventTop && fullBottomBorder(line)
  )
  const statusLine = lines.findIndex((line) => line.includes("Player:"))
  const statusTop = lines.findLastIndex((line, index) =>
    index < statusLine && fullTopBorder(line)
  )
  const statusBottom = lines.findIndex((line, index) =>
    index > statusLine && fullBottomBorder(line)
  )
  const mapHasPlayer = lines.some((line, index) =>
    index > eventBottom && index < statusTop && line.includes("@")
  )
  const statusHasRightBoundary = statusLine >= 0
    && lines[statusLine]?.startsWith("│") === true
    && lines[statusLine]?.endsWith("│") === true
    && displayWidth(lines[statusLine] ?? "") === dimensions.width
  const footerVisible = lines.some((line, index) =>
    index > statusBottom && line.includes("Flag Hack")
  )

  if (
    eventTop < 0
    || eventBottom <= eventTop
    || statusTop <= eventBottom
    || statusLine <= statusTop
    || statusBottom <= statusLine
    || !mapHasPlayer
    || !statusHasRightBoundary
    || !footerVisible
  ) {
    throw new Error(
      "CLI capture did not visibly contain a full-width event area, "
        + "player map, bordered status, and footer"
    )
  }
}

const waitForApiReady = async (serverPane: string) => {
  const startedAt = Date.now()
  let lastError = "server did not respond"

  while (Date.now() - startedAt < API_WAIT_TIMEOUT_MS) {
    if (paneDead(serverPane)) {
      throw new Error("server tmux pane exited before API readiness")
    }

    try {
      await Effect.runPromise(apiPing())
      return
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      await delay(POLL_INTERVAL_MS)
    }
  }

  throw new Error(`timed out waiting for API readiness: ${lastError}`)
}

const waitForPaneOutput = async (pane: string) => {
  const startedAt = Date.now()

  while (Date.now() - startedAt < CLI_WAIT_TIMEOUT_MS) {
    if (paneDead(pane)) {
      throw new Error("CLI tmux pane exited before rendering output")
    }

    const capture = stripAnsi(capturePane(pane))
    if (capture.trim().length > 0) return capture
    await delay(POLL_INTERVAL_MS)
  }

  throw new Error("timed out waiting for CLI pane output")
}

const captureShowsDefaultCliReady = (capture: string): boolean =>
  capture.includes("Flag Hack Charmbracelet UI")
  || capture.includes("Player:")

const captureShowsRoleSelection = (capture: string): boolean =>
  capture.includes("v - virgin") || capture.includes("Choose a role")

const captureShowsSetupConfirmation = (capture: string): boolean =>
  capture.includes("Is this ok? [yn]")

const captureShowsOpeningExposition = (capture: string): boolean =>
  capture.includes("You wake in the mud")
  && capture.includes("Enter/Space continues")

const ensureDefaultCliPastSetup = async (pane: string): Promise<void> => {
  const startedAt = Date.now()
  let sentRole = false
  let sentConfirm = false
  let dismissedOpeningExposition = false

  while (Date.now() - startedAt < CLI_WAIT_TIMEOUT_MS) {
    if (paneDead(pane)) {
      throw new Error(
        "CLI tmux pane exited before the default UI rendered"
      )
    }

    const capture = stripAnsi(capturePane(pane))
    if (captureShowsDefaultCliReady(capture)) return

    if (
      !dismissedOpeningExposition
      && captureShowsOpeningExposition(capture)
    ) {
      tmux(["send-keys", "-t", pane, "Enter"])
      dismissedOpeningExposition = true
      await delay(POLL_INTERVAL_MS)
      continue
    }

    if (!sentRole && captureShowsRoleSelection(capture)) {
      tmux(["send-keys", "-t", pane, "v"])
      sentRole = true
      await delay(POLL_INTERVAL_MS)
      continue
    }

    if (!sentConfirm && captureShowsSetupConfirmation(capture)) {
      tmux(["send-keys", "-t", pane, "y"])
      sentConfirm = true
      await delay(POLL_INTERVAL_MS)
      continue
    }

    await delay(POLL_INTERVAL_MS)
  }
  throw new Error("timed out waiting for default CLI setup to complete")
}

const perfFilePath = () => process.env.FLAGHACK_PERF_FILE?.trim()

const waitForPerfRecord = async (
  predicate: (record: Record<string, unknown>) => boolean
): Promise<void> => {
  const path = perfFilePath()
  if (path === undefined || path === "") return

  const startedAt = Date.now()
  while (Date.now() - startedAt < CLI_WAIT_TIMEOUT_MS) {
    const content = await readFile(path, "utf8").catch(() => "")
    const found = content.split(/\r?\n/u).some((line) => {
      if (line.trim() === "") return false
      try {
        const record = JSON.parse(line) as Record<string, unknown>
        return predicate(record)
      } catch {
        return false
      }
    })
    if (found) return
    await delay(POLL_INTERVAL_MS)
  }
  throw new Error("timed out waiting for requested perf record")
}

const run = async () => {
  const tmuxVersion = tmux(["-V"]).trim()
  const cliCommand = process.env.FLAGHACK_TMUX_CLI_COMMAND
    ?? DEFAULT_CLI_COMMAND
  const requestedDimensions = {
    height: dimensionFromEnv(
      "FLAGHACK_TMUX_WINDOW_HEIGHT",
      DEFAULT_WINDOW_HEIGHT,
      12
    ),
    width: dimensionFromEnv(
      "FLAGHACK_TMUX_WINDOW_WIDTH",
      DEFAULT_WINDOW_WIDTH,
      40
    )
  }
  const cliCommandWithApiUrl = `export FLAGHACK_API_URL=${
    shellQuote(BASE_URL)
  }; ${perfExportCommands()}${cliCommand}`
  if (await isTcpPortOpen(PORT, HOST)) {
    throw new Error(
      `localhost:${PORT} is already in use; stop the existing server before running the tmux E2E gate`
    )
  }

  const session = `flag-hack-smoke-${process.pid}-${Date.now()}`
  const artifactDir = await mkdtemp(path.join(tmpdir(), "flag-hack-tmux-"))
  const capturePath = path.join(artifactDir, "cli-pane.txt")
  const compactCapturePath = path.join(
    artifactDir,
    `cli-pane-${COMPACT_WINDOW_WIDTH}x${COMPACT_WINDOW_HEIGHT}.txt`
  )
  const restoredCapturePath = path.join(
    artifactDir,
    `cli-pane-${requestedDimensions.width}x${requestedDimensions.height}-restored.txt`
  )
  const dimensionsPath = path.join(artifactDir, "cli-pane-dimensions.json")
  const saveFilePath = path.join(artifactDir, "save.json")
  let sessionCreated = false
  let cliPane: string | undefined
  let serverPane: string | undefined

  try {
    tmux([
      "new-session",
      "-d",
      "-s",
      session,
      "-c",
      process.cwd(),
      "-x",
      String(requestedDimensions.width),
      "-y",
      String(requestedDimensions.height),
      `${perfEnvAssignments()} FLAGHACK_PORT=${
        String(PORT)
      } FLAGHACK_SAVE_PATH=${
        shellQuote(saveFilePath)
      } pnpm exec tsx packages/server/src/server.ts`.trim()
    ])
    sessionCreated = true
    serverPane = tmux([
      "display-message",
      "-p",
      "-t",
      `${session}:0.0`,
      "#{pane_id}"
    ]).trim()

    await waitForApiReady(serverPane)

    cliPane = tmux([
      "new-window",
      "-d",
      "-t",
      session,
      "-n",
      "cli",
      "-c",
      process.cwd(),
      "-P",
      "-F",
      "#{pane_id}",
      cliCommandWithApiUrl
    ]).trim()

    tmux([
      "resize-window",
      "-t",
      cliPane,
      "-x",
      String(requestedDimensions.width),
      "-y",
      String(requestedDimensions.height)
    ])
    const initialDimensions = assertPaneDimensions(
      cliPane,
      requestedDimensions
    )
    await writeFile(
      dimensionsPath,
      `${JSON.stringify({ initial: initialDimensions }, null, 2)}\n`
    )

    await waitForPaneOutput(cliPane)
    if (cliCommand === DEFAULT_CLI_COMMAND) {
      await ensureDefaultCliPastSetup(cliPane)
    }
    await waitForPerfRecord((record) =>
      record.source === "charm"
      && record.operation === "frontend.component"
      && record.phase === "board"
    )
    tmux(["send-keys", "-t", cliPane, "j"])
    await delay(1_000)
    await waitForPerfRecord((record) =>
      record.source === "charm"
      && record.operation === "frontend.response_to_redraw_finished"
    )

    const capture = capturePane(cliPane)
    await writeFile(capturePath, capture)

    if (paneDead(cliPane)) {
      throw new Error("CLI tmux pane exited after movement input")
    }
    if (cliCommand === DEFAULT_CLI_COMMAND) {
      assertDefaultPlayingCapture(capture, initialDimensions)

      const compactDimensions = {
        height: COMPACT_WINDOW_HEIGHT,
        width: COMPACT_WINDOW_WIDTH
      }
      tmux([
        "resize-window",
        "-t",
        cliPane,
        "-x",
        String(compactDimensions.width),
        "-y",
        String(compactDimensions.height)
      ])
      assertPaneDimensions(cliPane, compactDimensions)
      await delay(500)
      const compactCapture = capturePane(cliPane)
      await writeFile(compactCapturePath, compactCapture)
      assertDefaultPlayingCapture(compactCapture, compactDimensions)

      const restoredDimensions = requestedDimensions
      tmux([
        "resize-window",
        "-t",
        cliPane,
        "-x",
        String(restoredDimensions.width),
        "-y",
        String(restoredDimensions.height)
      ])
      assertPaneDimensions(cliPane, restoredDimensions)
      await delay(500)
      const restoredCapture = capturePane(cliPane)
      await writeFile(restoredCapturePath, restoredCapture)
      assertDefaultPlayingCapture(restoredCapture, restoredDimensions)
      await writeFile(
        dimensionsPath,
        `${
          JSON.stringify(
            {
              compact: compactDimensions,
              initial: initialDimensions,
              restored: restoredDimensions
            },
            null,
            2
          )
        }\n`
      )
    } else if (stripAnsi(capture).trim().length === 0) {
      throw new Error("CLI tmux capture was empty after movement input")
    }

    console.log(
      `tmux E2E smoke passed with ${tmuxVersion}; pane=${initialDimensions.width}x${initialDimensions.height}; capture=${capturePath}; dimensions=${dimensionsPath}${
        process.env.FLAGHACK_PERF_FILE === undefined
          ? ""
          : `; perf=${process.env.FLAGHACK_PERF_FILE}`
      }`
    )
  } catch (error) {
    if (cliPane !== undefined) {
      const failedCapture = capturePaneQuiet(cliPane)
      if (failedCapture !== undefined) {
        await writeFile(capturePath, failedCapture)
        console.error(`CLI capture written to ${capturePath}`)
      }
    }
    if (serverPane !== undefined) {
      const serverCapture = capturePaneQuiet(serverPane)
      if (serverCapture !== undefined) {
        console.error("--- server pane tail ---")
        console.error(serverCapture)
      }
    }
    throw error
  } finally {
    if (sessionCreated) {
      if (serverPane !== undefined) {
        tmuxQuiet(["send-keys", "-t", serverPane, "C-c"])
      }
      await delay(500)
      tmuxQuiet(["kill-session", "-t", session])
    }
  }
}

await run()
