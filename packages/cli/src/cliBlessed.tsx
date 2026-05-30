#!/usr/bin/env node
import blessed from "blessed"
// import { render } from "ink"
import React from "react"
import { render } from "react-blessed"
import BApp from "./BApp.js"

export const startblessed = () => {
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

  // Adding a way to quit the program
  screen.key(["C-c"], function(_ch, _key) {
    return process.exit(0)
  })

  process.once("SIGTERM", () => {
    screen.destroy()
    process.exit(0)
  })

  return render(<BApp />, screen)
}
// export type CliType = typeof cli
// render(<App opts={cli} />)
