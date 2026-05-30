import { describe, expect, it } from "@effect/vitest"
import { HashMap } from "effect"
import { BSPGenLevel } from "../src/world.js"

describe("BSPGenLevel", () => {
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
