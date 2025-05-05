#!/usr/bin/env node

import {
  NodeContext,
  NodeHttpClient,
  NodeRuntime
} from "@effect/platform-node"
import { EAction } from "@flaghack/domain/schemas"
import blessed from "blessed"
import { Effect, Layer } from "effect"
import { cli } from "./Cli.js"
import GameBoard from "./components/GameBoard.js"
import { gameboard } from "./gameboard.js"
import { GameClient } from "./GameClient.js"
import { playbox } from "./playing.js"
// var blessed = require("reblessed")

export const MainLive = GameClient.Default.pipe(
  Layer.provide(NodeHttpClient.layerUndici),
  Layer.merge(NodeContext.layer)
)

// const parseInput = (input: any, _: any) => {
//   switch (input) {
//     case "j":
//       return Effect.runPromise(
//         GameClient.doPlayerAction(EAction.move({ dir: "S" })).pipe(
//           Effect.provide(MainLive)
//         )
//       )
//     case "h":
//       GameClient.doPlayerAction(EAction.move({ dir: "W" }))
//       return
//     case "k":
//       GameClient.doPlayerAction(EAction.move({ dir: "N" }))
//       return
//     case "l":
//       GameClient.doPlayerAction(EAction.move({ dir: "E" }))
//       return
//     case "y":
//       GameClient.doPlayerAction(EAction.move({ dir: "NW" }))
//       return
//     case "u":
//       GameClient.doPlayerAction(EAction.move({ dir: "NE" }))
//       return
//     case "b":
//       GameClient.doPlayerAction(EAction.move({ dir: "SW" }))
//       return
//     case "n":
//       GameClient.doPlayerAction(EAction.move({ dir: "SE" }))
//       return
//     default:
//       GameClient.doPlayerAction(EAction.noop())
//   }
// }

const drawResult = (res: string) =>
  Effect.gen(function*() {
    const screen = blessed.screen({})
    // const tiles = yield* GameClient.getWorld
    var world = yield* GameClient.getWorld
    const board = yield* playbox(world)
    // const box = blessed.box({
    //   top: "center",
    //   left: "center",
    //   width: "50%",
    //   height: "50%",
    //   label: "MESSAGES",
    //   style: {
    //     fg: "white",
    //     bg: "black",
    //     border: {
    //       fg: "blue"
    //     },
    //     hover: { bg: "green" }
    //   },
    //   border: {
    //     type: "line"
    //   }
    // })
    // box.setContent(res)
    // screen.append(box)
    screen.append(board)
    console.log("ghghghgh")
    screen.key(["escape", "q", "C-c"], function(ch, key) {
      return process.exit(0)
    })
    // screen.key(["j", "h", "l", "k"], (ch, k) =>
    //   parseInput(ch, k)?.then((a) => {
    //     world = a.world
    //     screen.render()
    //   }))
    screen.render()
  })
// const screen = b.screen({})
// const box = b.box({ parent: screen, scrollable: true })
const fakerunme = GameClient.getInventory.pipe(
  Effect.tap((s) => drawResult(JSON.stringify(s)))
)
// const runme = Effect.succeed(startapp(GameClient))

// fakerunme.pipe(
//   Effect.provide(MainLive),
//   NodeRuntime.runMain
// )
cli(process.argv).pipe(
  Effect.provide(MainLive),
  NodeRuntime.runMain
)

// import {
//   NodeContext,
//   NodeHttpClient,
//   NodeRuntime
// } from "@effect/platform-node"
// import { Effect, Layer, ManagedRuntime, pipe } from "effect"
// import { cli } from "./Cli.js"
// // import { startapp } from "./cli.js"
// import { GameClient } from "./GameClient.js"

// const MainLive = GameClient.Default.pipe(
//   Layer.provide(NodeHttpClient.layerUndici),
//   Layer.merge(NodeContext.layer)
// )

// // const MainLiveRuntime = ManagedRuntime.make(MainLive)
// // MainLiveRuntime.runFork(cli)
// pipe(
//   // Effect.provide(MainLive),
//   // Effect.runFork(() => startapp(GameClient)),
//   NodeRuntime.runMain(cli)
//   // Effect.runFork( startapp)
// )
