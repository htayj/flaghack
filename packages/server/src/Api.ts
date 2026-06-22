import { HttpApiBuilder } from "@effect/platform"
import { GameApi } from "@flaghack/domain/GameApi"
import { Effect, Layer } from "effect"
import { GameRepository } from "./GameRepository.js"

const GameApiLive = HttpApiBuilder.group(
  GameApi,
  "game",
  (handlers) =>
    Effect.gen(function*() {
      const game = yield* GameRepository
      return handlers
        .handle("getLogs", () => game.getLogs)
        .handle("getWorld", () => game.getWorld)
        .handle("getInventory", () => game.getInventory)
        .handle("getClientState", () => game.getClientState)
        .handle("getPickupItemsFor", ({ urlParams: { key } }) =>
          game.getPickupItemsFor(key))
        .handle("getLootContainersFor", ({ urlParams: { key } }) =>
          game.getLootContainersFor(key))
        .handle(
          "getLootItemsFor",
          ({ urlParams: { containerKey, key } }) =>
            game.getLootItemsFor(key, containerKey)
        )
        .handle("doAction", ({ payload: { action } }) =>
          game.doPlayerAction(action))
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
