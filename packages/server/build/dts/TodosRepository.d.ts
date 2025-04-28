import { Todo, TodoNotFound } from "@template/domain/TodosApi";
import { Effect } from "effect";
declare const TodosRepository_base: Effect.Service.Class<TodosRepository, "api/TodosRepository", {
    readonly effect: Effect.Effect<{
        readonly getAll: Effect.Effect<Todo[], never, never>;
        readonly getById: (id: number) => Effect.Effect<Todo, TodoNotFound>;
        readonly create: (text: string) => Effect.Effect<Todo>;
        readonly complete: (id: number) => Effect.Effect<Todo, TodoNotFound>;
        readonly remove: (id: number) => Effect.Effect<void, TodoNotFound>;
    }, never, never>;
}>;
export declare class TodosRepository extends TodosRepository_base {
}
export {};
//# sourceMappingURL=TodosRepository.d.ts.map