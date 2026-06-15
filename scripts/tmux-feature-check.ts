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

const BASE_URL = "http://127.0.0.1:3000"
const PORT = 3000
const HOST = "127.0.0.1"
const API_WAIT_TIMEOUT_MS = 20_000
const CLI_WAIT_TIMEOUT_MS = 15_000
const POLL_INTERVAL_MS = 250
const DEFAULT_KEY_WAIT_MS = 500
const DEFAULT_CLI_COMMAND = "pnpm run cli"

const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms))

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

const parseJsonArrayEnv = (
  name: string,
  defaultValue: ReadonlyArray<string>
) => {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === "") return [...defaultValue]

  const parsed: unknown = JSON.parse(raw)
  if (
    !Array.isArray(parsed)
    || parsed.some((value) => typeof value !== "string")
  ) {
    throw new Error(`${name} must be a JSON array of strings`)
  }

  return parsed
}

const regexFromEnv = (name: string): RegExp | undefined => {
  const raw = process.env[name]
  return raw === undefined || raw.trim() === ""
    ? undefined
    : new RegExp(raw, "u")
}

const numberFromEnv = (name: string, defaultValue: number): number => {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === "") return defaultValue

  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative number`)
  }

  return parsed
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

const assertCapture = (
  strippedCapture: string,
  expectPattern: RegExp | undefined,
  rejectPattern: RegExp | undefined
) => {
  const defaultRejectPattern =
    /Should not already be working|(?:^|\n)Error:/u
  if (strippedCapture.trim().length === 0) {
    throw new Error("CLI tmux capture was empty after feature input")
  }
  if (
    expectPattern !== undefined && !expectPattern.test(strippedCapture)
  ) {
    throw new Error(`CLI capture did not match ${expectPattern}`)
  }
  if (rejectPattern !== undefined && rejectPattern.test(strippedCapture)) {
    throw new Error(`CLI capture unexpectedly matched ${rejectPattern}`)
  }
  if (defaultRejectPattern.test(strippedCapture)) {
    throw new Error("CLI capture contained an error/crash signature")
  }
}

const run = async () => {
  const tmuxVersion = tmux(["-V"]).trim()
  const cliCommand = process.env.FLAGHACK_TMUX_CLI_COMMAND
    ?? DEFAULT_CLI_COMMAND
  if (await isTcpPortOpen(PORT, HOST)) {
    throw new Error(
      `localhost:${PORT} is already in use; stop the existing server before running the tmux feature gate`
    )
  }

  const keys = parseJsonArrayEnv("FLAGHACK_TMUX_KEYS", ["j"])
  const expectPattern = regexFromEnv("FLAGHACK_TMUX_EXPECT")
  const rejectPattern = regexFromEnv("FLAGHACK_TMUX_REJECT")
  const keyWaitMs = numberFromEnv(
    "FLAGHACK_TMUX_KEY_WAIT_MS",
    DEFAULT_KEY_WAIT_MS
  )
  const finalWaitMs = numberFromEnv("FLAGHACK_TMUX_FINAL_WAIT_MS", 1_000)
  const label =
    process.env.FLAGHACK_TMUX_LABEL?.replace(/[^a-zA-Z0-9_.-]+/gu, "-")
    || "feature"

  const session = `flag-hack-${label}-${process.pid}-${Date.now()}`
  const artifactDir = await mkdtemp(
    path.join(tmpdir(), "flag-hack-tmux-feature-")
  )
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
      "120",
      "-y",
      "40",
      "pnpm exec tsx packages/server/src/server.ts"
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
      cliCommand
    ]).trim()

    await waitForPaneOutput(cliPane)
    await sendKeys(cliPane, keys, keyWaitMs)
    await delay(finalWaitMs)

    const capture = capturePane(cliPane)
    await writeFile(capturePath, capture)

    if (paneDead(cliPane)) {
      throw new Error("CLI tmux pane exited after feature input")
    }

    assertCapture(stripAnsi(capture), expectPattern, rejectPattern)

    console.log(
      `tmux feature check passed with ${tmuxVersion}; keys=${
        JSON.stringify(keys)
      }; capture=${capturePath}`
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
