import { Command } from "@effect/cli"
import type { World as WorldSchema } from "@flaghack/domain/schemas"
import { Console, Effect, HashMap } from "effect"
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
type Inventory = typeof WorldSchema.Type

const formatInventory = (inventory: Inventory): string => {
  const items = Array.from(inventory.pipe(HashMap.values))

  if (items.length === 0) {
    return "Inventory is empty."
  }

  return `Inventory: ${items.map(({ _tag }) => _tag).join(", ")}`
}

const inventory = Command.make("i").pipe(
  Command.withDescription("Show player inventory"),
  Command.withHandler(() =>
    Effect.gen(function*() {
      const currentInventory = yield* GameClient.getInventory

      yield* Console.log(formatInventory(currentInventory))
    })
  )
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
