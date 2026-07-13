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
const DEFAULT_KEY_WAIT_MS = 500
const DEFAULT_WINDOW_WIDTH = 120

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

const perfEnvAssignments = () =>
  [
    "FLAGHACK_DOOR_FIXTURE",
    "FLAGHACK_GAME_FIXTURE",
    "FLAGHACK_PERF_FILE",
    "FLAGHACK_PERF_RUN_ID",
    "FLAGHACK_PERF_STDOUT"
  ].flatMap((name) => {
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

const booleanFromEnv = (name: string, defaultValue: boolean): boolean => {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === "") return defaultValue

  const normalized = raw.trim().toLowerCase()
  if (["1", "true", "yes", "y", "on"].includes(normalized)) {
    return true
  }
  if (["0", "false", "no", "n", "off"].includes(normalized)) {
    return false
  }

  throw new Error(`${name} must be a boolean-like value`)
}

type FeatureStep = {
  readonly expectPattern?: RegExp
  readonly keys: ReadonlyArray<string>
  readonly label: string
  readonly rejectPattern?: RegExp
  readonly waitMs: number
}

const optionalStringProperty = (
  value: Record<string, unknown>,
  property: string,
  stepIndex: number
): string | undefined => {
  const candidate = value[property]
  if (candidate === undefined) return undefined
  if (typeof candidate !== "string") {
    throw new Error(
      `FLAGHACK_TMUX_STEPS step ${
        stepIndex + 1
      } ${property} must be a string`
    )
  }
  return candidate
}

const parseFeatureSteps = (): ReadonlyArray<FeatureStep> | undefined => {
  const raw = process.env.FLAGHACK_TMUX_STEPS?.trim()
  if (raw === undefined || raw === "") return undefined

  const parsed: unknown = JSON.parse(raw)
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("FLAGHACK_TMUX_STEPS must be a non-empty JSON array")
  }

  return parsed.map((candidate, index) => {
    if (
      candidate === null
      || typeof candidate !== "object"
      || Array.isArray(candidate)
    ) {
      throw new Error(
        `FLAGHACK_TMUX_STEPS step ${index + 1} must be an object`
      )
    }
    const step = candidate as Record<string, unknown>
    if (
      !Array.isArray(step.keys)
      || step.keys.some((key) => typeof key !== "string")
    ) {
      throw new Error(
        `FLAGHACK_TMUX_STEPS step ${
          index + 1
        } keys must be a JSON array of strings`
      )
    }
    const label = optionalStringProperty(step, "label", index)
      ?? `step-${index + 1}`
    const expect = optionalStringProperty(step, "expect", index)
    const reject = optionalStringProperty(step, "reject", index)
    const waitMs = step.waitMs === undefined
      ? numberFromEnv("FLAGHACK_TMUX_FINAL_WAIT_MS", 1_000)
      : typeof step.waitMs === "number"
          && Number.isFinite(step.waitMs)
          && step.waitMs >= 0
      ? step.waitMs
      : undefined
    if (waitMs === undefined) {
      throw new Error(
        `FLAGHACK_TMUX_STEPS step ${
          index + 1
        } waitMs must be a non-negative number`
      )
    }

    return {
      ...(expect === undefined
        ? {}
        : { expectPattern: new RegExp(expect, "u") }),
      keys: step.keys,
      label: label.replace(/[^a-zA-Z0-9_.-]+/gu, "-")
        || `step-${index + 1}`,
      ...(reject === undefined
        ? {}
        : { rejectPattern: new RegExp(reject, "u") }),
      waitMs
    }
  })
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

const ensureDefaultCliPastSetup = async (pane: string): Promise<void> => {
  const startedAt = Date.now()
  let sentRole = false
  let sentConfirm = false

  while (Date.now() - startedAt < CLI_WAIT_TIMEOUT_MS) {
    if (paneDead(pane)) {
      throw new Error("CLI tmux pane exited before setup completed")
    }

    const capture = stripAnsi(capturePane(pane))
    if (captureShowsDefaultCliReady(capture)) return

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
  const cliCommandWithApiUrl = `export FLAGHACK_API_URL=${
    shellQuote(BASE_URL)
  }; ${perfExportCommands()}${cliCommand}`
  if (await isTcpPortOpen(PORT, HOST)) {
    throw new Error(
      `localhost:${PORT} is already in use; stop the existing server before running the tmux feature gate`
    )
  }

  const keys = parseJsonArrayEnv("FLAGHACK_TMUX_KEYS", ["j"])
  const featureSteps = parseFeatureSteps()
  const expectPattern = regexFromEnv("FLAGHACK_TMUX_EXPECT")
  const rejectPattern = regexFromEnv("FLAGHACK_TMUX_REJECT")
  const keyWaitMs = numberFromEnv(
    "FLAGHACK_TMUX_KEY_WAIT_MS",
    DEFAULT_KEY_WAIT_MS
  )
  const initialWaitMs = numberFromEnv("FLAGHACK_TMUX_INITIAL_WAIT_MS", 0)
  const finalWaitMs = numberFromEnv("FLAGHACK_TMUX_FINAL_WAIT_MS", 1_000)
  const windowWidth = numberFromEnv(
    "FLAGHACK_TMUX_WINDOW_WIDTH",
    DEFAULT_WINDOW_WIDTH
  )
  if (windowWidth < 40) {
    throw new Error("FLAGHACK_TMUX_WINDOW_WIDTH must be at least 40")
  }
  const autoSetup = booleanFromEnv("FLAGHACK_TMUX_AUTO_SETUP", true)
  const allowCliExit = booleanFromEnv(
    "FLAGHACK_TMUX_ALLOW_CLI_EXIT",
    false
  )
  const label =
    process.env.FLAGHACK_TMUX_LABEL?.replace(/[^a-zA-Z0-9_.-]+/gu, "-")
    || "feature"

  const session = `flag-hack-${label}-${process.pid}-${Date.now()}`
  const artifactDir = await mkdtemp(
    path.join(tmpdir(), "flag-hack-tmux-feature-")
  )
  const capturePath = path.join(artifactDir, "cli-pane.txt")
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
      String(windowWidth),
      "-y",
      "40",
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

    if (allowCliExit) {
      tmux(["set-window-option", "-t", session, "remain-on-exit", "on"])
    }

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
    if (autoSetup && cliCommand === DEFAULT_CLI_COMMAND) {
      await ensureDefaultCliPastSetup(cliPane)
    }
    if (initialWaitMs > 0) {
      await delay(initialWaitMs)
    }
    if (featureSteps === undefined) {
      await sendKeys(cliPane, keys, keyWaitMs)
      await delay(finalWaitMs)
    } else {
      for (const step of featureSteps) {
        await sendKeys(cliPane, step.keys, keyWaitMs)
        await delay(step.waitMs)
        const stepCapture = capturePane(cliPane)
        await writeFile(
          path.join(artifactDir, `cli-pane-${step.label}.txt`),
          stepCapture
        )
        assertCapture(
          stripAnsi(stepCapture),
          step.expectPattern,
          step.rejectPattern
        )
      }
    }

    const capture = capturePane(cliPane)
    await writeFile(capturePath, capture)

    if (paneDead(cliPane) && !allowCliExit) {
      throw new Error("CLI tmux pane exited after feature input")
    }

    assertCapture(stripAnsi(capture), expectPattern, rejectPattern)

    const inputSummary = featureSteps === undefined
      ? `keys=${JSON.stringify(keys)}`
      : `steps=${
        JSON.stringify(featureSteps.map((step) => ({
          keys: step.keys,
          label: step.label
        })))
      }`
    console.log(
      `tmux feature check passed with ${tmuxVersion}; ${inputSummary}; capture=${capturePath}${
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
