import { describe, expect, it } from "@effect/vitest"
import { genKey, nullMatrix } from "@flaghack/cli/util"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const testDir = dirname(fileURLToPath(import.meta.url))
const utilSourcePath = join(testDir, "../src/util.ts")
const bPlayingSourcePath = join(testDir, "../src/components/BPlaying.tsx")

const getExportedConstSource = (source: string, name: string) => {
  const exportStart = source.indexOf(`export const ${name}`)
  expect(exportStart).toBeGreaterThanOrEqual(0)

  const nextExport = source.indexOf(
    "\nexport ",
    exportStart + `export const ${name}`.length
  )
  return nextExport === -1
    ? source.slice(exportStart)
    : source.slice(exportStart, nextExport)
}

const expectNoAliasedRowFill = (source: string) => {
  expect(source).not.toContain("rows.fill(Array")
  expect(source).not.toContain(".fill(Array<null>")
}

describe("CLI nullMatrix", () => {
  it("returns the requested immutable matrix dimensions", () => {
    const matrix = nullMatrix(2, 3)

    expect(matrix.size).toBe(2)
    expect(matrix.every((row) => row.size === 3)).toBe(true)
    expect(matrix.toJS()).toEqual([
      [null, null, null],
      [null, null, null]
    ])
  })

  it("does not construct rows with aliased mutable array fill", () => {
    const utilSource = getExportedConstSource(
      readFileSync(utilSourcePath, "utf8"),
      "nullMatrix"
    )
    const bPlayingSource = getExportedConstSource(
      readFileSync(bPlayingSourcePath, "utf8"),
      "nullMatrix"
    )

    expectNoAliasedRowFill(utilSource)
    expectNoAliasedRowFill(bPlayingSource)
  })
})

describe("CLI genKey", () => {
  it("keeps genKey backed by Node UUID generation", () => {
    const source = readFileSync(utilSourcePath, "utf8")
    const genKeySource = getExportedConstSource(source, "genKey")

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
