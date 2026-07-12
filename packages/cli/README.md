# @flaghack/cli

`@flaghack/cli` owns the Flag Hack Go Charmbracelet terminal client. It is
the project's only player interface and talks to the server directly over
HTTP and revisioned server-sent events.

## Current responsibilities

- `charm/` provides the default Charmbracelet Bubble Tea/Lip Gloss player
  UI. Root `pnpm run cli` and package-local `pnpm run dev` / `pnpm run
  play` launch this frontend. It owns a native SSE subscription/parser for
  revisioned combined state and falls back to endpoint refreshes when the
  stream is unavailable. The client carries the mutating-command intent
  header required by the shared API contract.
- `charm/main_test.go` covers the HTTP/SSE boundary, update loop, input
  handling, lifecycle behavior, and rendered views. The remaining Go tests
  and benchmarks cover item selection and performance instrumentation.
- Root `pnpm run cli`, `pnpm run cli:charm`, and `pnpm run
  cli:charmbracelet` all launch this interface. Package-local `pnpm run
  dev` and `pnpm run play` do the same.

## Player controls

A fresh game first prompts for a role and confirmation; `virgin` is the only
current role. During play:

- `h/j/k/l/y/u/b/n` move, `.` rests, `;` looks, and `_` travels. Shift,
  Control, and `g`/`G`/`m`/`M` prefixes provide repeated/no-pickup movement.
- `o` or `c` followed by a direction opens or closes a door. Walking into a
  closed door opens it instead of moving through it.
- `,` picks up floor items, `d` drops, `e` eats, and `q` quaffs.
- `M-l` / Alt-l loots a floor container under the player. The loot panel
  opens in the inventory slot: `t` chooses taking contents out of the
  container, `p` chooses putting inventory into it, `,` marks all visible
  items, Space submits, and Escape cancels.
- `C-s` or `#save` saves and exits. `C-q` or `#quit` asks for confirmation;
  `y` permanently quits without saving and `n`/Escape cancels. Terminal
  save/quit events suppress further input.

## Validation and workflow notes

Read the root `AGENTS.md` before changing package behavior, and use
`docs/testing-gates.md` to choose focused CLI validation. Keep the Go
client aligned with the shared `GameApi` transport and lifecycle contract;
server runtime behavior belongs in `@flaghack/server`.

## Audit and generated-file policy

This README covers ownership items tracked in
`ARCHITECTURE_OPPORTUNITIES.md`, `BUILD_SYSTEM_OPPORTUNITIES.md`,
`EFFECT_TS_OPPORTUNITIES.md`, and
`FP_IMMUTABILITY_OPPORTUNITIES.md`.

Do not hand-edit generated or disposable output. The repository policy
called out in `AGENTS.md` includes `packages/**/build/**`,
`packages/**/dist/**`, `*.d.ts`, `*.d.ts.map`, `*.js.map`, the
generated schema JavaScript under `packages/domain/src/schemas/*.js`,
task-graph/subagent runtime output, and editor backup files such as `*~`,
`#*#`, and `.#*`.
