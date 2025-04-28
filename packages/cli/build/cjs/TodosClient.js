"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.TodosClient = void 0;
var _platform = require("@effect/platform");
var _TodosApi = require("@template/domain/TodosApi");
var _effect = require("effect");
class TodosClient extends /*#__PURE__*/_effect.Effect.Service()("cli/TodosClient", {
  accessors: true,
  effect: /*#__PURE__*/_effect.Effect.gen(function* () {
    const client = yield* _platform.HttpApiClient.make(_TodosApi.TodosApi, {
      baseUrl: "http://localhost:3000"
    });
    function create(text) {
      return client.todos.createTodo({
        payload: {
          text
        }
      }).pipe(_effect.Effect.flatMap(todo => _effect.Effect.logInfo("Created todo: ", todo)));
    }
    const list = client.todos.getAllTodos().pipe(_effect.Effect.flatMap(todos => _effect.Effect.logInfo(todos)));
    function complete(id) {
      return client.todos.completeTodo({
        path: {
          id
        }
      }).pipe(_effect.Effect.flatMap(todo => _effect.Effect.logInfo("Marked todo completed: ", todo)), _effect.Effect.catchTag("TodoNotFound", () => _effect.Effect.logError(`Failed to find todo with id: ${id}`)));
    }
    function remove(id) {
      return client.todos.removeTodo({
        path: {
          id
        }
      }).pipe(_effect.Effect.flatMap(() => _effect.Effect.logInfo(`Deleted todo with id: ${id}`)), _effect.Effect.catchTag("TodoNotFound", () => _effect.Effect.logError(`Failed to find todo with id: ${id}`)));
    }
    return {
      create,
      list,
      complete,
      remove
    };
  })
}) {}
exports.TodosClient = TodosClient;
//# sourceMappingURL=TodosClient.js.map