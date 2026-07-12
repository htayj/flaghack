import { describe, expect, it } from "@effect/vitest"
import type { Entity as EntitySchema } from "@flaghack/domain/schemas"
import { balancedAttributes } from "@flaghack/domain/stats"
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

const tentWall = {
  _tag: "tent-wall",
  key: "tent-wall-1",
  at: position,
  in: "world",
  variant: "vertical"
} satisfies Entity

const tentPost = {
  _tag: "tent-post",
  key: "tent-post-1",
  at: position,
  in: "world"
} satisfies Entity

const closedDoor = {
  _tag: "door",
  key: "door-closed-1",
  at: position,
  in: "world",
  open: false,
  variant: "vertical"
} satisfies Entity

const openDoor = {
  ...closedDoor,
  key: "door-open-1",
  open: true
} satisfies Entity

const player = {
  _tag: "player",
  key: "player",
  at: position,
  attributes: balancedAttributes,
  in: "world",
  name: "you"
} satisfies Entity

const playerAt = (x: number, y: number): Entity => ({
  _tag: "player",
  key: "player",
  at: { x, y, z: 0 },
  attributes: balancedAttributes,
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

const floorTile = {
  char: "·",
  color: "black",
  bright: true
}

const wallTile = {
  char: "│",
  color: "white",
  bright: false
}

const tentWallTile = {
  char: "│",
  color: "yellow",
  bright: false
}

const tentPostTile = {
  char: "┼",
  color: "yellow",
  bright: false
}

const closedDoorTile = {
  char: "│",
  color: "yellow",
  bright: false
}

const openDoorTile = {
  char: "+",
  color: "yellow",
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

  it("draws floor inside tents and tent blockers over tent terrain regardless of insertion order", () => {
    const floorUnderTentWorlds = [
      HashMap.fromIterable<string, Entity>([
        [floor.key, floor],
        [tent.key, tent]
      ]),
      HashMap.fromIterable<string, Entity>([
        [tent.key, tent],
        [floor.key, floor]
      ])
    ]
    const tentBlockerWorlds = [
      {
        tile: wallTile,
        worlds: [
          HashMap.fromIterable<string, Entity>([
            [tent.key, tent],
            [wall.key, wall]
          ]),
          HashMap.fromIterable<string, Entity>([
            [wall.key, wall],
            [tent.key, tent]
          ])
        ]
      },
      {
        tile: tentWallTile,
        worlds: [
          HashMap.fromIterable<string, Entity>([
            [tent.key, tent],
            [tentWall.key, tentWall]
          ]),
          HashMap.fromIterable<string, Entity>([
            [tentWall.key, tentWall],
            [tent.key, tent]
          ])
        ]
      },
      {
        tile: tentPostTile,
        worlds: [
          HashMap.fromIterable<string, Entity>([
            [tent.key, tent],
            [tentPost.key, tentPost]
          ]),
          HashMap.fromIterable<string, Entity>([
            [tentPost.key, tentPost],
            [tent.key, tent]
          ])
        ]
      }
    ]

    for (const world of floorUnderTentWorlds) {
      expect(drawWorld(world)[2]?.[1]).toEqual(floorTile)
    }
    for (const { tile, worlds } of tentBlockerWorlds) {
      for (const world of worlds) {
        expect(drawWorld(world)[2]?.[1]).toEqual(tile)
      }
    }
  })

  it("draws closed doors as dark-yellow walls and open doors as dark-yellow plus signs", () => {
    expect(
      drawWorld(
        HashMap.fromIterable<string, Entity>([[
          closedDoor.key,
          closedDoor
        ]])
      )[2]
        ?.[1]
    ).toEqual(closedDoorTile)
    expect(
      drawWorld(
        HashMap.fromIterable<string, Entity>([[openDoor.key, openDoor]])
      )[2]
        ?.[1]
    ).toEqual(openDoorTile)
  })

  it("draws creatures over items and terrain", () => {
    const world = HashMap.fromIterable<string, Entity>([
      [player.key, player],
      [flag.key, flag],
      [wall.key, wall],
      [tentWall.key, tentWall],
      [tentPost.key, tentPost],
      [tent.key, tent],
      [floor.key, floor]
    ])

    expect(drawWorld(world)[2]?.[1]).toEqual(playerTile)
  })
})
