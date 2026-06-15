import { describe, expect, it } from "@effect/vitest"
import {
  cmap,
  genKey,
  nullMatrix,
  tilesToText,
  tileToText
} from "@flaghack/cli/util"
import { List, Map as ImmutableMap } from "immutable"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const testDir = dirname(fileURLToPath(import.meta.url))
const utilSourcePath = join(testDir, "../src/util.ts")
const tuiGameSourcePath = join(testDir, "../src/tuiGame.ts")

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

const cmapSource = () =>
  getExportedConstSource(readFileSync(utilSourcePath, "utf8"), "cmap")

const expectNoAliasedRowFill = (source: string) => {
  expect(source).not.toContain("rows.fill(Array")
  expect(source).not.toContain(".fill(Array<null>")
}

describe("CLI tile text rendering", () => {
  it("resets terminal color after a rendered tile character", () => {
    expect(tileToText({ color: "red", char: "R" })).toBe(
      "\x1b[31mR\x1b[0m"
    )
  })

  it("resets each adjacent tile independently", () => {
    expect(
      tilesToText([[
        { color: "red", char: "A" },
        { color: "blue", char: "B" }
      ]])
    ).toBe("\x1b[31mA\x1b[0m\x1b[34mB\x1b[0m")
  })
})

describe("CLI cmap", () => {
  it("maps immutable lists with type-changing returns", () => {
    const mapped: List<string> = cmap(
      (value: number) => `flag-${value}`
    )(List([0, 1, 2]))

    expect(mapped.toArray()).toEqual(["flag-0", "flag-1", "flag-2"])
  })

  it("maps arrays and keyed immutable maps with type-changing returns", () => {
    const mappedArray: Array<string> = cmap(
      (value: number) => `flag-${value}`
    )([0, 1, 2])
    const mappedMap: ImmutableMap<string, string> = cmap(
      (value: number) => `flag-${value}`
    )(ImmutableMap<string, number>({ a: 1, b: 2 }))

    expect(mappedArray).toEqual(["flag-0", "flag-1", "flag-2"])
    expect(mappedMap.toObject()).toEqual({ a: "flag-1", b: "flag-2" })
  })

  it("is implemented through the collection map method", () => {
    const source = cmapSource()

    expect(source).toContain(".map(")
    expect(source).not.toContain(".filter(")
  })
})

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
    const tuiGameSource = getExportedConstSource(
      readFileSync(tuiGameSourcePath, "utf8"),
      "nullMatrix"
    )

    expectNoAliasedRowFill(utilSource)
    expectNoAliasedRowFill(tuiGameSource)
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
