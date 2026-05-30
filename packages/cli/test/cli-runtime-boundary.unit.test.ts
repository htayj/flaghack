import { describe, expect, it } from "@effect/vitest"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const testDir = dirname(fileURLToPath(import.meta.url))
const sourcePath = (fileName: string) => join(testDir, "../src", fileName)

const bPlayingSourcePath = sourcePath("components/BPlaying.tsx")
const binSourcePath = sourcePath("bin.ts")
const runtimeSourcePath = sourcePath("runtime.ts")

const importMainLiveFromBin =
  /import\s*{\s*MainLive\s*}\s*from\s*["']\.\.\/bin(?:\.js)?["']/
const importMainLiveFromRuntime =
  /import\s*{\s*MainLive\s*}\s*from\s*["']\.\.\/runtime\.js["']/
const importMainLiveFromRuntimeInBin =
  /import\s*{\s*MainLive\s*}\s*from\s*["']\.\/runtime\.js["']/
const executableMain =
  /cli\s*\(\s*process\.argv\s*\)\s*\.pipe\([\s\S]*NodeRuntime\.runMain[\s\S]*\)/
const runtimeForbiddenTerms = [
  "cli(process.argv)",
  "NodeRuntime.runMain",
  "process.argv"
] as const

const runtimeForbiddenImports = [
  /from\s*["']\.\/Cli\.js["']/,
  /from\s*["']\.\/cliBlessed\.js["']/
] as const

describe("CLI runtime boundary", () => {
  it("keeps BPlaying on the runtime layer instead of importing the executable", () => {
    const bPlayingSource = readFileSync(bPlayingSourcePath, "utf8")

    expect(bPlayingSource).not.toMatch(importMainLiveFromBin)
    expect(bPlayingSource).toMatch(importMainLiveFromRuntime)
  })

  it("keeps MainLive in a non-executable runtime module", () => {
    const runtimeSource = readFileSync(runtimeSourcePath, "utf8")

    expect(runtimeSource).toMatch(/export\s+const\s+MainLive\s*=/)
    for (const forbiddenTerm of runtimeForbiddenTerms) {
      expect(runtimeSource).not.toContain(forbiddenTerm)
    }
    for (const forbiddenImport of runtimeForbiddenImports) {
      expect(runtimeSource).not.toMatch(forbiddenImport)
    }
  })

  it("keeps bin wired to the runtime layer and executable entrypoint", () => {
    const binSource = readFileSync(binSourcePath, "utf8")

    expect(binSource).toMatch(importMainLiveFromRuntimeInBin)
    expect(binSource).toMatch(executableMain)
  })
})
