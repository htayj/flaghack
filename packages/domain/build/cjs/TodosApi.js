"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.TodosApiGroup = exports.TodosApi = exports.TodoNotFound = exports.TodoIdFromString = exports.TodoId = exports.Todo = void 0;
var _platform = require("@effect/platform");
var _effect = require("effect");
const TodoId = exports.TodoId = /*#__PURE__*/_effect.Schema.Number.pipe(/*#__PURE__*/_effect.Schema.brand("TodoId"));
const TodoIdFromString = exports.TodoIdFromString = /*#__PURE__*/_effect.Schema.NumberFromString.pipe(/*#__PURE__*/_effect.Schema.compose(TodoId));
class Todo extends /*#__PURE__*/_effect.Schema.Class("Todo")({
  id: TodoId,
  text: _effect.Schema.NonEmptyTrimmedString,
  done: _effect.Schema.Boolean
}) {}
exports.Todo = Todo;
class TodoNotFound extends /*#__PURE__*/_effect.Schema.TaggedError()("TodoNotFound", {
  id: _effect.Schema.Number
}) {}
exports.TodoNotFound = TodoNotFound;
class TodosApiGroup extends /*#__PURE__*/_platform.HttpApiGroup.make("todos").add(_platform.HttpApiEndpoint.get("getAllTodos", "/todos").addSuccess(_effect.Schema.Array(Todo))).add(_platform.HttpApiEndpoint.get("getTodoById", "/todos/:id").addSuccess(Todo).addError(TodoNotFound, {
  status: 404
}).setPath(_effect.Schema.Struct({
  id: _effect.Schema.NumberFromString
}))).add(_platform.HttpApiEndpoint.post("createTodo", "/todos").addSuccess(Todo).setPayload(_effect.Schema.Struct({
  text: _effect.Schema.NonEmptyTrimmedString
}))).add(_platform.HttpApiEndpoint.patch("completeTodo", "/todos/:id").addSuccess(Todo).addError(TodoNotFound, {
  status: 404
}).setPath(_effect.Schema.Struct({
  id: _effect.Schema.NumberFromString
}))).add(/*#__PURE__*/_platform.HttpApiEndpoint.del("removeTodo", "/todos/:id").addSuccess(_effect.Schema.Void).addError(TodoNotFound, {
  status: 404
}).setPath(/*#__PURE__*/_effect.Schema.Struct({
  id: _effect.Schema.NumberFromString
}))) {}
exports.TodosApiGroup = TodosApiGroup;
class TodosApi extends /*#__PURE__*/_platform.HttpApi.make("api").add(TodosApiGroup) {}
exports.TodosApi = TodosApi;
//# sourceMappingURL=TodosApi.js.map