import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "@effect/platform";
import { Schema } from "effect";
export const TodoId = /*#__PURE__*/Schema.Number.pipe(/*#__PURE__*/Schema.brand("TodoId"));
export const TodoIdFromString = /*#__PURE__*/Schema.NumberFromString.pipe(/*#__PURE__*/Schema.compose(TodoId));
export class Todo extends /*#__PURE__*/Schema.Class("Todo")({
  id: TodoId,
  text: Schema.NonEmptyTrimmedString,
  done: Schema.Boolean
}) {}
export class TodoNotFound extends /*#__PURE__*/Schema.TaggedError()("TodoNotFound", {
  id: Schema.Number
}) {}
export class TodosApiGroup extends /*#__PURE__*/HttpApiGroup.make("todos").add(HttpApiEndpoint.get("getAllTodos", "/todos").addSuccess(Schema.Array(Todo))).add(HttpApiEndpoint.get("getTodoById", "/todos/:id").addSuccess(Todo).addError(TodoNotFound, {
  status: 404
}).setPath(Schema.Struct({
  id: Schema.NumberFromString
}))).add(HttpApiEndpoint.post("createTodo", "/todos").addSuccess(Todo).setPayload(Schema.Struct({
  text: Schema.NonEmptyTrimmedString
}))).add(HttpApiEndpoint.patch("completeTodo", "/todos/:id").addSuccess(Todo).addError(TodoNotFound, {
  status: 404
}).setPath(Schema.Struct({
  id: Schema.NumberFromString
}))).add(/*#__PURE__*/HttpApiEndpoint.del("removeTodo", "/todos/:id").addSuccess(Schema.Void).addError(TodoNotFound, {
  status: 404
}).setPath(/*#__PURE__*/Schema.Struct({
  id: Schema.NumberFromString
}))) {}
export class TodosApi extends /*#__PURE__*/HttpApi.make("api").add(TodosApiGroup) {}
//# sourceMappingURL=TodosApi.js.map