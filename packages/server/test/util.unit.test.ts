import { describe, expect, it } from "@effect/vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { genKey } from "../src/util.js"

const utilSourcePath = fileURLToPath(
  new URL("../src/util.ts", import.meta.url)
)

const genKeySource = () => {
  const source = readFileSync(utilSourcePath, "utf8")
  const startIndex = source.indexOf("export const genKey")

  expect(startIndex).toBeGreaterThanOrEqual(0)

  const sourceFromGenKey = source.slice(startIndex)
  const nextExportIndex = sourceFromGenKey.indexOf("\nexport ", 1)

  return nextExportIndex === -1
    ? sourceFromGenKey
    : sourceFromGenKey.slice(0, nextExportIndex)
}

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
