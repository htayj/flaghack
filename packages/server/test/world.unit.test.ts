import { describe, expect, it } from "@effect/vitest"
import { Effect, HashMap } from "effect"
import { readFileSync } from "node:fs"
import { BSPGenLevel, makeBspLevel, type World } from "../src/world.js"

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

  it("uses Array.some for leaf-linking existence checks", () => {
    const worldSource = readFileSync(
      new URL("../src/world.ts", import.meta.url),
      "utf8"
    )
    const legacyFindSnippets = [
      ["!!floorsA.", "find("].join(""),
      ["!!floorsB.", "find("].join("")
    ]

    for (const snippet of legacyFindSnippets) {
      expect(worldSource).not.toContain(snippet)
    }
  })

  it("uses long-form array types in world helper signatures", () => {
    const worldSource = readFileSync(
      new URL("../src/world.ts", import.meta.url),
      "utf8"
    )
    const legacyArrayShorthandSnippets = [
      ["arr: ", "T", "[]"].join(""),
      ["number", "[]"].join("")
    ]

    for (const snippet of legacyArrayShorthandSnippets) {
      expect(worldSource).not.toContain(snippet)
    }
  })

  it("places every generated entity on the requested dungeon level", () => {
    const dlvl = 7
    const world = Effect.runSync(BSPGenLevel(777, dlvl))
    const entities = Array.from(world.pipe(HashMap.values))

    const zLevels = [...new Set(entities.map(({ at }) => at.z))].sort(
      (a, b) => a - b
    )

    expect(entities.length).toBeGreaterThan(0)
    expect(zLevels).toEqual([dlvl])
  })

  it("returns Effect values for unseeded and seeded BSP generation", () => {
    const seededLevel = BSPGenLevel(777, 0)
    const unseededLevel = makeBspLevel(0)

    expect(Effect.isEffect(seededLevel)).toBe(true)
    expect(Effect.isEffect(unseededLevel)).toBe(true)
  })

  it("generates deterministic worlds for the same seed and dungeon level", () => {
    const serialize = (world: World) =>
      Array.from(world.pipe(HashMap.values)).sort((a, b) => {
        if (a.key < b.key) return -1
        if (a.key > b.key) return 1
        return 0
      })

    const first = Effect.runSync(BSPGenLevel(4242, 3))
    const second = Effect.runSync(BSPGenLevel(4242, 3))

    expect(serialize(second)).toEqual(serialize(first))
  })

  it("keeps level generation free of pure-rand and hidden UUID keys", () => {
    const sourceUrls = [
      "../src/world.ts",
      "../src/terrain.ts",
      "../src/items.ts",
      "../src/creatures.ts"
    ] as const

    for (const sourceUrl of sourceUrls) {
      const source = readFileSync(
        new URL(sourceUrl, import.meta.url),
        "utf8"
      )

      expect(source).not.toContain("pure-rand")
      expect(source).not.toContain("randomUUID")
      expect(source).not.toContain("genKey")
    }
  })
})
