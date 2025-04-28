#!/usr/bin/env node
import { NodeContext, NodeHttpClient, NodeRuntime } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { cli } from "./Cli.js";
import { TodosClient } from "./TodosClient.js";
const MainLive = /*#__PURE__*/TodosClient.Default.pipe(/*#__PURE__*/Layer.provide(NodeHttpClient.layerUndici), /*#__PURE__*/Layer.merge(NodeContext.layer));
cli(process.argv).pipe(Effect.provide(MainLive), NodeRuntime.runMain);
//# sourceMappingURL=bin.js.map