# Agent guardrails

This repository is a TypeScript pnpm workspace for Flag Hack. Keep source changes focused and prefer project scripts over ad-hoc commands.

## Generated files: do not edit by hand

Do not edit generated or disposable artifacts directly:

- `packages/**/build/**`
- `packages/**/dist/**`
- generated declarations and maps: `*.d.ts`, `*.d.ts.map`, `*.js.map`
- editor backup files such as `*~`, `#*#`, and `.#*`
- existing generated schema JavaScript under `packages/domain/src/schemas/*.js`
- task-graph runtime output under `.pi/dev-suite/task-graph/runs/**` and `.pi/dev-suite/task-graph/artifacts/**`
- local subagent run output under `.pi-subagents/**`

If generated output appears stale, change the TypeScript source/configuration and report that regeneration is needed. For this task, do not run build/codegen commands that write `build/` or `dist/` artifacts.

Before handing off changes, run:

```sh
pnpm generated:guard
```

## Validation gates

Use the documented gate commands in `docs/testing-gates.md` for audit-remediation work. The short version is:

```sh
pnpm generated:guard
pnpm format:check
pnpm check
pnpm test:unit
pnpm test:charm
pnpm test:perf
pnpm test:api:bot
pnpm test:e2e:tmux:bot
```

`pnpm verify:smoke` runs the generated-file guard plus the unit, Charm Go, performance, API, and tmux E2E smoke gates. `pnpm verify:gates` additionally runs `pnpm check` as the stricter readiness gate. Neither aggregate runs `pnpm format:check`; run it separately.

Agents should use the bot gates (`pnpm test:api:bot`, `pnpm test:e2e:tmux:bot`, and `pnpm test:feature:tmux:bot`) so user-owned servers can keep port `3000`. Bot gates use port `3100`; run them serially and stop only project-created bot processes if cleanup is needed.

## Runtime invariants

Preserve these lifecycle and transport rules when changing the API, server, or clients:

- Mutating save/restore/quit requests carry the local-command intent header defined in `packages/domain/src/GameApi.ts`.
- Explicit save atomically writes the live game, publishes a terminal `save` stream event, clears in-memory play state, and exits or disables gameplay.
- Restore consumes a valid save after decoding it; corrupt saves are discarded. The existing migration only fills missing creature attributes in legacy saves.
- Confirmed quit deletes any save, publishes terminal `quit`, and clears live state without saving. Shutdown autosave is a separate path.
- `GameUpdateHub` publishes authoritative full `ClientState` snapshots with monotonic revisions. Clients reject stale revisions and may fall back to HTTP refresh if the stream is unavailable.
