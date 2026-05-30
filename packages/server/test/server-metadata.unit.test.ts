import { describe, expect, it } from "@effect/vitest"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const serverPackagePath = join(
  dirname(fileURLToPath(import.meta.url)),
  ".."
)
const serverPackageJsonPath = join(serverPackagePath, "package.json")

type ServerPackageJson = {
  readonly name?: unknown
  readonly private?: unknown
  readonly publishConfig?: unknown
  readonly dependencies?: Readonly<Record<string, unknown>>
  readonly devDependencies?: Readonly<Record<string, unknown>>
}

const readServerPackageJson = (): ServerPackageJson =>
  JSON.parse(
    readFileSync(serverPackageJsonPath, "utf8")
  ) as ServerPackageJson

describe("server package metadata", () => {
  it("declares private publish intent unambiguously", () => {
    const serverPackageJson = readServerPackageJson()

    expect(serverPackageJson.name).toBe("@flaghack/server")
    expect(serverPackageJson.private).toBe(true)
    expect(serverPackageJson).not.toHaveProperty("publishConfig")
  })

  it("pins Effect platform runtime dependencies", () => {
    const serverPackageJson = readServerPackageJson()

    expect(serverPackageJson.dependencies?.["@effect/platform"]).toBe(
      "0.85.2"
    )
    expect(serverPackageJson.dependencies?.["@effect/platform-node"]).toBe(
      "0.86.4"
    )
  })

  it("does not use latest for direct runtime dependencies", () => {
    const serverPackageJson = readServerPackageJson()
    const latestRuntimeDependencies = Object.entries(
      serverPackageJson.dependencies ?? {}
    )
      .filter(([, value]) => value === "latest")
      .map(([name]) => name)

    expect(latestRuntimeDependencies).toEqual([])
  })

  it("does not duplicate runtime dependencies in devDependencies", () => {
    const serverPackageJson = readServerPackageJson()
    const runtimeDependencyNames = new Set(
      Object.keys(serverPackageJson.dependencies ?? {})
    )
    const duplicatedDependencyNames = Object.keys(
      serverPackageJson.devDependencies ?? {}
    ).filter((name) => runtimeDependencyNames.has(name))

    expect(duplicatedDependencyNames).toEqual([])
  })
})
