import { describe, expect, it } from "@effect/vitest"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const repositoryRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../.."
)
const rootPackageJsonPath = join(repositoryRoot, "package.json")
const rootTsconfigBuildJsonPath = join(
  repositoryRoot,
  "tsconfig.build.json"
)

type RootPackageJson = {
  readonly devDependencies?: Readonly<Record<string, unknown>>
  readonly pnpm?: {
    readonly overrides?: Readonly<Record<string, unknown>>
  }
}

type RootTsconfigBuildJson = {
  readonly references?: ReadonlyArray<{
    readonly path?: unknown
  }>
}

const readRootPackageJson = (): RootPackageJson =>
  JSON.parse(readFileSync(rootPackageJsonPath, "utf8")) as RootPackageJson

const readRootTsconfigBuildJson = (): RootTsconfigBuildJson =>
  JSON.parse(
    readFileSync(rootTsconfigBuildJsonPath, "utf8")
  ) as RootTsconfigBuildJson

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
