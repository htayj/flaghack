import { describe, expect, it } from "@effect/vitest"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  getVitestSourceTarget,
  packageAlias
} from "../../../vitest.shared.js"

const repositoryRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../.."
)
const rootPackageJsonPath = join(repositoryRoot, "package.json")
const rootDprintJsonPath = join(repositoryRoot, "dprint.json")
const rootEslintConfigMjsPath = join(repositoryRoot, "eslint.config.mjs")
const rootTsconfigBuildJsonPath = join(
  repositoryRoot,
  "tsconfig.build.json"
)
const rootVitestSharedTsPath = join(repositoryRoot, "vitest.shared.ts")
const apiSmokePath = join(repositoryRoot, "scripts/api-smoke.ts")
const taskGraphSettingsPath = join(
  repositoryRoot,
  ".pi/dev-suite/task-graph/settings.json"
)
const tmuxE2eSmokePath = join(repositoryRoot, "scripts/tmux-e2e-smoke.ts")
const tmuxFeatureCheckPath = join(
  repositoryRoot,
  "scripts/tmux-feature-check.ts"
)

const packageManifests = [
  {
    name: "@flaghack/domain",
    path: join(repositoryRoot, "packages/domain/package.json")
  },
  {
    name: "@flaghack/server",
    path: join(repositoryRoot, "packages/server/package.json")
  }
] as const

const buildUtilsGenerateMetadataKeys = [
  "generateExports",
  "generateIndex"
] as const

const requiredBuildUtilsExcludePatterns = [
  "**/*.d.ts",
  "**/*.test.ts",
  "**/*.bench.ts",
  "**/*~",
  "**/#*#",
  "schemas/**",
  "test*.ts",
  "**/test*.ts"
]

const requiredDprintExcludePatterns = [
  ".pi/schedule-prompts.json",
  ".pi/dev-suite/task-graph/current.json",
  "packages/**/build/**",
  "packages/**/dist/**",
  "**/*.d.ts",
  "**/*.d.ts.map",
  "**/*.js.map",
  "packages/domain/src/schemas/*.js",
  "pnpm-lock.yaml",
  "**/*~",
  "**/#*#",
  "**/.#*"
]

const requiredEslintErrorRules = [
  "@typescript-eslint/no-explicit-any",
  "@typescript-eslint/ban-ts-comment",
  "@typescript-eslint/no-non-null-assertion"
] as const

const requiredEslintIgnorePatterns = [
  "**/node_modules",
  "**/*-lock.json",
  ".pi/schedule-prompts.json",
  ".pi/dev-suite/task-graph/current.json",
  ".pi/dev-suite/task-graph/runs/**",
  ".pi/dev-suite/task-graph/artifacts/**",
  ".pi/task-graph-artifacts/**",
  "packages/**/build/**",
  "packages/**/dist/**",
  "**/*.d.ts",
  "**/*.d.ts.map",
  "**/*.js.map",
  "packages/domain/src/schemas/*.js",
  "pnpm-lock.yaml",
  "**/*~",
  "**/#*#",
  "**/.#*",
  "**/docs",
  "**/*.md"
]

const effectFpLintSourceGlobs = [
  "packages/server/src/**/*.ts",
  "packages/domain/src/**/*.ts"
] as const

const effectFpLintExcludedSourceGlobs = [
  "packages/server/src/test*.ts",
  "packages/domain/src/test*.ts",
  "**/*.test.ts",
  "**/*.unit.test.ts",
  "**/*.bench.ts"
] as const

const requiredEffectFpLintSelectors = [
  "MemberExpression[property.name='randomUUID'], MemberExpression[property.value='randomUUID']",
  "VariableDeclarator[id.type='ObjectPattern'] Property[key.name='randomUUID'], VariableDeclarator[id.type='ObjectPattern'] Property[key.value='randomUUID']",
  "CallExpression[callee.name='randomUUID']",
  "CallExpression[callee.property.name='then'], CallExpression[callee.property.name='catch'], CallExpression[callee.property.name='finally']",
  "NewExpression[callee.name='Promise']",
  "CallExpression[callee.object.name='Promise']",
  "ThrowStatement[argument.type='NewExpression'][argument.callee.name='Error']"
] as const

const requiredLintExtensions = ["ts", "tsx", "js", "mjs", "cjs"]

type RootPackageJson = {
  readonly devDependencies?: Readonly<Record<string, unknown>>
  readonly scripts?: Readonly<Record<string, unknown>>
  readonly pnpm?: {
    readonly overrides?: Readonly<Record<string, unknown>>
  }
}

type RootTsconfigBuildJson = {
  readonly references?: ReadonlyArray<{
    readonly path?: unknown
  }>
}

type RootDprintJson = {
  readonly excludes?: ReadonlyArray<unknown>
}

type PackageManifest = {
  readonly effect?: {
    readonly generateExports?: {
      readonly exclude?: ReadonlyArray<unknown>
    }
    readonly generateIndex?: {
      readonly exclude?: ReadonlyArray<unknown>
    }
  }
}

const readRootPackageJson = (): RootPackageJson =>
  JSON.parse(readFileSync(rootPackageJsonPath, "utf8")) as RootPackageJson

const readRootTsconfigBuildJson = (): RootTsconfigBuildJson =>
  JSON.parse(
    readFileSync(rootTsconfigBuildJsonPath, "utf8")
  ) as RootTsconfigBuildJson

const readRootDprintJson = (): RootDprintJson =>
  JSON.parse(readFileSync(rootDprintJsonPath, "utf8")) as RootDprintJson

const readRootEslintConfigMjs = (): string =>
  readFileSync(rootEslintConfigMjsPath, "utf8")

const runBackendDomainEslintFixture = (source: string): string =>
  execFileSync(
    process.execPath,
    [
      join(repositoryRoot, "node_modules/eslint/bin/eslint.js"),
      "--stdin",
      "--stdin-filename",
      "packages/server/src/review-fixture.ts"
    ],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      input: source
    }
  )

const backendDomainEslintFixtureError = (source: string): string => {
  try {
    runBackendDomainEslintFixture(source)
    return ""
  } catch (error) {
    if (
      typeof error === "object"
      && error !== null
      && "stdout" in error
      && typeof error.stdout === "string"
    ) return error.stdout
    return error instanceof Error ? error.message : String(error)
  }
}

const readRootVitestSharedTs = (): string =>
  readFileSync(rootVitestSharedTsPath, "utf8")

const readApiSmokeSource = (): string => readFileSync(apiSmokePath, "utf8")

type TaskGraphStageSettings = {
  readonly id?: string
  readonly kind?: string
  readonly dependsOn?: ReadonlyArray<string>
  readonly description?: string
  readonly promptInstructions?: ReadonlyArray<string>
  readonly isolationBoundary?: ReadonlyArray<string>
}

type TaskGraphSettings = {
  readonly graphs?: Record<
    string,
    {
      readonly description?: string
      readonly stages?: ReadonlyArray<TaskGraphStageSettings>
    }
  >
}

const readTaskGraphSettings = (): string =>
  readFileSync(taskGraphSettingsPath, "utf8")

const readTaskGraphSettingsJson = (): TaskGraphSettings =>
  JSON.parse(readTaskGraphSettings()) as TaskGraphSettings

const readTmuxScriptSources = (): ReadonlyArray<string> => [
  readFileSync(tmuxE2eSmokePath, "utf8"),
  readFileSync(tmuxFeatureCheckPath, "utf8")
]

const readPackageManifest = (path: string): PackageManifest =>
  JSON.parse(readFileSync(path, "utf8")) as PackageManifest

describe("root package metadata", () => {
  it("pins @effect/vitest consistently", () => {
    const rootPackageJson = readRootPackageJson()

    expect(rootPackageJson.devDependencies?.["@effect/vitest"]).toBe(
      "0.23.8"
    )
    expect(rootPackageJson.pnpm?.overrides?.["@effect/vitest"]).toBe(
      "0.23.8"
    )
  })

  it("does not pin unused @effect/sql", () => {
    const rootPackageJson = readRootPackageJson()

    expect(rootPackageJson.pnpm?.overrides ?? {}).not.toHaveProperty(
      "@effect/sql"
    )
  })

  it("defines verify as the strict readiness gate alias", () => {
    const rootPackageJson = readRootPackageJson()

    expect(rootPackageJson.scripts?.verify).toBe("pnpm verify:gates")
  })

  it("exposes only the Charmbracelet player UI", () => {
    const rootPackageJson = readRootPackageJson()

    expect(rootPackageJson.scripts?.cli).toBe("pnpm run cli:charm")
    expect(rootPackageJson.scripts?.["cli:charm"]).toBe(
      "cd packages/cli/charm && go run ."
    )
    expect(rootPackageJson.scripts?.["cli:charmbracelet"]).toBe(
      "pnpm run cli:charm"
    )
    for (
      const removedScript of [
        "cli:blessed",
        "cli:tsx",
        "cli:ink",
        "cli:terminal-kit",
        "cli:termkit",
        "cli:old"
      ]
    ) {
      expect(rootPackageJson.scripts).not.toHaveProperty(removedScript)
    }
    expect(rootPackageJson.scripts?.["bot:serve"]).toBe(
      "FLAGHACK_PORT=3100 pnpm run serve"
    )
    expect(rootPackageJson.scripts?.["serve:bot"]).toBe(
      "pnpm run bot:serve"
    )
    expect(rootPackageJson.scripts?.["bot:cli"]).toBe(
      "FLAGHACK_API_URL=http://127.0.0.1:3100 pnpm run cli"
    )
    expect(rootPackageJson.scripts?.["cli:bot"]).toBe(
      "pnpm run bot:cli"
    )
    expect(rootPackageJson.scripts?.["test:charm"]).toBe(
      "cd packages/cli/charm && go test ./..."
    )
    expect(rootPackageJson.scripts?.["verify:smoke"]).toContain(
      "pnpm test:charm"
    )
    expect(rootPackageJson.scripts?.["verify:gates"]).toContain(
      "pnpm test:charm"
    )
    expect(rootPackageJson.scripts?.["verify:smoke"]).toContain(
      "pnpm test:api:bot"
    )
    expect(rootPackageJson.scripts?.["verify:gates"]).toContain(
      "pnpm test:e2e:tmux:bot"
    )
  })

  it("exposes bot validation gates on the alternate development port", () => {
    const rootPackageJson = readRootPackageJson()

    expect(rootPackageJson.scripts?.["test:api:bot"]).toBe(
      "FLAGHACK_TEST_PORT=3100 pnpm run test:api"
    )
    expect(rootPackageJson.scripts?.["test:e2e:tmux:bot"]).toBe(
      "FLAGHACK_TEST_PORT=3100 pnpm run test:e2e:tmux"
    )
    expect(rootPackageJson.scripts?.["test:feature:tmux:bot"]).toBe(
      "FLAGHACK_TEST_PORT=3100 pnpm run test:feature:tmux"
    )
  })

  it("lets API and tmux smoke scripts target a bot port without reusing the user server", () => {
    const apiSmokeSource = readApiSmokeSource()

    expect(apiSmokeSource).toContain("FLAGHACK_TEST_PORT")
    expect(apiSmokeSource).toContain("FLAGHACK_PORT: String(PORT)")
    expect(apiSmokeSource).not.toContain(
      "const BASE_URL = \"http://127.0.0.1:3000\""
    )

    for (const source of readTmuxScriptSources()) {
      expect(source).toContain("FLAGHACK_TEST_PORT")
      expect(source).toContain("FLAGHACK_TMUX_CLI_COMMAND")
      expect(source).toContain(
        "const DEFAULT_CLI_COMMAND = \"pnpm run cli\""
      )
      expect(source).toContain(
        "const shellQuote = (value: string): string"
      )
      expect(source).toContain(
        "const cliCommandWithApiUrl = `export FLAGHACK_API_URL=${"
      )
      expect(source).toContain("shellQuote(BASE_URL)")
      expect(source).toContain("}; ${perfExportCommands()}${cliCommand}`")
      expect(source).toContain("FLAGHACK_PERF_FILE")
      expect(source).toContain("cliCommandWithApiUrl")
      expect(source).toContain("FLAGHACK_PORT=${")
      expect(source).toContain("String(PORT)")
      expect(source).not.toContain("\"pnpm run cli:tsx\"")
    }
  })

  it("wires task graph verification prompts to bot gates instead of the user port", () => {
    const taskGraphSettings = readTaskGraphSettings()

    expect(taskGraphSettings).toContain("test:api:bot")
    expect(taskGraphSettings).toContain("test:e2e:tmux:bot")
    expect(taskGraphSettings).toContain("test:feature:tmux:bot")
    expect(taskGraphSettings).toContain("localhost:3100")
    expect(taskGraphSettings).toContain("user-owned localhost:3000")
    expect(taskGraphSettings).not.toContain(
      "hard-coded local server port 3000"
    )
  })

  it("ends the feature task graph with an automatic commit stage", () => {
    const featureGraph = readTaskGraphSettingsJson().graphs?.[
      "flag-hack-feature-gated"
    ]
    const commitStage = featureGraph?.stages?.at(-1)

    expect(featureGraph?.description).toContain(
      "automatic commit stage"
    )
    expect(commitStage?.id).toBe("commit")
    expect(commitStage?.kind).toBe("COMMIT")
    expect(commitStage?.dependsOn).toEqual(["review"])
    expect(commitStage?.description).toContain(
      "commit stage becomes ready"
    )
    expect(commitStage?.promptInstructions).toContain(
      "Run this stage automatically when it becomes ready after validation and code review."
    )
    expect(commitStage?.promptInstructions).toContain(
      "Before committing, inspect git status and ensure unrelated files such as chatgpt.txt are not staged."
    )
    expect(commitStage?.isolationBoundary).toContain("Do not push")
  })

  it("uses bounded source globs for root lint", () => {
    const rootPackageJson = readRootPackageJson()
    const lintScript = rootPackageJson.scripts?.lint

    expect(typeof lintScript).toBe("string")
    if (typeof lintScript !== "string") {
      throw new Error("Expected root lint script to be a string")
    }

    expect(lintScript).not.toMatch(/\beslint\s+\.(?:\s|$)/)
    expect(lintScript).toContain(
      "**/{src,test,examples,scripts,dtslint}/**/*."
    )
    expect(lintScript).toMatch(/--max-warnings(?:=|\s+)0\b/)

    const boundedSourceGlobMatch = lintScript.match(
      /\*\*\/\{src,test,examples,scripts,dtslint\}\/\*\*\/\*\.\{([^}]+)\}/
    )
    const lintExtensions = boundedSourceGlobMatch?.[1]?.split(",") ?? []

    expect(lintExtensions).toEqual(
      expect.arrayContaining(requiredLintExtensions)
    )
  })

  it("does not use latest for direct Effect-family dev dependencies", () => {
    const rootPackageJson = readRootPackageJson()
    const latestEffectFamilyDevDependencies = Object.entries(
      rootPackageJson.devDependencies ?? {}
    )
      .filter(
        ([name, value]) =>
          (name === "effect" || name.startsWith("@effect/"))
          && value === "latest"
      )
      .map(([name]) => name)

    expect(latestEffectFamilyDevDependencies).toEqual([])
  })
})

describe("root TypeScript build metadata", () => {
  it("excludes removed UI packages from build references", () => {
    const rootTsconfigBuildJson = readRootTsconfigBuildJson()
    const referencePaths = (rootTsconfigBuildJson.references ?? []).map(
      (reference) => reference.path
    )

    expect(referencePaths).not.toContain("packages/web")
    expect(referencePaths).not.toContain(
      "packages/cli/tsconfig.build.json"
    )
  })
})

describe("root formatter metadata", () => {
  it("excludes generated, disposable, and local Pi runtime files", () => {
    const rootDprintJson = readRootDprintJson()

    expect(rootDprintJson.excludes).toEqual(
      expect.arrayContaining(requiredDprintExcludePatterns)
    )
  })
})

describe("root ESLint metadata", () => {
  it("ignores generated, disposable, docs, and local Pi runtime files", () => {
    const rootEslintConfigMjs = readRootEslintConfigMjs()

    for (const ignorePattern of requiredEslintIgnorePatterns) {
      expect(rootEslintConfigMjs).toContain(`"${ignorePattern}"`)
    }
  })

  it("treats unsafe TypeScript boundary rules as errors", () => {
    const rootEslintConfigMjs = readRootEslintConfigMjs()

    for (const ruleName of requiredEslintErrorRules) {
      expect(rootEslintConfigMjs).toContain(`"${ruleName}": "error"`)
    }
  })

  it("bounds Effect/FP restrictions to backend and domain source", () => {
    const rootEslintConfigMjs = readRootEslintConfigMjs()

    expect(rootEslintConfigMjs).toContain(
      "\"plugin:@effect/recommended\""
    )
    expect(rootEslintConfigMjs).not.toContain(
      "packages/cli/src/**/*.ts"
    )
    expect(rootEslintConfigMjs).not.toContain(
      "packages/web/src/**/*.ts"
    )

    for (const sourceGlob of effectFpLintSourceGlobs) {
      expect(rootEslintConfigMjs).toContain(`"${sourceGlob}"`)
    }

    for (const excludedGlob of effectFpLintExcludedSourceGlobs) {
      expect(rootEslintConfigMjs).toContain(`"${excludedGlob}"`)
    }

    expect(rootEslintConfigMjs).toContain("\"no-restricted-imports\": [")
    expect(rootEslintConfigMjs).toContain(
      "importNames: [\"randomUUID\", \"webcrypto\"]"
    )
    expect(rootEslintConfigMjs).toContain("name: \"node:crypto\"")
    expect(rootEslintConfigMjs).toContain("name: \"crypto\"")
    expect(rootEslintConfigMjs).toContain(
      "\"flaghack/effect-async-boundaries\": \"error\""
    )
    expect(rootEslintConfigMjs).toContain(
      "\"flaghack/effect-key-generation\": \"error\""
    )
    expect(rootEslintConfigMjs).toContain(
      "\"no-restricted-properties\": ["
    )
    expect(rootEslintConfigMjs).toContain("object: \"Math\"")
    expect(rootEslintConfigMjs).toContain("property: \"random\"")
    expect(rootEslintConfigMjs).toContain("object: \"crypto\"")
    expect(rootEslintConfigMjs).toContain("object: \"webcrypto\"")
    expect(rootEslintConfigMjs).toContain("property: \"randomUUID\"")

    for (const selector of requiredEffectFpLintSelectors) {
      expect(rootEslintConfigMjs).toContain(`"${selector}"`)
    }
  })

  it("rejects random UUID escape hatches in backend/domain lint fixtures", () => {
    const bannedFixtures = [
      "globalThis.crypto.randomUUID()\n",
      "globalThis.crypto[\"randomUUID\"]()\n",
      "globalThis.crypto?.[\"randomUUID\"]()\n",
      "globalThis.crypto[`randomUUID`]()\n",
      "const cryptoSource = globalThis.crypto\n\ncryptoSource.randomUUID()\n",
      "const { randomUUID } = globalThis.crypto\n\nrandomUUID()\n",
      "const uuid = ({ randomUUID: uuid }) => uuid()\n\nuuid(globalThis.crypto)\n",
      "import { webcrypto } from \"node:crypto\"\n\nwebcrypto.randomUUID()\n",
      "import { webcrypto as cryptoSource } from \"node:crypto\"\n\ncryptoSource.randomUUID()\n"
    ]

    for (const fixture of bannedFixtures) {
      expect(backendDomainEslintFixtureError(fixture)).toContain(
        "KeyGenerator"
      )
    }
  })

  it("allows async callbacks inside Effect boundary helpers", () => {
    const allowedFixtures = [
      "import { Effect } from \"effect\"\n\nexport const program = Effect.tryPromise(async () => 1)\n",
      "import { Data, Effect } from \"effect\"\n\nclass FetchError\n  extends Data.TaggedError(\"FetchError\")<{ readonly cause: unknown }>\n{}\n\nexport const program = Effect.tryPromise({\n  try: async () => 1,\n  catch: (cause) => new FetchError({ cause })\n})\n"
    ]

    for (const fixture of allowedFixtures) {
      expect(runBackendDomainEslintFixture(fixture)).toBe("")
    }
  })

  it("rejects raw async backend/domain API fixtures", () => {
    const bannedFixtures = [
      "export default async () => 1\n",
      "export const request = async () => 1\n",
      "class Service {\n  request = async () => 1\n}\n",
      "export const service = {\n  request: async () => 1\n}\n",
      "export const service = {\n  try: async () => 1\n}\n",
      "const tryPromise = (fn) => fn()\n\nexport const program = tryPromise(async () => 1)\n",
      "const Effect = {\n  tryPromise: (fn) => fn()\n}\n\nexport const program = Effect.tryPromise(async () => 1)\n",
      "import type { Effect as EffectType } from \"effect\"\n\ntype Program = EffectType.Effect<number>\n\nconst Effect = {\n  tryPromise: (fn: () => Promise<number>): Program => fn() as unknown as Program\n}\n\nexport const program = Effect.tryPromise(async () => 1)\n"
    ]

    for (const fixture of bannedFixtures) {
      expect(backendDomainEslintFixtureError(fixture)).toContain(
        "raw async"
      )
    }
  })
})

describe("root Vitest metadata", () => {
  it("selects source aliases by default and package dist ESM aliases for TEST_DIST", () => {
    expect(getVitestSourceTarget({ TEST_DIST: "1" })).toBe(
      "dist/dist/esm"
    )
    expect(getVitestSourceTarget({})).toBe("src")
  })

  it("resolves TEST_DIST package aliases from package roots", () => {
    const aliases = packageAlias(
      "domain",
      "@flaghack/domain",
      "dist/dist/esm"
    )

    expect(aliases["@flaghack/domain"]).toBe(
      join(repositoryRoot, "packages/domain/dist/dist/esm")
    )
  })

  it("keeps TEST_DIST configured for build-utils pack-v2 package output", () => {
    const rootVitestSharedTs = readRootVitestSharedTs()

    expect(rootVitestSharedTs).toContain("\"dist/dist/esm\"")
  })
})

describe("@effect/build-utils package metadata", () => {
  for (const packageManifest of packageManifests) {
    it(`${packageManifest.name} excludes non-module inputs`, () => {
      const manifest = readPackageManifest(packageManifest.path)

      for (const metadataKey of buildUtilsGenerateMetadataKeys) {
        expect(manifest.effect?.[metadataKey]?.exclude).toEqual(
          expect.arrayContaining(requiredBuildUtilsExcludePatterns)
        )
      }
    })
  }
})
