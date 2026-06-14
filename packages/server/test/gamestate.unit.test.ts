import { describe, expect, it } from "@effect/vitest"
import { GameState } from "@flaghack/domain/schemas"
import { HashMap, Option } from "effect"
import { readFileSync } from "node:fs"
import { getLocationOf, updateWorld } from "../src/gamestate.js"
import { waterbottle } from "../src/items.js"
import type { Entity } from "../src/world.js"

describe("updateWorld", () => {
  it("returns a GameState using the transformed world", () => {
    const item = waterbottle(1, 2, 3, "world")
    const replacement = { ...item, at: { x: 7, y: 8, z: 0 } }
    const initialWorld = HashMap.fromIterable<string, Entity>([
      [item.key, item]
    ])
    const transformedWorld = HashMap.fromIterable<string, Entity>([
      [replacement.key, replacement]
    ])
    const state = GameState.make({ world: initialWorld })

    const next = updateWorld(state)(() => transformedWorld)

    expect(next.world).toStrictEqual(transformedWorld)
    expect(Array.from(next.world.pipe(HashMap.values))).toEqual([
      replacement
    ])
  })

  it("does not contain stale fixme comments", () => {
    const gamestateSource = readFileSync(
      new URL("../src/gamestate.ts", import.meta.url),
      "utf8"
    )

    expect(gamestateSource.toLowerCase()).not.toContain("fixme")
  })
})

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
