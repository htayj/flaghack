import { describe, expect, it } from "@effect/vitest"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import type { UserConfig } from "vite"

const cliPackagePath = join(
  dirname(fileURLToPath(import.meta.url)),
  ".."
)
const cliSourcePath = join(cliPackagePath, "src/Cli.ts")
const cliPackageJsonPath = join(cliPackagePath, "package.json")
const cliViteConfigPath = join(cliPackagePath, "vite.config.js")

const deprecatedTemplateMetadata = [
  "Command.make(\"todo\")",
  "Todo CLI",
  "Add a new todo"
] as const

const deprecatedDevelopmentCommandMetadata = [
  "const test = Command.make(\"test\")",
  "Command.make(\"test\")",
  "test getting a world"
] as const

const expectedMoveSouthCommandMetadata = [
  "const moveSouth = Command.make(\"move-south\")",
  "Submit a debug move-south action to the game server"
] as const

const deprecatedInventoryNoOutputHandler =
  "Command.withHandler(() => GameClient.getInventory)"

const expectedInventoryOutputMetadata = [
  "Console.log",
  "Inventory is empty.",
  "Inventory: "
] as const

type PackageDependencyMap = Readonly<Record<string, string>>

type PackageDependencySectionName =
  | "dependencies"
  | "devDependencies"
  | "optionalDependencies"
  | "peerDependencies"

type PackageJsonWithMetadata = {
  readonly dependencies?: PackageDependencyMap
  readonly devDependencies?: PackageDependencyMap
  readonly optionalDependencies?: PackageDependencyMap
  readonly peerDependencies?: PackageDependencyMap
  readonly engines?: {
    readonly node?: string
  }
}

const expectedPinnedEffectPackageVersions = {
  "@effect/cli": "0.64.2",
  "@effect/platform": "0.85.2",
  "@effect/platform-node": "0.86.4"
} as const

const readCliPackageJson = (): PackageJsonWithMetadata =>
  JSON.parse(
    readFileSync(cliPackageJsonPath, "utf8")
  ) as PackageJsonWithMetadata

const isEffectFamilyPackageName = (packageName: string): boolean =>
  packageName === "effect" || packageName.startsWith("@effect/")

const effectFamilyDependencyEntries = (
  dependencies: PackageDependencyMap | undefined
): ReadonlyArray<readonly [string, string]> =>
  Object.entries(dependencies ?? {}).filter(([packageName]) =>
    isEffectFamilyPackageName(packageName)
  )

const packageDependencySections = (
  cliPackageJson: PackageJsonWithMetadata
): ReadonlyArray<
  readonly [PackageDependencySectionName, PackageDependencyMap | undefined]
> =>
  [
    ["dependencies", cliPackageJson.dependencies],
    ["devDependencies", cliPackageJson.devDependencies],
    ["optionalDependencies", cliPackageJson.optionalDependencies],
    ["peerDependencies", cliPackageJson.peerDependencies]
  ] as const

const readCliViteBuildTarget = async (): Promise<string> => {
  const viteConfigModule = await import(
    pathToFileURL(cliViteConfigPath).href
  )
  const viteConfig = viteConfigModule.default as UserConfig
  const buildTarget = viteConfig.build?.target

  expect(typeof buildTarget).toBe("string")

  return buildTarget as string
}

const nodeEngineRangeFromViteTarget = (target: string): string => {
  const majorVersion = /^node(\d+)$/.exec(target)?.[1]

  expect(majorVersion).toBeDefined()

  return `>=${majorVersion}`
}

describe("CLI metadata", () => {
  it("does not use template Todo CLI metadata", () => {
    const cliSource = readFileSync(cliSourcePath, "utf8")

    for (const metadata of deprecatedTemplateMetadata) {
      expect(cliSource).not.toContain(metadata)
    }
  })

  it("uses explicit game-oriented metadata for the debug move command", () => {
    const cliSource = readFileSync(cliSourcePath, "utf8")

    for (const metadata of deprecatedDevelopmentCommandMetadata) {
      expect(cliSource).not.toContain(metadata)
    }

    for (const metadata of expectedMoveSouthCommandMetadata) {
      expect(cliSource).toContain(metadata)
    }
  })

  it("prints formatted inventory output instead of returning the inventory API call directly", () => {
    const cliSource = readFileSync(cliSourcePath, "utf8")

    expect(cliSource).not.toContain(deprecatedInventoryNoOutputHandler)

    for (const metadata of expectedInventoryOutputMetadata) {
      expect(cliSource).toContain(metadata)
    }
  })

  it("declares a Node engine matching the Vite SSR target", async () => {
    const cliPackageJson = readCliPackageJson()
    const viteBuildTarget = await readCliViteBuildTarget()
    const expectedNodeEngine = nodeEngineRangeFromViteTarget(
      viteBuildTarget
    )

    expect(cliPackageJson.engines?.node).toBe(expectedNodeEngine)
  })

  it("pins direct CLI Effect-family dependencies to concrete versions", () => {
    const cliPackageJson = readCliPackageJson()

    for (
      const [packageName, expectedVersion] of Object.entries(
        expectedPinnedEffectPackageVersions
      )
    ) {
      expect(cliPackageJson.dependencies?.[packageName]).toBe(
        expectedVersion
      )
    }

    for (
      const [packageName, version] of [
        ...effectFamilyDependencyEntries(cliPackageJson.dependencies),
        ...effectFamilyDependencyEntries(cliPackageJson.devDependencies)
      ]
    ) {
      expect(version, `${packageName} must not use latest`).not.toBe(
        "latest"
      )
    }
  })

  it("uses exact workspace protocol for the domain dependency", () => {
    const cliPackageJson = readCliPackageJson()

    expect(cliPackageJson.dependencies?.["@flaghack/domain"]).toBe(
      "workspace:*"
    )
  })

  it("does not duplicate runtime dependencies in devDependencies", () => {
    const cliPackageJson = readCliPackageJson()
    const runtimeDependencies = cliPackageJson.dependencies ?? {}
    const duplicateDependencyNames = Object.keys(
      cliPackageJson.devDependencies ?? {}
    )
      .filter((packageName) => packageName in runtimeDependencies)
      .sort()

    expect(duplicateDependencyNames).toEqual([])
  })

  it("does not declare scala-ts in direct CLI dependency metadata", () => {
    const cliPackageJson = readCliPackageJson()

    for (
      const [sectionName, dependencies] of packageDependencySections(
        cliPackageJson
      )
    ) {
      expect(
        dependencies ?? {},
        `${sectionName} must not declare scala-ts`
      ).not.toHaveProperty("scala-ts")
    }
  })

  it("does not use latest for direct CLI dependencies", () => {
    const cliPackageJson = readCliPackageJson()
    for (
      const [sectionName, dependencies] of packageDependencySections(
        cliPackageJson
      )
    ) {
      for (
        const [packageName, version] of Object.entries(
          dependencies ?? {}
        )
      ) {
        expect(
          version,
          `${sectionName}.${packageName} must not use latest`
        ).not.toBe("latest")
      }
    }
  })
})
