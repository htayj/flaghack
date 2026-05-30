import { Command } from "@effect/cli"
import { Effect } from "effect"
import { startblessed } from "./cliBlessed.js"
import { GameClient } from "./GameClient.js"

const moveSouth = Command.make("move-south").pipe(
  Command.withDescription(
    "Submit a debug move-south action to the game server"
  ),
  Command.withHandler(() =>
    GameClient.doPlayerAction({ _tag: "move", dir: "S" })
  )
)
const inventory = Command.make("i").pipe(
  Command.withDescription("Show player inventory"),
  Command.withHandler(() => GameClient.getInventory)
)
const playBlessed = Command.make("playB").pipe(
  Command.withDescription("play the game"),
  Command.withHandler(() => Effect.sync(() => startblessed()))
)
const command = Command.make("flag-hack").pipe(
  Command.withSubcommands([moveSouth, inventory, playBlessed])
)

export const cli = Command.run(command, {
  name: "Flag Hack CLI",
  version: "0.0.0"
})
