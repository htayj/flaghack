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

const tent = {
  _tag: "tent",
  key: "tent-1",
  at: position,
  in: "world"
} satisfies Entity

const wall = {
  _tag: "wall",
  key: "wall-1",
  at: position,
  in: "world",
  variant: "vertical"
} satisfies Entity

const player = {
  _tag: "player",
  key: "player",
  at: position,
  in: "world",
  name: "you"
} satisfies Entity

const playerAt = (x: number, y: number): Entity => ({
  _tag: "player",
  key: "player",
  at: { x, y, z: 0 },
  in: "world",
  name: "you"
})

const floorAt = (x: number, y: number): Entity => ({
  _tag: "floor",
  key: `floor-${x}-${y}`,
  at: { x, y, z: 0 },
  in: "world"
})

const flagTile = {
  char: "F",
  color: "yellow",
  bright: true
}

const tentTile = {
  char: "^",
  color: "yellow",
  bright: true
}

const wallTile = {
  char: "│",
  color: "white",
  bright: false
}

const playerTile = {
  char: "@",
  color: "white"
}

describe("web drawWorld viewport", () => {
  it("centers the enlarged campground player spawn in the visible board", () => {
    const world = HashMap.fromIterable<string, Entity>([
      ["floor-0-0", floorAt(0, 0)],
      ["floor-359-159", floorAt(359, 159)],
      ["player", playerAt(96, 120)]
    ])

    expect(drawWorld(world)[10]?.[40]).toEqual(playerTile)
  })
})

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

  it("draws tent roofs over floors and walls over roofs regardless of insertion order", () => {
    const roofOverFloorWorlds = [
      HashMap.fromIterable<string, Entity>([
        [floor.key, floor],
        [tent.key, tent]
      ]),
      HashMap.fromIterable<string, Entity>([
        [tent.key, tent],
        [floor.key, floor]
      ])
    ]
    const wallOverRoofWorlds = [
      HashMap.fromIterable<string, Entity>([
        [tent.key, tent],
        [wall.key, wall]
      ]),
      HashMap.fromIterable<string, Entity>([
        [wall.key, wall],
        [tent.key, tent]
      ])
    ]

    for (const world of roofOverFloorWorlds) {
      expect(drawWorld(world)[2]?.[1]).toEqual(tentTile)
    }
    for (const world of wallOverRoofWorlds) {
      expect(drawWorld(world)[2]?.[1]).toEqual(wallTile)
    }
  })

  it("draws creatures over items and terrain", () => {
    const world = HashMap.fromIterable<string, Entity>([
      [player.key, player],
      [flag.key, flag],
      [wall.key, wall],
      [tent.key, tent],
      [floor.key, floor]
    ])

    expect(drawWorld(world)[2]?.[1]).toEqual(playerTile)
  })
})
