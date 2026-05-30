import { readFile } from "node:fs/promises"

import { describe, expect, it } from "@effect/vitest"

type PackageJson = {
  readonly dependencies?: Readonly<Record<string, string>>
  readonly devDependencies?: Readonly<Record<string, string>>
}

const packageJsonUrl = new URL("../package.json", import.meta.url)

const readWebPackageJson = async (): Promise<PackageJson> =>
  JSON.parse(await readFile(packageJsonUrl, "utf8")) as PackageJson

describe("web package metadata", () => {
  it("classifies typescript-language-server as development-only tooling", async () => {
    const packageJson = await readWebPackageJson()

    expect(packageJson.dependencies).not.toHaveProperty(
      "typescript-language-server"
    )
    expect(packageJson.devDependencies).toHaveProperty(
      "typescript-language-server",
      "^4.3.4"
    )
  })
})
