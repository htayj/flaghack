import { describe, expect, it } from "@effect/vitest"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const repositoryRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../.."
)

const packageDocs = [
  {
    name: "@flaghack/domain",
    manifestPath: "packages/domain/package.json",
    readmePath: "packages/domain/README.md",
    description:
      "Flag Hack shared schemas, API contract, game state types, and display helpers.",
    expectedHeading: "# @flaghack/domain",
    requiredPhrases: [
      "GameApi",
      "src/schemas.ts",
      "World",
      "Action",
      "GameState",
      "display tile mapping"
    ]
  },
  {
    name: "@flaghack/server",
    manifestPath: "packages/server/package.json",
    readmePath: "packages/server/README.md",
    description: "Flag Hack HTTP server and in-process game runtime.",
    expectedHeading: "# @flaghack/server",
    requiredPhrases: [
      "ApiLive",
      "GameRepository",
      "src/server.ts",
      "in-process game loop",
      "CORS",
      "logger"
    ]
  },
  {
    name: "@flaghack/cli",
    manifestPath: "packages/cli/package.json",
    readmePath: "packages/cli/README.md",
    description:
      "Flag Hack Charmbracelet terminal client and Node HTTP client runtime.",
    expectedHeading: "# @flaghack/cli",
    requiredPhrases: [
      "charm/",
      "Charmbracelet",
      "src/Cli.ts",
      "src/GameClient.ts",
      "Node HTTP client runtime"
    ]
  },
  {
    name: "@flaghack/web",
    manifestPath: "packages/web/package.json",
    readmePath: "packages/web/README.md",
    description:
      "Flag Hack React/Vite browser client and browser HTTP runtime.",
    expectedHeading: "# @flaghack/web",
    requiredPhrases: [
      "src/GameClient.ts",
      "React/Vite",
      "browser HTTP runtime",
      "DOM renderer",
      "shared domain contract"
    ]
  }
] as const

const auditDocs = [
  "ARCHITECTURE_OPPORTUNITIES.md",
  "BUILD_SYSTEM_OPPORTUNITIES.md",
  "EFFECT_TS_OPPORTUNITIES.md",
  "FP_IMMUTABILITY_OPPORTUNITIES.md"
] as const

const generatedFilePolicyPhrases = [
  "packages/**/build/**",
  "packages/**/dist/**",
  "*.d.ts",
  "*.d.ts.map",
  "*.js.map",
  "packages/domain/src/schemas/*.js",
  "*~",
  "#*#",
  ".#*"
] as const

const templateLeftovers = [
  "Effect Monorepo Template",
  "React + TypeScript + Vite",
  "The domain template",
  "The server template",
  "The CLI template",
  "This template provides a minimal setup",
  "Fast Refresh",
  "Expanding the ESLint configuration",
  "official plugins are available",
  "minimal setup to get React working in Vite"
] as const

type PackageManifest = {
  readonly description?: unknown
  readonly name?: unknown
}

const readText = (relativePath: string): string =>
  readFileSync(join(repositoryRoot, relativePath), "utf8")

const readManifest = (relativePath: string): PackageManifest =>
  JSON.parse(readText(relativePath)) as PackageManifest

describe("package README and manifest metadata", () => {
  for (const packageDoc of packageDocs) {
    it(`${packageDoc.name} documents package ownership`, () => {
      const manifest = readManifest(packageDoc.manifestPath)
      const readme = readText(packageDoc.readmePath)
      const searchableContent = `${
        String(manifest.description ?? "")
      }\n${readme}`

      expect(manifest.name).toBe(packageDoc.name)
      expect(manifest.description).toBe(packageDoc.description)
      expect(readme.startsWith(packageDoc.expectedHeading)).toBe(true)

      for (const requiredPhrase of packageDoc.requiredPhrases) {
        expect(readme).toContain(requiredPhrase)
      }

      for (const auditDoc of auditDocs) {
        expect(readme).toContain(auditDoc)
      }

      for (const generatedFilePolicyPhrase of generatedFilePolicyPhrases) {
        expect(readme).toContain(generatedFilePolicyPhrase)
      }

      for (const templateLeftover of templateLeftovers) {
        expect(searchableContent).not.toContain(templateLeftover)
      }
    })
  }
})
