import { Command, Options } from "@effect/cli"
import type { World as WorldSchema } from "@flaghack/domain/schemas"
import { Console, Effect, HashMap } from "effect"
import { startblessed } from "./cliBlessed.js"
import { resolveCliDebugMessages } from "./config.js"
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
const debugMessagesOption = Options.boolean("debug-messages", {
  ifPresent: true
}).pipe(
  Options.withDescription(
    "Show debug input trace messages in the in-game message box"
  )
)

const playBlessed = Command.make("playB", {
  debugMessages: debugMessagesOption
}).pipe(
  Command.withDescription("play the game"),
  Command.withHandler(({ debugMessages }) =>
    Effect.sync(() =>
      startblessed({
        debugMessages: debugMessages
          || resolveCliDebugMessages([], process.env)
      })
    )
  )
)
const command = Command.make("flag-hack").pipe(
  Command.withSubcommands([moveSouth, inventory, playBlessed])
)

export const cli = Command.run(command, {
  name: "Flag Hack CLI",
  version: "0.0.0"
})
