import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "@effect/platform";
import { Schema } from "effect";
export declare const TodoId: Schema.brand<typeof Schema.Number, "TodoId">;
export type TodoId = typeof TodoId.Type;
export declare const TodoIdFromString: Schema.transform<typeof Schema.NumberFromString, Schema.brand<typeof Schema.Number, "TodoId">>;
declare const Todo_base: Schema.Class<Todo, {
    id: Schema.brand<typeof Schema.Number, "TodoId">;
    text: typeof Schema.NonEmptyTrimmedString;
    done: typeof Schema.Boolean;
}, Schema.Struct.Encoded<{
    id: Schema.brand<typeof Schema.Number, "TodoId">;
    text: typeof Schema.NonEmptyTrimmedString;
    done: typeof Schema.Boolean;
}>, never, {
    readonly id: number & import("effect/Brand").Brand<"TodoId">;
} & {
    readonly text: string;
} & {
    readonly done: boolean;
}, {}, {}>;
export declare class Todo extends Todo_base {
}
declare const TodoNotFound_base: Schema.TaggedErrorClass<TodoNotFound, "TodoNotFound", {
    readonly _tag: Schema.tag<"TodoNotFound">;
} & {
    id: typeof Schema.Number;
}>;
export declare class TodoNotFound extends TodoNotFound_base {
}
declare const TodosApiGroup_base: HttpApiGroup.HttpApiGroup<"todos", HttpApiEndpoint.HttpApiEndpoint<"getAllTodos", "GET", never, never, never, never, readonly Todo[], never, never, never> | HttpApiEndpoint.HttpApiEndpoint<"getTodoById", "GET", {
    readonly id: number;
}, never, never, never, Todo, TodoNotFound, never, never> | HttpApiEndpoint.HttpApiEndpoint<"createTodo", "POST", never, never, {
    readonly text: string;
}, never, Todo, never, never, never> | HttpApiEndpoint.HttpApiEndpoint<"completeTodo", "PATCH", {
    readonly id: number;
}, never, never, never, Todo, TodoNotFound, never, never> | HttpApiEndpoint.HttpApiEndpoint<"removeTodo", "DELETE", {
    readonly id: number;
}, never, never, never, void, TodoNotFound, never, never>, never, never, false>;
export declare class TodosApiGroup extends TodosApiGroup_base {
}
declare const TodosApi_base: HttpApi.HttpApi<"api", typeof TodosApiGroup, import("@effect/platform/HttpApiError").HttpApiDecodeError, never>;
export declare class TodosApi extends TodosApi_base {
}
export {};
//# sourceMappingURL=TodosApi.d.ts.map