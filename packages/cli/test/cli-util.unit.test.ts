import { describe, expect, it } from "@effect/vitest"
import { genKey } from "@flaghack/cli/util"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const testDir = dirname(fileURLToPath(import.meta.url))
const utilSourcePath = join(testDir, "../src/util.ts")
const genKeyExport = "export const genKey"

const getGenKeySource = (source: string) => {
  const start = source.indexOf(genKeyExport)
  expect(start).toBeGreaterThanOrEqual(0)

  const nextExport = source.indexOf(
    "\nexport ",
    start + genKeyExport.length
  )
  return nextExport === -1
    ? source.slice(start)
    : source.slice(start, nextExport)
}

describe("CLI genKey", () => {
  it("keeps genKey backed by Node UUID generation", () => {
    const source = readFileSync(utilSourcePath, "utf8")
    const genKeySource = getGenKeySource(source)

    expect(source).toMatch(
      /import\s*{\s*randomUUID\s*}\s*from\s*["']node:crypto["']/
    )
    expect(genKeySource).toContain("randomUUID()")
    expect(genKeySource).not.toContain("Math.random")
    expect(genKeySource).not.toContain("2 ** 8")
  })

  it("returns non-empty unique string keys", () => {
    const keys = Array.from({ length: 128 }, () => genKey())

    expect(
      keys.every((key) => typeof key === "string" && key.length > 0)
    ).toBe(true)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
