#!/usr/bin/env node
import blessed from "blessed"
// import { render } from "ink"
import React from "react"
import { render } from "react-blessed"
import BApp from "./BApp.js"

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
screen.key(["C-c"], function(ch, key) {
  return process.exit(0)
})

process.on("SIGTERM", () => {
  screen.destroy()
  process.exit(0)
})
export const startblessed = () => render(<BApp />, screen)
// export type CliType = typeof cli
// render(<App opts={cli} />)
