#!/usr/bin/env tsx

import { HttpApiClient } from "@effect/platform"
import { NodeHttpClient } from "@effect/platform-node"
import { GameApi } from "@flaghack/domain/GameApi"
import { Effect } from "effect"
import { execFileSync } from "node:child_process"
import { mkdtemp, writeFile } from "node:fs/promises"
import { Socket } from "node:net"
import { tmpdir } from "node:os"
import * as path from "node:path"

const DEFAULT_TEST_PORT = 3000
const HOST = "127.0.0.1"
const TEST_PORT_ENV = "FLAGHACK_TEST_PORT"
const API_WAIT_TIMEOUT_MS = 20_000
const CLI_WAIT_TIMEOUT_MS = 15_000
const POLL_INTERVAL_MS = 250

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
const DEFAULT_CLI_COMMAND = "pnpm run cli"

const shellQuote = (value: string): string =>
  `'${value.replaceAll("'", `'"'"'`)}'`

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

const ansiEscapePattern = new RegExp(
  `${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`,
  "gu"
)

const stripAnsi = (value: string) => value.replace(ansiEscapePattern, "")

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

const run = async () => {
  const tmuxVersion = tmux(["-V"]).trim()
  const cliCommand = process.env.FLAGHACK_TMUX_CLI_COMMAND
    ?? DEFAULT_CLI_COMMAND
  const cliCommandWithApiUrl = `export FLAGHACK_API_URL=${
    shellQuote(BASE_URL)
  }; ${cliCommand}`
  if (await isTcpPortOpen(PORT, HOST)) {
    throw new Error(
      `localhost:${PORT} is already in use; stop the existing server before running the tmux E2E gate`
    )
  }

  const session = `flag-hack-smoke-${process.pid}-${Date.now()}`
  const artifactDir = await mkdtemp(path.join(tmpdir(), "flag-hack-tmux-"))
  const capturePath = path.join(artifactDir, "cli-pane.txt")
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
      "100",
      "-y",
      "36",
      `FLAGHACK_PORT=${
        String(PORT)
      } pnpm exec tsx packages/server/src/server.ts`
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
      "split-window",
      "-h",
      "-t",
      session,
      "-c",
      process.cwd(),
      "-P",
      "-F",
      "#{pane_id}",
      cliCommandWithApiUrl
    ]).trim()

    await waitForPaneOutput(cliPane)
    tmux(["send-keys", "-t", cliPane, "j"])
    await delay(1_000)

    const capture = capturePane(cliPane)
    await writeFile(capturePath, capture)

    if (paneDead(cliPane)) {
      throw new Error("CLI tmux pane exited after movement input")
    }
    if (stripAnsi(capture).trim().length === 0) {
      throw new Error("CLI tmux capture was empty after movement input")
    }

    console.log(
      `tmux E2E smoke passed with ${tmuxVersion}; capture=${capturePath}`
    )
  } catch (error) {
    if (cliPane !== undefined) {
      await writeFile(capturePath, capturePane(cliPane))
      console.error(`CLI capture written to ${capturePath}`)
    }
    if (serverPane !== undefined) {
      console.error("--- server pane tail ---")
      console.error(capturePane(serverPane))
    }
    throw error
  } finally {
    if (sessionCreated) {
      tmuxQuiet(["send-keys", "-t", session, "C-c"])
      await delay(500)
      tmuxQuiet(["kill-session", "-t", session])
    }
  }
}

await run()
