import { Todo, TodoId, TodoNotFound } from "@template/domain/TodosApi";
import { Effect, HashMap, Ref } from "effect";
export class TodosRepository extends /*#__PURE__*/Effect.Service()("api/TodosRepository", {
  effect: /*#__PURE__*/Effect.gen(function* () {
    const todos = yield* Ref.make(HashMap.empty());
    const getAll = Ref.get(todos).pipe(Effect.map(todos => Array.from(HashMap.values(todos))));
    function getById(id) {
      return Ref.get(todos).pipe(Effect.flatMap(HashMap.get(id)), Effect.catchTag("NoSuchElementException", () => new TodoNotFound({
        id
      })));
    }
    function create(text) {
      return Ref.modify(todos, map => {
        const id = TodoId.make(HashMap.reduce(map, 0, (max, todo) => todo.id > max ? todo.id : max));
        const todo = new Todo({
          id,
          text,
          done: false
        });
        return [todo, HashMap.set(map, id, todo)];
      });
    }
    function complete(id) {
      return getById(id).pipe(Effect.map(todo => new Todo({
        ...todo,
        done: true
      })), Effect.tap(todo => Ref.update(todos, HashMap.set(todo.id, todo))));
    }
    function remove(id) {
      return getById(id).pipe(Effect.flatMap(todo => Ref.update(todos, HashMap.remove(todo.id))));
    }
    return {
      getAll,
      getById,
      create,
      complete,
      remove
    };
  })
}) {}
//# sourceMappingURL=TodosRepository.js.map