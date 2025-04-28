import { HttpApiBuilder, HttpMiddleware } from "@effect/platform";
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { Layer } from "effect";
import { createServer } from "node:http";
import { ApiLive } from "./Api.js";
import { TodosRepository } from "./TodosRepository.js";
const HttpLive = /*#__PURE__*/HttpApiBuilder.serve(HttpMiddleware.logger).pipe(/*#__PURE__*/Layer.provide(ApiLive), /*#__PURE__*/Layer.provide(TodosRepository.Default), /*#__PURE__*/Layer.provide(/*#__PURE__*/NodeHttpServer.layer(createServer, {
  port: 3000
})));
Layer.launch(HttpLive).pipe(NodeRuntime.runMain);
//# sourceMappingURL=server.js.map