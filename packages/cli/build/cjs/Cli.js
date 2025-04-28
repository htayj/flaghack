"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.cli = void 0;
var _cli = require("@effect/cli");
var _TodosClient = require("./TodosClient.js");
const todoArg = /*#__PURE__*/_cli.Args.text({
  name: "todo"
}).pipe(/*#__PURE__*/_cli.Args.withDescription("The message associated with a todo"));
const todoId = /*#__PURE__*/_cli.Options.integer("id").pipe(/*#__PURE__*/_cli.Options.withDescription("The identifier of the todo"));
const add = /*#__PURE__*/_cli.Command.make("add", {
  todo: todoArg
}).pipe(/*#__PURE__*/_cli.Command.withDescription("Add a new todo"), /*#__PURE__*/_cli.Command.withHandler(({
  todo
}) => _TodosClient.TodosClient.create(todo)));
const done = /*#__PURE__*/_cli.Command.make("done", {
  id: todoId
}).pipe(/*#__PURE__*/_cli.Command.withDescription("Mark a todo as done"), /*#__PURE__*/_cli.Command.withHandler(({
  id
}) => _TodosClient.TodosClient.complete(id)));
const list = /*#__PURE__*/_cli.Command.make("list").pipe(/*#__PURE__*/_cli.Command.withDescription("List all todos"), /*#__PURE__*/_cli.Command.withHandler(() => _TodosClient.TodosClient.list));
const remove = /*#__PURE__*/_cli.Command.make("remove", {
  id: todoId
}).pipe(/*#__PURE__*/_cli.Command.withDescription("Remove a todo"), /*#__PURE__*/_cli.Command.withHandler(({
  id
}) => _TodosClient.TodosClient.remove(id)));
const command = /*#__PURE__*/_cli.Command.make("todo").pipe(/*#__PURE__*/_cli.Command.withSubcommands([add, done, list, remove]));
const cli = exports.cli = /*#__PURE__*/_cli.Command.run(command, {
  name: "Todo CLI",
  version: "0.0.0"
});
//# sourceMappingURL=Cli.js.map