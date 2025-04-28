import { Effect } from "effect";
declare const TodosClient_base: Effect.Service.Class<TodosClient, "cli/TodosClient", {
    readonly accessors: true;
    readonly effect: Effect.Effect<{
        readonly create: (text: string) => Effect.Effect<void, import("@effect/platform/HttpApiError").HttpApiDecodeError | import("@effect/platform/HttpClientError").HttpClientError | import("effect/ParseResult").ParseError, never>;
        readonly list: Effect.Effect<void, import("@effect/platform/HttpApiError").HttpApiDecodeError | import("@effect/platform/HttpClientError").HttpClientError | import("effect/ParseResult").ParseError, never>;
        readonly complete: (id: number) => Effect.Effect<void, import("@effect/platform/HttpApiError").HttpApiDecodeError | import("@effect/platform/HttpClientError").HttpClientError | import("effect/ParseResult").ParseError, never>;
        readonly remove: (id: number) => Effect.Effect<void, import("@effect/platform/HttpApiError").HttpApiDecodeError | import("@effect/platform/HttpClientError").HttpClientError | import("effect/ParseResult").ParseError, never>;
    }, never, import("@effect/platform/HttpClient").HttpClient>;
}>;
export declare class TodosClient extends TodosClient_base {
}
export {};
//# sourceMappingURL=TodosClient.d.ts.map