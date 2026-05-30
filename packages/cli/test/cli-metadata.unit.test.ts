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

type PackageJsonWithEngines = {
  readonly engines?: {
    readonly node?: string
  }
}

const readCliPackageJson = (): PackageJsonWithEngines =>
  JSON.parse(
    readFileSync(cliPackageJsonPath, "utf8")
  ) as PackageJsonWithEngines

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
})
