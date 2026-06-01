import { describe, expect, it } from "@effect/vitest"
import { genKey, nullMatrix } from "@flaghack/web/util"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const testDir = dirname(fileURLToPath(import.meta.url))
const utilSourcePath = join(testDir, "../src/util.ts")
const playingSourcePath = join(testDir, "../src/Playing.tsx")

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

const legacyUndefinedAliasName = ["Undef", "Or"].join("")

const expectNoLocalUndefinedAlias = (source: string) => {
  expect(source).not.toContain(legacyUndefinedAliasName)
}

const withRandomUUID = (test: () => void) => {
  if (globalThis.crypto?.randomUUID !== undefined) {
    test()
    return
  }

  const hadCrypto = "crypto" in globalThis
  const originalCrypto = globalThis.crypto
  let nextId = 0

  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: {
      randomUUID: () => `test-uuid-${nextId++}`
    }
  })

  try {
    test()
  } finally {
    if (hadCrypto) {
      Object.defineProperty(globalThis, "crypto", {
        configurable: true,
        value: originalCrypto
      })
    } else {
      Reflect.deleteProperty(globalThis, "crypto")
    }
  }
}

describe("web util source hygiene", () => {
  it("does not use the local undefined union alias", () => {
    expectNoLocalUndefinedAlias(readFileSync(utilSourcePath, "utf8"))
  })
})

describe("web nullMatrix", () => {
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
    const playingSource = getExportedConstSource(
      readFileSync(playingSourcePath, "utf8"),
      "nullMatrix"
    )

    expectNoAliasedRowFill(utilSource)
    expectNoAliasedRowFill(playingSource)
  })
})

describe("web genKey", () => {
  it("keeps genKey backed by Web Crypto UUID generation", () => {
    const source = readFileSync(utilSourcePath, "utf8")
    const genKeySource = getExportedConstSource(source, "genKey")

    expect(genKeySource).toContain("crypto.randomUUID()")
    expect(genKeySource).not.toContain("Math.random")
    expect(genKeySource).not.toContain("2 ** 8")
  })

  it("returns non-empty unique string keys", () => {
    withRandomUUID(() => {
      const keys = Array.from({ length: 128 }, () => genKey())

      expect(
        keys.every((key) => typeof key === "string" && key.length > 0)
      ).toBe(true)
      expect(new Set(keys).size).toBe(keys.length)
    })
  })
})
