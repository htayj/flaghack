import { HttpApiBuilder } from "@effect/platform"
import { GameApi } from "@flaghack/domain/TodosApi"
import { Effect, Layer } from "effect"
import { GameRepository } from "./GameRepository.js"

const GameApiLive = HttpApiBuilder.group(
  GameApi,
  "todos",
  (handlers) =>
    Effect.gen(function*() {
      const game = yield* GameRepository
      return handlers
        .handle("getLogs", () => game.getLogs)
        .handle("getWorld", () => game.getWorld)
        .handle("getInventory", () => game.getInventory)
        .handle("doAction", ({ payload }) => game.doPlayerAction(payload))
      // .handle("getTodoById", ({ path: { id } }) => game.getById(id))
      // .handle(
      //   "createTodo",
      //   ({ payload: { text } }) => game.create(text)
      // )
      // .handle("completeTodo", ({ path: { id } }) => game.complete(id))
      // .handle("removeTodo", ({ path: { id } }) => game.remove(id))
    })
)

export const ApiLive = HttpApiBuilder.api(GameApi).pipe(
  Layer.provide(GameApiLive)
)
