import { describe, expect, it } from "@effect/vitest"
import { HashMap } from "effect"
import { makeGroundFlag } from "../src/items.js"
import { collideP } from "../src/position.js"
import { type Entity, itemsAt } from "../src/world.js"

describe("structural position equality", () => {
  it("treats matching x/y with different z as distinct", () => {
    expect(collideP({ x: 1, y: 2, z: 0 })({ x: 1, y: 2, z: 1 })).toBe(
      false
    )
  })

  it("finds items at a fresh coordinate object with the same x/y/z", () => {
    const item = makeGroundFlag("flag-1", { x: 1, y: 2, z: 3 })
    const world = HashMap.fromIterable<string, Entity>([[item.key, item]])

    const found = Array.from(
      itemsAt(world)({ x: 1, y: 2, z: 3 }).pipe(HashMap.values)
    )

    expect(found.map(({ key }) => key)).toEqual([item.key])
  })
})
