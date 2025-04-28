import { Args, Command, Options } from "@effect/cli";
import { TodosClient } from "./TodosClient.js";
const todoArg = /*#__PURE__*/Args.text({
  name: "todo"
}).pipe(/*#__PURE__*/Args.withDescription("The message associated with a todo"));
const todoId = /*#__PURE__*/Options.integer("id").pipe(/*#__PURE__*/Options.withDescription("The identifier of the todo"));
const add = /*#__PURE__*/Command.make("add", {
  todo: todoArg
}).pipe(/*#__PURE__*/Command.withDescription("Add a new todo"), /*#__PURE__*/Command.withHandler(({
  todo
}) => TodosClient.create(todo)));
const done = /*#__PURE__*/Command.make("done", {
  id: todoId
}).pipe(/*#__PURE__*/Command.withDescription("Mark a todo as done"), /*#__PURE__*/Command.withHandler(({
  id
}) => TodosClient.complete(id)));
const list = /*#__PURE__*/Command.make("list").pipe(/*#__PURE__*/Command.withDescription("List all todos"), /*#__PURE__*/Command.withHandler(() => TodosClient.list));
const remove = /*#__PURE__*/Command.make("remove", {
  id: todoId
}).pipe(/*#__PURE__*/Command.withDescription("Remove a todo"), /*#__PURE__*/Command.withHandler(({
  id
}) => TodosClient.remove(id)));
const command = /*#__PURE__*/Command.make("todo").pipe(/*#__PURE__*/Command.withSubcommands([add, done, list, remove]));
export const cli = /*#__PURE__*/Command.run(command, {
  name: "Todo CLI",
  version: "0.0.0"
});
//# sourceMappingURL=Cli.js.map