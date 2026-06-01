import { describe, expect, it } from "@effect/vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { genKey, nullMatrix } from "../src/util.js"

const utilSourcePath = fileURLToPath(
  new URL("../src/util.ts", import.meta.url)
)

const exportedConstSource = (name: string) => {
  const source = readFileSync(utilSourcePath, "utf8")
  const exportStart = source.indexOf(`export const ${name}`)

  expect(exportStart).toBeGreaterThanOrEqual(0)

  const sourceFromExport = source.slice(exportStart)
  const nextExportIndex = sourceFromExport.indexOf("\nexport ", 1)

  return nextExportIndex === -1
    ? sourceFromExport
    : sourceFromExport.slice(0, nextExportIndex)
}

const expectNoAliasedRowFill = (source: string) => {
  expect(source).not.toContain("rows.fill(Array")
  expect(source).not.toContain(".fill(Array<null>")
}

const legacyUndefinedAliasName = ["Undef", "Or"].join("")

const expectNoLocalUndefinedAlias = (source: string) => {
  expect(source).not.toContain(legacyUndefinedAliasName)
}

const genKeySource = () => exportedConstSource("genKey")
const nullMatrixSource = () => exportedConstSource("nullMatrix")

describe("util source hygiene", () => {
  it("does not use the local undefined union alias", () => {
    expectNoLocalUndefinedAlias(readFileSync(utilSourcePath, "utf8"))
  })
})

describe("nullMatrix", () => {
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
    expectNoAliasedRowFill(nullMatrixSource())
  })
})

describe("genKey", () => {
  it("does not use bounded Math.random entropy", () => {
    const source = genKeySource()

    expect(source).not.toContain("Math.random")
    expect(source).not.toContain("2 ** 8")
  })

  it("generates non-empty unique string keys", () => {
    const keys = Array.from({ length: 256 }, () => genKey())

    expect(keys.every((key) => typeof key === "string" && key.length > 0))
      .toBe(true)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
