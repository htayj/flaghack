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
pnpm test:perf
pnpm test:api:bot
pnpm test:e2e:tmux:bot
```

`pnpm verify:smoke` runs the generated-file guard plus the unit, performance, API, and tmux E2E smoke gates. `pnpm verify:gates` additionally runs `pnpm check` as the stricter readiness gate.

Agents should use the bot gates (`pnpm test:api:bot`, `pnpm test:e2e:tmux:bot`, and `pnpm test:feature:tmux:bot`) so user-owned servers can keep port `3000`. Bot gates use port `3100`; run them serially and stop only project-created bot processes if cleanup is needed.
