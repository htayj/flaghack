import { HttpApiClient } from "@effect/platform";
import { TodosApi } from "@template/domain/TodosApi";
import { Effect } from "effect";
export class TodosClient extends /*#__PURE__*/Effect.Service()("cli/TodosClient", {
  accessors: true,
  effect: /*#__PURE__*/Effect.gen(function* () {
    const client = yield* HttpApiClient.make(TodosApi, {
      baseUrl: "http://localhost:3000"
    });
    function create(text) {
      return client.todos.createTodo({
        payload: {
          text
        }
      }).pipe(Effect.flatMap(todo => Effect.logInfo("Created todo: ", todo)));
    }
    const list = client.todos.getAllTodos().pipe(Effect.flatMap(todos => Effect.logInfo(todos)));
    function complete(id) {
      return client.todos.completeTodo({
        path: {
          id
        }
      }).pipe(Effect.flatMap(todo => Effect.logInfo("Marked todo completed: ", todo)), Effect.catchTag("TodoNotFound", () => Effect.logError(`Failed to find todo with id: ${id}`)));
    }
    function remove(id) {
      return client.todos.removeTodo({
        path: {
          id
        }
      }).pipe(Effect.flatMap(() => Effect.logInfo(`Deleted todo with id: ${id}`)), Effect.catchTag("TodoNotFound", () => Effect.logError(`Failed to find todo with id: ${id}`)));
    }
    return {
      create,
      list,
      complete,
      remove
    };
  })
}) {}
//# sourceMappingURL=TodosClient.js.map