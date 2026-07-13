# Testing and audit gates

This project has two project-local task graphs:

- `flag-hack-feature-gated` is the default graph for feature work. It follows the normal implementation pipeline, then verifies generated-file guardrails, compile, unit tests, a disposable server restart/API smoke, format/lint, baseline tmux E2E, feature-specific tmux execution, code review, and an explicitly approved commit stage. The final `COMMIT` stage is mechanically skipped unless task graph commit approval is granted for that run; pushing remains outside this graph.
- `flag-hack-audit-gated` is retained for audit-remediation work against:
  - `ARCHITECTURE_OPPORTUNITIES.md`
  - `BUILD_SYSTEM_OPPORTUNITIES.md`
  - `EFFECT_TS_OPPORTUNITIES.md`
  - `FP_IMMUTABILITY_OPPORTUNITIES.md`

Create future feature runs with the default custom task graph when task graph tooling is available:

```sh
task_graph_create({ mode: "custom", input: "<feature task>", options: { customGraph: "flag-hack-feature-gated" } })
```

Create future audit-remediation runs with the audit graph:

```sh
task_graph_create({ mode: "custom", input: "<audit remediation task>", options: { customGraph: "flag-hack-audit-gated" } })
```

## Setup

Recommended setup:

```sh
nix develop
corepack enable
corepack prepare pnpm@9.10.0 --activate
pnpm install --frozen-lockfile
```

The Nix shell includes Node, Corepack, Go for the default Charmbracelet CLI, Python for `node-gyp`, and `tmux` for the terminal E2E smoke gate.

## Generated-file policy

Do not edit generated or disposable artifacts directly:

- `packages/**/build/**`
- `packages/**/dist/**`
- generated declarations and maps: `*.d.ts`, `*.d.ts.map`, `*.js.map`
- editor backups such as `*~`, `#*#`, and `.#*`
- existing generated schema JavaScript under `packages/domain/src/schemas/*.js`
- task-graph runtime output under `.pi/dev-suite/task-graph/runs/**` and
  `.pi/dev-suite/task-graph/artifacts/**`
- local subagent run output under `.pi-subagents/**`

Use source/config changes instead. Run the guard before handoff:

```sh
pnpm generated:guard
```

Full `pnpm build` is not a documented readiness gate and writes generated output. Avoid codegen/build commands that write `build/` or `dist/` artifacts during read-only or audit work unless the task explicitly approves that workflow.

## Gate commands

For agent/task-graph work, run the bot variants of API and tmux gates so a user's interactive server can keep using port `3000`. Bot gates use port `3100` and should still run serially.

```sh
pnpm generated:guard
pnpm format:check
pnpm check
pnpm test:unit
pnpm test:charm
pnpm test:perf
pnpm test:api:bot
pnpm test:e2e:tmux:bot
# For feature-specific terminal checks, provide scenario env vars:
FLAGHACK_TMUX_KEYS='["j"]' pnpm test:feature:tmux:bot
# Focused loot scenario on bot port 3100:
pnpm test:feature:tmux:loot:bot
```

`pnpm verify:smoke` runs the generated-file guard plus the smoke gates:

```sh
pnpm verify:smoke
```

`pnpm verify:gates` is the stricter readiness gate and additionally runs `pnpm check` before the smoke gates. Both aggregates include the Charm Go tests; neither runs `pnpm format:check`, so run the format check separately:

```sh
pnpm verify:gates
```

### Unit gate

```sh
pnpm test:unit
```

Runs Vitest in non-watch workspace mode across the domain and server test projects.

### Charmbracelet CLI gate

```sh
pnpm test:charm
```

Runs `go test ./...` in `packages/cli/charm`. This verifies the Go Bubble Tea/Lip Gloss frontend and requires the Go toolchain from `nix develop` or an equivalent local install.

### Performance gate

```sh
pnpm test:perf
```

Runs Vitest benchmarks from `packages/*/test/**/*.bench.ts` and Charm Go render/update benchmarks with `go test -run '^$' -bench . -benchmem`. Current benchmarks are smoke benchmarks only; add thresholds after collecting stable baselines.

For parsable instrumentation during API/tmux gates, set `FLAGHACK_PERF_FILE` to an NDJSON output path and validate required records with `pnpm test:perf:validate <file> --require ...`. See `docs/performance-instrumentation.md` for the stable `kind: "flaghack-perf"` schema, backend turn phase records, and frontend response-to-redraw/component records.

### API smoke gate

```sh
pnpm test:api:bot
```

Starts a disposable server with `pnpm exec tsx packages/server/src/server.ts`, waits with the typed Effect `HttpApiClient`, and uses an isolated temporary `FLAGHACK_SAVE_PATH`. It verifies fresh role selection and setup completion; required attributes on the player and generated creatures; world, logs, inventory, loot, and combined `/client-state` reads; SSE content type, the initial revisioned `/client-state/stream` event, and revision advancement after an action; local mutation intent-header rejection; and save/restore/quit lifecycle semantics. The current smoke closes its stream after verifying an action update; terminal SSE events are covered by repository/update-hub tests rather than this API process gate. Cleanup terminates the child and removes temporary artifacts. The bot variant sets `FLAGHACK_TEST_PORT=3100` and starts the server with `FLAGHACK_PORT=3100`, so a user-owned port `3000` server can keep running. Use `pnpm test:api` only when you intentionally want the normal port `3000` gate.

### tmux E2E smoke gate

```sh
pnpm test:e2e:tmux:bot
```

Requires `tmux`. The runner creates a unique session, starts the server in one pane with an isolated temporary save file, waits for API readiness, starts the default Charmbracelet CLI in another pane, automatically completes fresh role setup, sends a movement key, captures terminal output to a temporary path outside the repo, and kills the session in cleanup. The bot variant sets `FLAGHACK_TEST_PORT=3100`; the tmux runner propagates that port to both `FLAGHACK_PORT` for the server and exports `FLAGHACK_API_URL` before running the CLI command, including custom `FLAGHACK_TMUX_CLI_COMMAND` overrides. Set `FLAGHACK_TMUX_CLI_COMMAND` to exercise a custom Charm launch command.

### Feature-specific tmux gate

```sh
FLAGHACK_TMUX_KEYS='["j"]' pnpm test:feature:tmux:bot
```

The feature gate also starts a disposable server and CLI in a unique tmux session, but the sent keys and assertions are configurable:

- `FLAGHACK_TEST_PORT`: optional disposable server port; bot scripts set this to `3100`.
- `FLAGHACK_TMUX_CLI_COMMAND`: optional launch command; defaults to `pnpm run cli`. The tmux runner exports `FLAGHACK_API_URL=<test base URL>` before the selected command so custom compound commands target the disposable server.
- `FLAGHACK_TMUX_KEYS`: JSON array of tmux `send-keys` tokens, for example `'["g", "l"]'`.
- `FLAGHACK_TMUX_EXPECT`: optional JavaScript regex source that must match the captured CLI output.
- `FLAGHACK_TMUX_REJECT`: optional JavaScript regex source that must not match the captured CLI output.
- `FLAGHACK_TMUX_AUTO_SETUP`: optional boolean for the default Charm CLI; defaults to `true` so generic feature gates automatically pass the role-selection prompt. Set to `false` when the feature being verified is the setup prompt itself.
- `FLAGHACK_TMUX_ALLOW_CLI_EXIT`: optional boolean for save/quit scenarios where a successful terminal lifecycle is expected to close the CLI pane.
- `FLAGHACK_GAME_FIXTURE=door` or `FLAGHACK_DOOR_FIXTURE=1`: start the server with the deterministic door fixture for door interaction scenarios.
- `FLAGHACK_TMUX_KEY_WAIT_MS` and `FLAGHACK_TMUX_FINAL_WAIT_MS`: optional timing controls.

Use this for task-graph feature verification when the requested behavior must be exercised in the real terminal UI. Extend `scripts/tmux-feature-check.ts` or add a focused script when a feature needs richer assertions than output matching.

Campground terminal verification has a focused bot-port gate:

```sh
pnpm test:feature:tmux:campground:bot
```

It uses one disposable server and Charm session to verify the one-time brutal-arrival narration, empty inventory, visible mud-puddle spawn beside the gate, and heavy-rain projection. It then opens the campground overview, verifies the projected current address and discovered Arrival Plaza destination without tracker text or hidden landmarks, closes the overview, exercises the talk-direction prompt, and opens the discovered-landmark travel popup. The generic feature harness accepts staged checks through `FLAGHACK_TMUX_STEPS`; the focused command supplies those checks and a wide enough disposable tmux window for the sidebar popup.

Loot-specific terminal verification has a focused bot-port gate:

```sh
pnpm test:feature:tmux:loot:bot
```

It starts a disposable server on port `3100`, positions the player on a reachable cooler, drives `M-l`/Alt-l in the default Charm CLI through tmux, verifies taking a contained item into inventory, then verifies putting it back into the container.
