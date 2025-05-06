// import { Args, Command, Options } from "@effect/cli"
import { Command } from "@effect/cli"
import { Effect } from "effect"
import { Service } from "effect/Effect"
// import { startapp } from "./cli.js"
import { startblessed } from "./cliBlessed.js"
import { GameClient } from "./GameClient.js"

// const todoArg = Args.text({ name: "todo" }).pipe(
//   Args.withDescription("The message associated with a todo")
// )

// const todoId = Options.integer("id").pipe(
//   Options.withDescription("The identifier of the todo")
// )

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
// const playInk = Command.make("playInk").pipe(
//   Command.withDescription("play the game"),
//   Command.withHandler(() => Effect.sync(() => startapp()))
// )
const playBlessed = Command.make("playB").pipe(
  Command.withDescription("play the game"),
  Command.withHandler(() => Effect.sync(() => startblessed()))
)
// const add = Command.make("add", { todo: todoArg }).pipe(
//   Command.withDescription("Add a new todo"),
//   Command.withHandler(({ todo }) => GameClient.create(todo))
// )

// const done = Command.make("done", { id: todoId }).pipe(
//   Command.withDescription("Mark a todo as done"),
//   Command.withHandler(({ id }) => GameClient.complete(id))
// )

// const list = Command.make("list").pipe(
//   Command.withDescription("List all todos"),
//   Command.withHandler(() => GameClient.list)
// )

// const remove = Command.make("remove", { id: todoId }).pipe(
//   Command.withDescription("Remove a todo"),
//   Command.withHandler(({ id }) => GameClient.remove(id))
// )

// const command = Command.make("todo").pipe(
//   Command.withSubcommands([add, done, list, remove])
// )
const command = Command.make("todo").pipe(
  Command.withSubcommands([test, inventory, playBlessed])
)

// export const cli = Effect.succeed(startapp())
export const cli = Command.run(command, {
  name: "Todo CLI",
  version: "0.0.0"
})
