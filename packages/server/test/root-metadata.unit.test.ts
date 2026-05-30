import { describe, expect, it } from "@effect/vitest"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const repositoryRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../.."
)
const rootPackageJsonPath = join(repositoryRoot, "package.json")

type RootPackageJson = {
  readonly devDependencies?: Readonly<Record<string, unknown>>
  readonly pnpm?: {
    readonly overrides?: Readonly<Record<string, unknown>>
  }
}

const readRootPackageJson = (): RootPackageJson =>
  JSON.parse(readFileSync(rootPackageJsonPath, "utf8")) as RootPackageJson

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
