import { readFile } from "node:fs/promises"

import { describe, expect, it } from "@effect/vitest"

type PackageJson = {
  readonly dependencies?: Readonly<Record<string, string>>
  readonly devDependencies?: Readonly<Record<string, string>>
}

const packageJsonUrl = new URL("../package.json", import.meta.url)
const effectPlatformVersion = "0.85.2"
const effectPlatformBrowserVersion = "0.65.2"

const readWebPackageJson = async (): Promise<PackageJson> =>
  JSON.parse(await readFile(packageJsonUrl, "utf8")) as PackageJson

const findDuplicatedDependencyNames = ({
  dependencies = {},
  devDependencies = {}
}: PackageJson): Array<string> => {
  const dependencyNames = new Set(Object.keys(dependencies))

  return Object.keys(devDependencies).filter((dependencyName) =>
    dependencyNames.has(dependencyName)
  )
}

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

  it("pins Effect platform package versions as runtime dependencies only", async () => {
    const packageJson = await readWebPackageJson()

    expect(packageJson.dependencies).toHaveProperty(
      "@effect/platform",
      effectPlatformVersion
    )
    expect(packageJson.dependencies).toHaveProperty(
      "@effect/platform-browser",
      effectPlatformBrowserVersion
    )
    expect(packageJson.devDependencies).not.toHaveProperty(
      "@effect/platform"
    )
    expect(packageJson.devDependencies).not.toHaveProperty(
      "@effect/platform-browser"
    )
  })

  it("does not duplicate runtime dependencies as development dependencies", async () => {
    const packageJson = await readWebPackageJson()

    expect(findDuplicatedDependencyNames(packageJson)).toEqual([])
  })

  it("does not use latest as a direct package specifier", async () => {
    const packageJson = await readWebPackageJson()

    expect(Object.values(packageJson.dependencies ?? {})).not.toContain(
      "latest"
    )
    expect(Object.values(packageJson.devDependencies ?? {})).not.toContain(
      "latest"
    )
  })
})
