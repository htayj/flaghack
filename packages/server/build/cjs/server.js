"use strict";

var _platform = require("@effect/platform");
var _platformNode = require("@effect/platform-node");
var _effect = require("effect");
var _nodeHttp = require("node:http");
var _Api = require("./Api.js");
var _TodosRepository = require("./TodosRepository.js");
const HttpLive = /*#__PURE__*/_platform.HttpApiBuilder.serve(_platform.HttpMiddleware.logger).pipe(/*#__PURE__*/_effect.Layer.provide(_Api.ApiLive), /*#__PURE__*/_effect.Layer.provide(_TodosRepository.TodosRepository.Default), /*#__PURE__*/_effect.Layer.provide(/*#__PURE__*/_platformNode.NodeHttpServer.layer(_nodeHttp.createServer, {
  port: 3000
})));
_effect.Layer.launch(HttpLive).pipe(_platformNode.NodeRuntime.runMain);
//# sourceMappingURL=server.js.map