# Testing and audit gates

This project has two project-local task graphs:

- `flag-hack-feature-gated` is the default graph for feature work. It follows the normal implementation pipeline, then verifies generated-file guardrails, compile, unit tests, a disposable server restart/API smoke, format/lint, baseline tmux E2E, feature-specific tmux execution, and code review.
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

The Nix shell includes Node, Corepack, Python for `node-gyp`, and `tmux` for the terminal E2E smoke gate.

## Generated-file policy

Do not edit generated or disposable artifacts directly:

- `packages/**/build/**`
- `packages/**/dist/**`
- generated declarations and maps: `*.d.ts`, `*.d.ts.map`, `*.js.map`
- editor backups such as `*~`, `#*#`, and `.#*`
- existing generated schema JavaScript under `packages/domain/src/schemas/*.js`

Use source/config changes instead. Run the guard before handoff:

```sh
pnpm generated:guard
```

This task intentionally does not claim that full `pnpm build` is fixed. Avoid codegen/build commands that write `build/` or `dist/` artifacts unless a future task explicitly approves that workflow.

## Gate commands

Run gates serially; the API and tmux E2E gates both use the development server on port `3000`.

```sh
pnpm generated:guard
pnpm format:check
pnpm check
pnpm test:unit
pnpm test:perf
pnpm test:api
pnpm test:e2e:tmux
# For feature-specific terminal checks, provide scenario env vars:
FLAGHACK_TMUX_KEYS='["j"]' pnpm test:feature:tmux
```

`pnpm verify:smoke` runs the generated-file guard plus the four smoke gates:

```sh
pnpm verify:smoke
```

`pnpm verify:gates` is the stricter readiness gate and additionally runs `pnpm check` before the smoke gates:

```sh
pnpm verify:gates
```

### Unit gate

```sh
pnpm test:unit
```

Runs Vitest in non-watch workspace mode across `packages/*/vitest.config.ts`, including web smoke tests.

### Performance gate

```sh
pnpm test:perf
```

Runs Vitest benchmarks from `packages/*/test/**/*.bench.ts`. Current benchmarks are smoke benchmarks only; add thresholds after collecting stable baselines.

### API smoke gate

```sh
pnpm test:api
```

Starts a disposable server with `pnpm exec tsx packages/server/src/server.ts`, waits with the typed Effect `HttpApiClient`, exercises `getWorld`, `getLogs`, `getInventory`, and a no-op action, then terminates the child process. Stop any existing process on port `3000` first.

### tmux E2E smoke gate

```sh
pnpm test:e2e:tmux
```

Requires `tmux`. The runner creates a unique session, starts the server in one pane, waits for API readiness, starts the CLI in another pane, sends a movement key, captures terminal output to a temporary path outside the repo, and kills the session in cleanup.

### Feature-specific tmux gate

```sh
FLAGHACK_TMUX_KEYS='["j"]' pnpm test:feature:tmux
```

The feature gate also starts a disposable server and CLI in a unique tmux session, but the sent keys and assertions are configurable:

- `FLAGHACK_TMUX_KEYS`: JSON array of tmux `send-keys` tokens, for example `'["g", "l"]'`.
- `FLAGHACK_TMUX_EXPECT`: optional JavaScript regex source that must match the captured CLI output.
- `FLAGHACK_TMUX_REJECT`: optional JavaScript regex source that must not match the captured CLI output.
- `FLAGHACK_TMUX_KEY_WAIT_MS` and `FLAGHACK_TMUX_FINAL_WAIT_MS`: optional timing controls.

Use this for task-graph feature verification when the requested behavior must be exercised in the real terminal UI. Extend `scripts/tmux-feature-check.ts` or add a focused script when a feature needs richer assertions than output matching.
