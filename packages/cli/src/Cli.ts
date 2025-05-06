import { Command } from "@effect/cli"
import { Effect } from "effect"
import { startblessed } from "./cliBlessed.js"
import { GameClient } from "./GameClient.js"

const test = Command.make("test").pipe(
  Command.withDescription("test getting a world"),
  Command.withHandler(() =>
    GameClient.doPlayerAction({ _tag: "move", dir: "S" })
  )
)
const inventory = Command.make("i").pipe(
  Command.withDescription("Add a new todo"),
  Command.withHandler(() => GameClient.getInventory)
)
const playBlessed = Command.make("playB").pipe(
  Command.withDescription("play the game"),
  Command.withHandler(() => Effect.sync(() => startblessed()))
)
const command = Command.make("todo").pipe(
  Command.withSubcommands([test, inventory, playBlessed])
)

export const cli = Command.run(command, {
  name: "Todo CLI",
  version: "0.0.0"
})
