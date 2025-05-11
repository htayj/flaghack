import { HttpApiClient } from "@effect/platform"
import { GameApi } from "@flaghack/domain/GameApi"
import { Action, Key } from "@flaghack/domain/schemas"
import { Effect } from "effect"

type Key = typeof Key.Type

export class GameClient
  extends Effect.Service<GameClient>()("cli/GameClient", {
    accessors: true,
    effect: Effect.gen(function*() {
      const client = yield* HttpApiClient.make(GameApi, {
        baseUrl: "http://localhost:3000"
      })

      // function create(text: string) {
      //   return client.todos.createTodo({ payload: { text } }).pipe(
      //     Effect.flatMap((todo) => Effect.logInfo("Created todo: ", todo))
      //   )
      // function getLogs() {
      //   return client.game.getLogs().pipe(
      //     Effect.flatMap((logs) => Effect.logInfo("gotlogs: ", logs))
      //   )
      // }
      const getLogs = client.game.getLogs()
      const getInventory = client.game.getInventory()
      const getWorld = client.game.getWorld()
      // const getPickupItemsFor = client.game.getPickupItemsFor
      function getPickupItemsFor(key: Key) {
        return client.game.getPickupItemsFor({ urlParams: { key } })
      }
      function doPlayerAction(action: Action) {
        return client.game.doAction({ payload: { action } })
      }
      // function doPlayerAction(action: Action) {
      //   return client.game.doAction({ payload: { action } }).pipe(
      //     Effect.flatMap((world) =>
      //       Effect.logInfo(
      //         "new player: ",
      //         JSON.stringify(
      //           world.world.pipe(filter((e) => e._tag === "player"))
      //         )
      //       )
      //     )
      //   )
      // }

      // const list = client.game.getAllTodos().pipe(
      //   Effect.flatMap((todos) => Effect.logInfo(todos))
      // )

      // function complete(id: number) {
      //   return client.game.completeTodo({ path: { id } }).pipe(
      //     Effect.flatMap((todo) =>
      //       Effect.logInfo("Marked todo completed: ", todo)
      //     ),
      //     Effect.catchTag(
      //       "TodoNotFound",
      //       () => Effect.logError(`Failed to find todo with id: ${id}`)
      //     )
      //   )
      // }

      // function remove(id: number) {
      //   return client.game.removeTodo({ path: { id } }).pipe(
      //     Effect.flatMap(() =>
      //       Effect.logInfo(`Deleted todo with id: ${id}`)
      //     ),
      //     Effect.catchTag(
      //       "TodoNotFound",
      //       () => Effect.logError(`Failed to find todo with id: ${id}`)
      //     )
      //   )
      // }

      return {
        getLogs,
        getWorld,
        getInventory,
        getPickupItemsFor,
        doPlayerAction
      } as const
    })
  })
{}
