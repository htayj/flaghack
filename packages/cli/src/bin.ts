#!/usr/bin/env node

import {
  NodeContext,
  NodeHttpClient,
  NodeRuntime
} from "@effect/platform-node"
// import { EAction } from "@flaghack/domain/schemas"
// import blessed from "blessed"
import { Effect, Layer } from "effect"
import { cli } from "./Cli.js"
import { GameClient } from "./GameClient.js"
// var blessed = require("reblessed")

export const MainLive = GameClient.Default.pipe(
  Layer.provide(NodeHttpClient.layerUndici),
  Layer.merge(NodeContext.layer)
)

// >> blessed vanilla
// const drawResult = (res: string) =>
//   Effect.gen(function*() {
//     const screen = blessed.screen({})
//     var world = yield* GameClient.getWorld
//     const board = yield* playbox(world)
//     screen.append(board)
//     console.log("ghghghgh")
//     screen.key(["escape", "q", "C-c"], function(ch, key) {
//       return process.exit(0)
//     })
//     screen.render()
//   })
// const screen = b.screen({})
// const box = b.box({ parent: screen, scrollable: true })
// const fakerunme = GameClient.getInventory.pipe(
//   Effect.tap((s) => drawResult(JSON.stringify(s)))
// )
// const runme = Effect.succeed(startapp(GameClient))

// fakerunme.pipe(
//   Effect.provide(MainLive),
//   NodeRuntime.runMain
// )

// >> blessed react
cli(process.argv).pipe(
  Effect.provide(MainLive),
  NodeRuntime.runMain
)
