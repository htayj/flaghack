"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ApiLive = void 0;
var _platform = require("@effect/platform");
var _TodosApi = require("@template/domain/TodosApi");
var _effect = require("effect");
var _TodosRepository = require("./TodosRepository.js");
const TodosApiLive = /*#__PURE__*/_platform.HttpApiBuilder.group(_TodosApi.TodosApi, "todos", handlers => _effect.Effect.gen(function* () {
  const todos = yield* _TodosRepository.TodosRepository;
  return handlers.handle("getAllTodos", () => todos.getAll).handle("getTodoById", ({
    path: {
      id
    }
  }) => todos.getById(id)).handle("createTodo", ({
    payload: {
      text
    }
  }) => todos.create(text)).handle("completeTodo", ({
    path: {
      id
    }
  }) => todos.complete(id)).handle("removeTodo", ({
    path: {
      id
    }
  }) => todos.remove(id));
}));
const ApiLive = exports.ApiLive = /*#__PURE__*/_platform.HttpApiBuilder.api(_TodosApi.TodosApi).pipe(/*#__PURE__*/_effect.Layer.provide(TodosApiLive));
//# sourceMappingURL=Api.js.map