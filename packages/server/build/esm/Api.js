import { HttpApiBuilder } from "@effect/platform";
import { TodosApi } from "@template/domain/TodosApi";
import { Effect, Layer } from "effect";
import { TodosRepository } from "./TodosRepository.js";
const TodosApiLive = /*#__PURE__*/HttpApiBuilder.group(TodosApi, "todos", handlers => Effect.gen(function* () {
  const todos = yield* TodosRepository;
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
export const ApiLive = /*#__PURE__*/HttpApiBuilder.api(TodosApi).pipe(/*#__PURE__*/Layer.provide(TodosApiLive));
//# sourceMappingURL=Api.js.map