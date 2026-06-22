#!/usr/bin/env node
import blessed from "blessed"
// import { render } from "ink"
import React from "react"
import { render } from "react-blessed"
import BApp from "./BApp.js"
import { resolveCliDebugMessages } from "./config.js"

type ShutdownSignal = "SIGINT" | "SIGTERM"

const createShutdown = (screen: blessed.Widgets.Screen) => {
  let destroyed = false

  const shutdown = (signal: ShutdownSignal) => {
    if (!destroyed) {
      destroyed = true
      screen.destroy()
    }

    process.removeListener(signal, signalHandlers[signal])
    process.kill(process.pid, signal)
  }

  const signalHandlers: Readonly<Record<ShutdownSignal, () => void>> = {
    SIGINT: () => shutdown("SIGINT"),
    SIGTERM: () => shutdown("SIGTERM")
  }

  return { shutdown, signalHandlers }
}

export type StartBlessedOptions = {
  readonly debugMessages?: boolean | undefined
}

export const startblessed = (options: StartBlessedOptions = {}) => {
  const debugMessages = options.debugMessages
    ?? resolveCliDebugMessages(process.argv.slice(2), process.env)
  const screen = blessed.screen({
    // autoPadding: false,
    autoPadding: true,
    // smartCSR: true,
    fastCSR: true,
    debug: true,
    // warnings: true,
    // useBCE: true,
    title: "react-blessed hello world"
  })

  const { shutdown, signalHandlers } = createShutdown(screen)

  // Adding a way to quit the program
  screen.key(["C-c"], function(_ch, _key) {
    shutdown("SIGINT")
  })

  process.once("SIGINT", signalHandlers.SIGINT)
  process.once("SIGTERM", signalHandlers.SIGTERM)

  return render(
    <BApp
      debugMessages={debugMessages}
      onQuit={() => shutdown("SIGINT")}
    />,
    screen
  )
}
// export type CliType = typeof cli
// render(<App opts={cli} />)
