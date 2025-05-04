import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "@effect/platform"
import { GameState, SAction, World } from "@flaghack/domain/schemas"
import { Schema } from "effect"

// export const TodoId = Schema.Number.pipe(Schema.brand("TodoId"))
// export type TodoId = typeof TodoId.Type

// export const TodoIdFromString = Schema.NumberFromString.pipe(
//   Schema.compose(TodoId)
// )

// export class Todo extends Schema.Class<Todo>("Todo")({
//   id: TodoId,
//   text: Schema.NonEmptyTrimmedString,
//   done: Schema.Boolean
// }) {}

// export class TodoNotFound
//   extends Schema.TaggedError<TodoNotFound>()("TodoNotFound", {
//     id: Schema.Number
//   })
// {}

export class GameApiGroup extends HttpApiGroup.make("todos")
  .add(
    HttpApiEndpoint.get("getLogs", "/logs").addSuccess(
      Schema.Array(Schema.String)
    )
  )
  .add(
    HttpApiEndpoint.get("getWorld", "/world").addSuccess(World)
  )
  .add(
    HttpApiEndpoint.get("getInventory", "/logs").addSuccess(
      Schema.Array(World)
    )
  )
  .add(
    HttpApiEndpoint.post("doAction", "/act")
      .addSuccess(GameState)
      .setPayload(SAction)
  )
// .add(
//   HttpApiEndpoint.get("getTodoById", "/todos/:id")
//     .addSuccess(Todo)
//     .addError(TodoNotFound, { status: 404 })
//     .setPath(Schema.Struct({ id: Schema.NumberFromString }))
// )
// .add(
//   HttpApiEndpoint.post("createTodo", "/todos")
//     .addSuccess(Todo)
//     .setPayload(Schema.Struct({ text: Schema.NonEmptyTrimmedString }))
// )
// .add(
//   HttpApiEndpoint.patch("completeTodo", "/todos/:id")
//     .addSuccess(Todo)
//     .addError(TodoNotFound, { status: 404 })
//     .setPath(Schema.Struct({ id: Schema.NumberFromString }))
// )
// .add(
//   HttpApiEndpoint.del("removeTodo", "/todos/:id")
//     .addSuccess(Schema.Void)
//     .addError(TodoNotFound, { status: 404 })
//     .setPath(Schema.Struct({ id: Schema.NumberFromString }))
// )
{}

export class GameApi extends HttpApi.make("api").add(GameApiGroup) {}
