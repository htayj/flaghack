import { describe, expect, it } from "@effect/vitest"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const cliBlessedSourcePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../src/cliBlessed.tsx"
)

const topLevelScreenAllocation =
  /^const\s+screen\s*=\s*blessed\.screen\s*\(/m
const startblessedCreatesScreen =
  /export\s+const\s+startblessed\s*=\s*\(\)\s*=>\s*{[\s\S]*?blessed\.screen\s*\(/

describe("cli blessed lifecycle", () => {
  it("allocates the blessed screen lazily inside startblessed", () => {
    const cliBlessedSource = readFileSync(cliBlessedSourcePath, "utf8")

    expect(cliBlessedSource).not.toMatch(topLevelScreenAllocation)
    expect(cliBlessedSource).toMatch(startblessedCreatesScreen)
  })
})
