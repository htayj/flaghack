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
})
