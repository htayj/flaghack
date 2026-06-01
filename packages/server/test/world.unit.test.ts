import { describe, expect, it } from "@effect/vitest"
import { HashMap } from "effect"
import { readFileSync } from "node:fs"
import { BSPGenLevel } from "../src/world.js"

describe("BSPGenLevel", () => {
  it("does not use a tuple assertion in randBool", () => {
    const worldSource = readFileSync(
      new URL("../src/world.ts", import.meta.url),
      "utf8"
    )
    const legacyTupleAssertion = [
      "as [boolean,",
      " prand.RandomGenerator]"
    ].join("")

    expect(worldSource).not.toContain(legacyTupleAssertion)
  })

  it("uses checked indexing in leaf linking", () => {
    const worldSource = readFileSync(
      new URL("../src/world.ts", import.meta.url),
      "utf8"
    )
    const legacyIndexingSnippets = [
      "floorsB[0]",
      "yIntersect.toArray()[i]",
      "xIntersect.toArray()[i]",
      "floorsA[ia]",
      "floorsB[ib]"
    ]

    for (const snippet of legacyIndexingSnippets) {
      expect(worldSource).not.toContain(snippet)
    }
  })

  it("places every generated entity on the requested dungeon level", () => {
    const dlvl = 7
    const world = BSPGenLevel(777, dlvl)
    const entities = Array.from(world.pipe(HashMap.values))

    const zLevels = [...new Set(entities.map(({ at }) => at.z))].sort(
      (a, b) => a - b
    )

    expect(entities.length).toBeGreaterThan(0)
    expect(zLevels).toEqual([dlvl])
  })
})
