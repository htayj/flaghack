import { describe, expect, it } from "@effect/vitest"
import { Option } from "effect"
import { readFileSync } from "node:fs"
import { getLocationOf } from "../src/gamestate.js"
import { waterbottle } from "../src/items.js"

describe("getLocationOf", () => {
  it("returns Some containing the position for a world entity", () => {
    const entity = waterbottle(1, 2, 3, "world")

    const location = getLocationOf(entity)

    expect(Option.isSome(location)).toBe(true)
    if (Option.isSome(location)) {
      expect(location.value).toEqual({ x: 1, y: 2, z: 3 })
    }
  })

  it("returns None for a contained entity", () => {
    const entity = waterbottle(1, 2, 3, "player")

    expect(Option.isNone(getLocationOf(entity))).toBe(true)
  })

  it("does not use the legacy boolean sentinel expression", () => {
    const gamestateSource = readFileSync(
      new URL("../src/gamestate.ts", import.meta.url),
      "utf8"
    )
    const legacyBooleanSentinel = [
      "e.in === \"world\" ",
      "&& e.at"
    ].join("")

    expect(gamestateSource).not.toContain(legacyBooleanSentinel)
  })
})
