import { describe, expect, it } from "@effect/vitest"
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
const rootTsconfigBuildJsonPath = join(
  repositoryRoot,
  "tsconfig.build.json"
)
const rootVitestSharedTsPath = join(repositoryRoot, "vitest.shared.ts")

const packageManifests = [
  {
    name: "@flaghack/cli",
    path: join(repositoryRoot, "packages/cli/package.json")
  },
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

const readRootVitestSharedTs = (): string =>
  readFileSync(rootVitestSharedTsPath, "utf8")

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
  it("includes the web package in build references", () => {
    const rootTsconfigBuildJson = readRootTsconfigBuildJson()
    const referencePaths = (rootTsconfigBuildJson.references ?? []).map(
      (reference) => reference.path
    )

    expect(referencePaths).toContain("packages/web")
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
