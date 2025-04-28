#!/usr/bin/env node
"use strict";

var _platformNode = require("@effect/platform-node");
var _effect = require("effect");
var _Cli = require("./Cli.js");
var _TodosClient = require("./TodosClient.js");
const MainLive = /*#__PURE__*/_TodosClient.TodosClient.Default.pipe(/*#__PURE__*/_effect.Layer.provide(_platformNode.NodeHttpClient.layerUndici), /*#__PURE__*/_effect.Layer.merge(_platformNode.NodeContext.layer));
(0, _Cli.cli)(process.argv).pipe(_effect.Effect.provide(MainLive), _platformNode.NodeRuntime.runMain);
//# sourceMappingURL=bin.js.map