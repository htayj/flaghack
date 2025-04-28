"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.TodosRepository = void 0;
var _TodosApi = require("@template/domain/TodosApi");
var _effect = require("effect");
class TodosRepository extends /*#__PURE__*/_effect.Effect.Service()("api/TodosRepository", {
  effect: /*#__PURE__*/_effect.Effect.gen(function* () {
    const todos = yield* _effect.Ref.make(_effect.HashMap.empty());
    const getAll = _effect.Ref.get(todos).pipe(_effect.Effect.map(todos => Array.from(_effect.HashMap.values(todos))));
    function getById(id) {
      return _effect.Ref.get(todos).pipe(_effect.Effect.flatMap(_effect.HashMap.get(id)), _effect.Effect.catchTag("NoSuchElementException", () => new _TodosApi.TodoNotFound({
        id
      })));
    }
    function create(text) {
      return _effect.Ref.modify(todos, map => {
        const id = _TodosApi.TodoId.make(_effect.HashMap.reduce(map, 0, (max, todo) => todo.id > max ? todo.id : max));
        const todo = new _TodosApi.Todo({
          id,
          text,
          done: false
        });
        return [todo, _effect.HashMap.set(map, id, todo)];
      });
    }
    function complete(id) {
      return getById(id).pipe(_effect.Effect.map(todo => new _TodosApi.Todo({
        ...todo,
        done: true
      })), _effect.Effect.tap(todo => _effect.Ref.update(todos, _effect.HashMap.set(todo.id, todo))));
    }
    function remove(id) {
      return getById(id).pipe(_effect.Effect.flatMap(todo => _effect.Ref.update(todos, _effect.HashMap.remove(todo.id))));
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
exports.TodosRepository = TodosRepository;
//# sourceMappingURL=TodosRepository.js.map