# Build system / generated files audit

Date: 2026-05-29  
Branch audited: `master`  
Scope: pnpm workspace/build lifecycle, Effect build-utils/codegen, TypeScript project references, package publish artifacts, Vite/Vitest, lint/format/CI/docs, and agent guardrails.

This report is intentionally focused on the build system because it is currently fragile and confusing to agents. The recurring root problem is that generated files, source files, package outputs, and workspace links are not clearly separated. As a result, agents can see stale generated files, edit the wrong artifacts, run the wrong command order, and get misleading results.

## Immediate build-system goals

1. **Define one source of truth for source files.** Source lives in `packages/*/src/**/*.ts(x)`. Generated JS/d.ts/build/dist files should not be edited by humans/agents.
2. **Define one canonical command flow.** Make `pnpm verify` or equivalent the blessed command; hide multi-step build order from agents.
3. **Define one workspace graph.** `pnpm`, TypeScript, Vitest, lint, and docs should agree on whether `web` is included.
4. **Choose source-linked or dist-linked development.** Mixing TS path aliases to source with pnpm links to `dist` is a major source of confusion.
5. **Curate generated exports.** Do not let `**/*.ts` globs auto-export declarations, tests, backups, demos, or internals.
6. **Add explicit generated-file guardrails.** Headers, docs, lint/check scripts, and CI should stop edits to generated artifacts.

## Recommended canonical workflow after cleanup

A clear target workflow could be:

```sh
nix develop                 # or documented non-Nix equivalent
corepack enable
corepack prepare pnpm@9.10.0 --activate
pnpm install --frozen-lockfile
pnpm verify
```

Where `pnpm verify` runs, in order:

```sh
pnpm run clean
pnpm run codegen
pnpm run generated:check
pnpm run format:check
pnpm run lint
pnpm run check
pnpm run test:run
pnpm -r --sort run build
pnpm run package:smoke
```

Adjust names as desired, but the key is: one command, one order, fail-fast, documented.

---

## P0 / blockers

### 1. `web` workspace scope is inconsistent

- **Evidence:** root `package.json:6-8` says `packages/*`; `pnpm-workspace.yaml:1-4` lists only `packages/cli`, `packages/domain`, `packages/server`; root `tsconfig.json:4-9` references `packages/web`; root `tsconfig.build.json:4-8` excludes it; lockfile has a `packages/web` importer; `packages/web/package.json:12-21` uses workspace dependency on domain.
- **Current build-system smell:** There are two conflicting workspace truths. Agents see `packages/web`, root TS sees `web`, but pnpm recursive scripts can skip it.
- **Recommended fix/guardrail:** Make `pnpm-workspace.yaml` the single source of truth. If web is first-class, use `packages/*` or add `packages/web`; regenerate lockfile; align root build/check/test/lint. If not, remove web from root TS/Vitest and document it as separate.
- **Rationale:** Prevents false-green builds and agent confusion about whether web is validated.

### 2. `clean` deletes `dist`, but workspace dependencies link to `domain/dist`

- **Evidence:** `scripts/clean.mjs:4-9` deletes `dist`; `packages/domain/package.json:12-15` and `packages/cli/package.json:12-15` publish from `dist`; lockfile links consumers to `../domain/dist` at `pnpm-lock.yaml:112-114`, `:181-183`, `:221-223`; `dist` is ignored by `.gitignore:2`.
- **Current build-system smell:** After `pnpm clean`, the package target that workspace consumers resolve can disappear. TS path aliases still point to source, so typecheck and runtime can disagree.
- **Recommended fix/guardrail:** Choose one model:
  - **Source-linked dev:** remove `publishConfig.directory` from dev workspace resolution, make package roots resolvable from source, and reserve `dist` for publish only.
  - **Dist-linked dev:** require `clean -> codegen -> build/pack domain -> build consumers` before any dev/test, and add predev/pretest checks for `packages/domain/dist/package.json`.
- **Rationale:** Clean checkouts should not depend on stale ignored artifacts.

### 3. Root build is not the canonical lifecycle and omits codegen

- **Evidence:** root `codegen` is separate at `package.json:11`; root `build` at `package.json:12` runs `tsc -b tsconfig.build.json && pnpm --recursive --parallel run build`; package build scripts run `pack-v2` but not `prepare-v2`; TS paths point at generated/missing `src/index.js` entries in `tsconfig.base.json:41-52`.
- **Current build-system smell:** A clean checkout followed by `pnpm run build` does not clearly produce required generated indexes/exports first.
- **Recommended fix/guardrail:** Make build invoke codegen first or add `prebuild`. Prefer ordered recursive build: `pnpm run codegen && pnpm -r --sort run build`. Alternatively commit generated indexes and add a freshness check.
- **Rationale:** Agents should not have to guess whether to run `codegen`, `build`, both, or in what order.

### 4. Generated schema JS lives under `src` and is stale

- **Evidence:** `packages/domain/src/schemas/schemas.js:22-25` lacks `Pos.z` present in `packages/domain/src/schemas.ts:46-50`; generated `Milk` is `"booze"` at `schemas.js:56` while source is `"milk"` at `schemas.ts:95-99`; generated terrain only has `Wall` at `schemas.js:106-107` while source has `Wall/Floor/Tunnel` at `schemas.ts:207-219`; generated actions are old at `schemas.js:117-126` while source has `apply/pickupMulti/dropMulti` at `schemas.ts:253-263`.
- **Current build-system smell:** Runtime/generated contract files coexist with canonical source and disagree. Agents may edit the JS because it appears near source.
- **Recommended fix/guardrail:** Remove generated schema JS/d.ts from `src`, or move to `build`/`dist`. If generated files must be committed, add `@generated DO NOT EDIT` banners and CI freshness check (`codegen && git diff --exit-code`).
- **Rationale:** Stale generated runtime contracts can desync API validation and game behavior.

### 5. `@effect/build-utils` export globs include `.d.ts` and generate broken exports

- **Evidence:** domain config includes all TS files at `packages/domain/package.json:31-37`; server/CLI do similar at `packages/server/package.json:40-49`, `packages/cli/package.json:56-65`; declaration files exist in `packages/domain/src/schemas/*.d.ts`; generated backup contains invalid exports like `export * as schemas.d` in `packages/domain/src/index.ts~`; domain dist exports bogus `.d` subpaths in `packages/domain/dist/package.json:42-50`; current `packages/domain/build/esm/index.js:4-9` is syntactically invalid.
- **Current build-system smell:** `"**/*.ts"` matches `.d.ts`, and generated declarations/backups are treated as runtime modules.
- **Recommended fix/guardrail:** Replace broad globs with explicit public allowlists. At minimum exclude `**/*.d.ts`, `**/*.test.ts`, `test*.ts`, `**/*~`, `**/#*#`, generated schema directories, `build`, `dist`, and internal/dev-only files. Add a check that every generated `exports` target exists.
- **Rationale:** Package metadata must be deterministic and resolvable.

### 6. Build emits broken artifacts because `noEmitOnError` is false

- **Evidence:** `tsconfig.base.json:24` sets `"noEmitOnError": false`; current emitted `packages/domain/build/esm/index.js:4-9` is invalid; `node --check packages/domain/build/esm/index.js` would fail on `export * as schemas from .d;`.
- **Current build-system smell:** TypeScript can emit and package invalid JS/declarations.
- **Recommended fix/guardrail:** Set `noEmitOnError: true` in buildable configs; clean `build`/`dist` before package builds; add smoke checks such as `node --check` over built ESM and existence checks for export targets.
- **Rationale:** Package consumers should never receive syntactically invalid files.

### 7. TSX `.jsx` imports do not match emitted `.js` files

- **Evidence:** base JSX emit is `"jsx": "react"` at `tsconfig.base.json:25`, which emits TSX as `.js`; source imports `.jsx` in `packages/cli/src/components/BPlaying.tsx:12`, `:14`; emitted JS preserves `.jsx` imports in `packages/cli/build/esm/components/BPlaying.js:11-13`, but sibling outputs are `.js`.
- **Current build-system smell:** Runtime ESM resolution looks for `.jsx` files that are not emitted.
- **Recommended fix/guardrail:** Use `.js` specifiers in TS/TSX source when JSX is transformed to JS, or configure a build that emits `.jsx` consistently. Enforce with lint/import checks.
- **Rationale:** NodeNext does not rewrite import specifiers.

### 8. No authoritative verify/CI entrypoint

- **Evidence:** `package.json:9-23` has individual `clean/codegen/build/check/lint/test/coverage` but no `verify`/`ci`; `flake.nix:14-25` has formatter/devShell but no checks; no CI workflows were found.
- **Current build-system smell:** Future agents must guess which commands to run and in what order.
- **Recommended fix/guardrail:** Add `pnpm verify` and wire it into CI and/or flake checks. Include codegen freshness, generated artifact audit, format check, lint, typecheck, tests, build, package smoke.
- **Rationale:** One blessed command prevents incomplete handoffs and wrong command ordering.

---

## P1 / high priority

### 9. Root build duplicates TypeScript work and then runs package builds in parallel

- **Evidence:** root build first runs `tsc -b tsconfig.build.json`, then `pnpm --recursive --parallel run build`; package builds run `tsc -b` again; CLI/server build configs reference domain.
- **Current build-system smell:** Packages are built by references and then again by package scripts. `--parallel` discards package dependency order during pack/build phases.
- **Recommended fix/guardrail:** Use one ordered root build: `pnpm run codegen && pnpm -r --sort run build`. Split separate concerns into `check`, `emit`, and `pack` if needed.
- **Rationale:** One ordered path is easier to reason about and less prone to stale/racy artifacts.

### 10. CLI uses `dist` for both package output and Vite bundle

- **Evidence:** CLI publish/build uses `dist` at `packages/cli/package.json:12-18`; CLI `play` runs Vite then `node dist/bin.js` at `packages/cli/package.json:25`; Vite outDir is `dist` in `packages/cli/vite.config.js:6-12`; current `packages/cli/dist/bin.js` is a Vite bundle.
- **Current build-system smell:** One artifact directory has two owners. Running play can overwrite package output; packing can overwrite app output.
- **Recommended fix/guardrail:** Separate directories, e.g. package output `dist`, Vite app bundle `dist-vite` or `build/vite`; or decide CLI is only an app and remove package-style pack-v2.
- **Rationale:** Avoids “it worked until I ran X” artifact collisions.

### 11. CLI publish directory is not a valid self-describing package

- **Evidence:** CLI publishes from `dist` in `packages/cli/package.json:12-15`; source manifest has no `bin`, `main`, `module`, `types`, `exports`, or `files`; current `packages/cli/dist` contains `bin.js` but no `package.json`; `bin.js` keeps bare external imports.
- **Current build-system smell:** `npm install -g @flaghack/cli` would not expose a command, and current dist is not a package.
- **Recommended fix/guardrail:** Choose release shape:
  - build-utils package with generated `dist/package.json` and `bin`, or
  - Vite single-file CLI package with generated `dist/package.json`, dependencies, and `bin`.
  Add pack dry-run assertion that tarball contains `package.json` and bin target.
- **Rationale:** Publish/build artifacts should be installable and executable.

### 12. Server appears publishable but lacks clear publish intent

- **Evidence:** `@flaghack/server` is not private in `packages/server/package.json`; unlike CLI/domain, it lacks `publishConfig.directory`; generated `packages/server/dist/package.json` exists.
- **Current build-system smell:** Publishing from source package could ship TS/config/test files instead of generated package metadata.
- **Recommended fix/guardrail:** If publishable, add `publishConfig.directory: "dist"`; if not, add `"private": true`. CI should pack exactly what would be published.
- **Rationale:** Prevents accidental source-only or wrong-directory publish.

### 13. Publish allowlists are missing and tarballs include noise

- **Evidence:** `.gitignore:2-5` ignores backups, but publish dirs contain backup/source debris like `packages/domain/dist/src/display.ts~`, `packages/domain/dist/src/schemas/#util.js#`, `packages/server/dist/src/#creatures.ts#`, `packages/server/dist/src/GameRepository.ts~`; manifests lack `files` allowlists.
- **Current build-system smell:** `npm pack --dry-run` can include editor backups, stale source, and templates.
- **Recommended fix/guardrail:** Add explicit `files` allowlists to generated publish manifests or strict `.npmignore` in publish dirs. Deny `*~`, `#*#`, tests, configs, source TS unless intentional.
- **Rationale:** Prevents leaking junk/stale internals.

### 14. Published dependency metadata needs validation

- **Evidence:** source packages use `workspace:^`; generated server dist still contains workspace protocol in package metadata; many deps use `latest`.
- **Current build-system smell:** Consumers may receive invalid `workspace:` ranges if the publish tool does not rewrite them; `latest` makes installs non-reproducible.
- **Recommended fix/guardrail:** Use exact intended `pnpm pack/publish --dry-run` in CI and assert packed manifests have no `workspace:`. Replace `latest` with explicit semver ranges or pnpm catalogs.
- **Rationale:** Keeps published packages installable and reproducible.

### 15. Missing `src/index.ts` while aliases/package roots assume it

- **Evidence:** root aliases point to package indexes in `tsconfig.base.json:41`, `:44`, `:47`, `:50`; no `packages/*/src/index.ts` exists; codegen exists but package build does not run it first.
- **Current build-system smell:** Bare package entrypoints depend on generated/stale ignored output.
- **Recommended fix/guardrail:** Commit/generated `src/index.ts` before build/check, add codegen as prebuild/precheck, or remove bare package aliases/exports if unsupported.
- **Rationale:** Root imports and published root exports should be reliable.

### 16. Source/dist/test aliases are inconsistent

- **Evidence:** TypeScript paths always point to source; Vitest `TEST_DIST` points to `dist/dist/esm` in `vitest.shared.ts:5`; Vitest aliases are unscoped `domain/server/cli` at `vitest.shared.ts:29-33`, while source imports `@flaghack/domain/*`.
- **Current build-system smell:** Tests do not exercise the same resolution path as production package imports.
- **Recommended fix/guardrail:** Alias `@flaghack/<pkg>` and subpaths consistently. Add `test:source` and `test:dist` scripts that import through package export maps.
- **Rationale:** Source and dist can drift silently otherwise.

### 17. Source/test/build boundaries leak

- **Evidence:** CLI/server source configs reference domain aggregate config; domain aggregate includes source and tests; test aliases live in base paths; server demo/test files live in `src` and get exported.
- **Current build-system smell:** Production source can depend on aggregate/test projects, and demo/test files become package API.
- **Recommended fix/guardrail:** Make source configs reference `../domain/tsconfig.src.json`; move demo/test files to `test/` or `examples/`; move test path aliases to test configs only.
- **Rationale:** Production, test, and package surfaces should be independently bounded.

### 18. Lint scope misses TSX, JS configs, and web

- **Evidence:** root lint matches only `**/{src,test,examples,scripts,dtslint}/**/*.{ts,mjs}` in `package.json:20`; CLI/web TSX files exist; web has separate lint script but is excluded from pnpm workspace; `import/no-unresolved` is off in `eslint.config.mjs:75`.
- **Current build-system smell:** Agents can report “lint passed” while UI/config/import issues were skipped.
- **Recommended fix/guardrail:** Expand root lint or use recursive package lint. Include `ts,tsx,js,mjs,cjs`, configs, and web. Add import/package export smoke tests if unresolved imports remain disabled.
- **Rationale:** Build issues often come from TSX/import/config files that current lint misses.

### 19. Dprint exists but is not enforced and could touch generated files

- **Evidence:** `dprint.json:1-28` exists; root scripts have no `format`/`format:check`; dev tooling does not include dprint; dprint excludes only `node_modules` and `**/*-lock.json`, not `pnpm-lock.yaml`, `dist`, `build`, `.d.ts`, maps, generated schemas.
- **Current build-system smell:** Formatting policy is split and not part of CI/verify; future `dprint fmt` can touch generated outputs or lockfile.
- **Recommended fix/guardrail:** Add dprint to dev tooling/scripts; add `format` and `format:check`; exclude `pnpm-lock.yaml`, `dist`, `build`, `.d.ts`, maps, generated schema files unless intentionally formatted.
- **Rationale:** Prevents agents from accidentally modifying generated/lock artifacts.

### 20. Toolchain bootstrapping is implicit

- **Evidence:** `package.json:4` declares `pnpm@9.10.0`; `flake.nix:18-22` provides `corepack`, `nodejs`, `python3`; README says run `pnpm i`; current shell lacked `pnpm` outside activation.
- **Current build-system smell:** Agents can fail at the package-manager step.
- **Recommended fix/guardrail:** Document `nix develop` + Corepack steps, or add pnpm/dprint directly to the dev shell and a shell hook activating pnpm.
- **Rationale:** Reduces environment-specific failures.

---

## P2 / medium priority

### 21. Web Vite externalization can leave unresolved browser imports

- **Evidence:** `packages/web/vite.config.ts:8-10` externalizes `@flaghack/domain/schemas`; web imports that and other domain subpaths in `GameClient.ts`, `Playing.tsx`, `Inventory.tsx`.
- **Current build-system smell:** Browser build may keep a bare `@flaghack/domain/schemas` import while bundling other domain subpaths.
- **Recommended fix/guardrail:** For app builds, remove the external and bundle workspace domain code; or externalize all domain subpaths consistently with an import map. Add post-build grep/smoke: no bare `@flaghack/` imports in browser assets unless expected.
- **Rationale:** Browsers cannot resolve bare package specifiers by default.

### 22. Web is skipped by normal recursive build/release checks

- **Evidence:** root build uses recursive scripts; `pnpm-workspace.yaml` excludes web; web has its own build script.
- **Current build-system smell:** Web regressions bypass normal build/release checks.
- **Recommended fix/guardrail:** Add web to workspace or document and add explicit root scripts for web check/build/lint.
- **Rationale:** Prevents false confidence in root build.

### 23. Public export surface is too broad

- **Evidence:** server export generation includes all TS; generated server exports include `testBSP` and `testDrawUtils`; CLI also configures all TS for export/index generation.
- **Current build-system smell:** Internals/tests become public API accidentally.
- **Recommended fix/guardrail:** Use explicit export allowlists or curated `src/index.ts`; exclude debug scripts, tests, and internal folders.
- **Rationale:** Reduces semver burden and broken consumers.

### 24. CLI build target lacks engine guard

- **Evidence:** CLI Vite target is `node21` in `packages/cli/vite.config.js:7`; CLI manifest has no `engines` field.
- **Current build-system smell:** Package may install/run on unsupported Node versions.
- **Recommended fix/guardrail:** Add `engines.node` matching emitted target or lower target to supported LTS.
- **Rationale:** Makes runtime compatibility explicit.

### 25. `noUncheckedIndexedAccess` remains off despite risky generation code

- **Evidence:** `tsconfig.base.json:32` disables it; server indexes arrays in `packages/server/src/world.ts:144`, `:161`, `:189`, `:213-214`.
- **Current build-system smell:** Strict mode is present but misses common undefined risks.
- **Recommended fix/guardrail:** Enable `noUncheckedIndexedAccess` once current issues are triaged, at least in domain/server source configs.
- **Rationale:** Catches real generation crashes earlier.

### 26. Tests are minimal and not CI-mode

- **Evidence:** root test script is `vitest` (watch-like UX) at `package.json:22`; dummy tests only assert true; shared aliases cover only cli/domain/server; web has no test script.
- **Current build-system smell:** `pnpm test` may not be the right non-watch CI command and does not guard real build behavior.
- **Recommended fix/guardrail:** Add `test:run: vitest run`; include in verify; add package smoke tests and meaningful unit/contract tests.
- **Rationale:** Future agents need a non-watch test command with signal.

### 27. README/dev docs are stale and lack generated-file rules

- **Evidence:** README says build “will probably fail”; package READMEs are templates; no `AGENTS.md`/`CONTRIBUTING.md` found.
- **Current build-system smell:** No authoritative workflow, generated-file policy, or handoff checklist.
- **Recommended fix/guardrail:** Add `AGENTS.md`/`CONTRIBUTING.md` documenting install, commands, generated paths, codegen policy, source-of-truth files, and handoff checklist.
- **Rationale:** Directly prevents agents from editing generated files or running wrong commands.

---

## Concrete generated-file / agent guardrails

Add this policy to `AGENTS.md` or `CONTRIBUTING.md`:

### Human/agent editable source

- `packages/*/src/**/*.ts`
- `packages/*/src/**/*.tsx`
- `packages/*/test/**/*.ts`
- package/root config files, unless marked generated

### Never edit directly

- `packages/**/build/**`
- `packages/**/dist/**`
- `node_modules/**`
- `*.tsbuildinfo`
- `*.d.ts` generated under `src`
- `*.js.map`, `*.d.ts.map`, `*.ts.map`
- editor backup files: `*~`, `#*#`, `.#*`
- generated `src/index.ts` if `build-utils prepare-v2` owns it
- generated schema JS if retained temporarily under `src/schemas/*.js`

### Before editing a suspicious file

```sh
git check-ignore -v <path> || true
git ls-files <path>
```

If ignored, under `build/`/`dist/`, a declaration/map, or marked `@generated`, edit the source/template/config instead.

### Generated checks to add

- `generated:check`: fails if `git ls-files` contains generated schema JS/d.ts under `src` after the policy changes.
- `codegen:check`: runs `pnpm run codegen` then `git diff --exit-code`.
- `exports:check`: parses generated package `exports` and asserts all referenced files exist.
- `artifact:check`: fails if package outputs contain `*~`, `#*#`, `.#*`, `test*`, stale source files, or `workspace:` deps in packed manifests.
- `browser:check`: fails if web build assets contain bare `@flaghack/` imports unless explicitly externalized.

---

## Suggested implementation order

1. **Write guardrails first:** add `AGENTS.md` with generated-file policy and canonical commands so agents stop editing build artifacts.
2. **Fix workspace graph:** decide web inclusion, align `pnpm-workspace.yaml`, root package metadata, tsconfigs, vitest, lint.
3. **Remove/move stale generated files:** get generated schema JS/d.ts out of `src` or mark/freshness-check them.
4. **Fix codegen globs:** explicit export allowlists/excludes; stop exporting `.d.ts`, tests, backups, internals.
5. **Choose source-vs-dist dev model:** adjust `publishConfig.directory`, package roots/exports, or build order accordingly.
6. **Make build fail-closed:** `noEmitOnError: true`, ordered build, `node --check`, export target existence checks.
7. **Separate artifact dirs:** CLI Vite output vs package output; clarify server publish/private status.
8. **Add `verify` and CI/flake checks:** one command that agents and humans can trust.
9. **Add package smoke tests:** import source and dist, pack dry-run, temp install, run CLI help, check web bundle imports.
10. **Update README/CONTRIBUTING:** canonical setup/build/test/deploy flow.
