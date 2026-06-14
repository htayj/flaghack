import { describe, expect, it } from "@effect/vitest"
import type { Entity as EntitySchema } from "@flaghack/domain/schemas"
import { HashMap } from "effect"
import { drawWorld } from "../src/Playing.tsx"

type Entity = typeof EntitySchema.Type

const position = { x: 1, y: 2, z: 0 }

const floor = {
  _tag: "floor",
  key: "floor-1",
  at: position,
  in: "world"
} satisfies Entity

const flag = {
  _tag: "flag",
  key: "flag-1",
  at: position,
  in: "world"
} satisfies Entity

const flagTile = {
  char: "F",
  color: "yellow",
  bright: true
}

describe("web drawWorld layering", () => {
  it("draws non-terrain over terrain regardless of world insertion order", () => {
    const worlds = [
      HashMap.fromIterable<string, Entity>([
        [floor.key, floor],
        [flag.key, flag]
      ]),
      HashMap.fromIterable<string, Entity>([
        [flag.key, flag],
        [floor.key, floor]
      ])
    ]

    for (const world of worlds) {
      expect(drawWorld(world)[2]?.[1]).toEqual(flagTile)
    }
  })
})
