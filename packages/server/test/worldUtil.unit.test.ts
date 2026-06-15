import { describe, expect, it } from "@effect/vitest"
import { HashMap } from "effect"
import { readFileSync } from "node:fs"
import { makeFloor, makeWall } from "../src/terrain.js"
import type { Entity } from "../src/world.js"
import { dijkstraPath } from "../src/worldUtil.js"

const worldFrom = (entities: ReadonlyArray<Entity>) =>
  HashMap.fromIterable(entities.map((entity) => [entity.key, entity]))

const unitCost = () => 1
const terrainCost = (entity: Entity) => entity._tag === "wall" ? 100 : 1
const entityKeys = (entities: ReadonlyArray<Entity>) =>
  entities.map(({ key }) => key)

describe("dijkstraPath", () => {
  it("does not mutate Dijkstra records or reconstruct paths with push", () => {
    const worldUtilSource = readFileSync(
      new URL("../src/worldUtil.ts", import.meta.url),
      "utf8"
    )

    expect(worldUtilSource).not.toMatch(/\.dist\s*=/)
    expect(worldUtilSource).not.toContain("let curr")
    expect(worldUtilSource).not.toContain("let path")
    expect(worldUtilSource).not.toContain(".push(")
  })

  it("reaches a diagonal neighbor only when diagonals are allowed", () => {
    const start = makeFloor("start", 0, 0, 0)
    const end = makeFloor("end", 1, 1, 0)
    const world = worldFrom([start, end])

    expect(
      entityKeys(dijkstraPath(start.at, end.at, unitCost, world, false))
    )
      .toEqual([start.key])
    expect(
      entityKeys(dijkstraPath(start.at, end.at, unitCost, world, true))
    )
      .toEqual([])
  })

  it("returns reverse backtrack entities excluding end and including start", () => {
    const start = makeFloor("start", 0, 0, 0)
    const wallCandidate = makeWall("wall-candidate", 1, 0, 0)
    const end = makeFloor("end", 2, 0, 0)
    const world = worldFrom([start, wallCandidate, end])
    const path = dijkstraPath(start.at, end.at, unitCost, world, true)

    expect(entityKeys(path)).toEqual([wallCandidate.key, start.key])
    expect(entityKeys(path.filter((entity) => entity._tag === "wall")))
      .toEqual([wallCandidate.key])
  })

  it("returns an empty path for missing or unreachable endpoints", () => {
    const start = makeFloor("start", 0, 0, 0)
    const unreachableEnd = makeFloor("unreachable-end", 3, 0, 0)
    const world = worldFrom([start, unreachableEnd])

    expect(
      dijkstraPath(start.at, { x: 1, y: 0, z: 0 }, unitCost, world, true)
    ).toEqual([])
    expect(
      dijkstraPath(start.at, unreachableEnd.at, unitCost, world, true)
    )
      .toEqual([])
  })

  it("prefers a longer floor-only route over a shorter high-cost wall route", () => {
    const start = makeFloor("start", 0, 0, 0)
    const directWall = makeWall("direct-wall", 1, 0, 0)
    const end = makeFloor("end", 2, 0, 0)
    const detourA = makeFloor("detour-a", 0, 1, 0)
    const detourB = makeFloor("detour-b", 1, 1, 0)
    const detourC = makeFloor("detour-c", 2, 1, 0)
    const world = worldFrom([
      start,
      directWall,
      end,
      detourA,
      detourB,
      detourC
    ])

    const path = dijkstraPath(start.at, end.at, terrainCost, world, true)

    expect(entityKeys(path)).toEqual([
      detourC.key,
      detourB.key,
      detourA.key,
      start.key
    ])
    expect(path.filter((entity) => entity._tag === "wall")).toEqual([])
  })
})
