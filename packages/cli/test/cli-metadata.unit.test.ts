import { describe, expect, it } from "@effect/vitest"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const cliSourcePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../src/Cli.ts"
)

const deprecatedTemplateMetadata = [
  "Command.make(\"todo\")",
  "Todo CLI",
  "Add a new todo"
] as const

describe("CLI metadata", () => {
  it("does not use template Todo CLI metadata", () => {
    const cliSource = readFileSync(cliSourcePath, "utf8")

    for (const metadata of deprecatedTemplateMetadata) {
      expect(cliSource).not.toContain(metadata)
    }
  })
})
