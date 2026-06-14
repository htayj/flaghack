import { describe, expect, it } from "@effect/vitest"
import { readFile } from "node:fs/promises"

type PackageJson = {
  readonly dependencies?: Readonly<Record<string, string>>
}

const readDomainPackageJson = async (): Promise<PackageJson> =>
  JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8")
  ) as PackageJson

describe("domain package metadata", () => {
  it("does not declare @effect/sql as a direct runtime dependency", async () => {
    const packageJson = await readDomainPackageJson()

    expect(packageJson.dependencies ?? {}).not.toHaveProperty(
      "@effect/sql"
    )
  })

  it("pins @effect/platform to the supported runtime version", async () => {
    const packageJson = await readDomainPackageJson()

    expect(packageJson.dependencies?.["@effect/platform"]).toBe("0.85.2")
  })

  it("does not use latest for direct runtime dependencies", async () => {
    const packageJson = await readDomainPackageJson()

    expect(Object.values(packageJson.dependencies ?? {})).not.toContain(
      "latest"
    )
  })
})
