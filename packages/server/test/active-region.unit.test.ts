import { describe, expect, it } from "@effect/vitest"
import { balancedAttributes } from "@flaghack/domain/stats"
import { HashMap } from "effect"
import {
  cachedCampgroundActiveRegionForWorld,
  campgroundActiveRegionForWorld,
  entityWithinBounds,
  filterWorldToBounds
} from "../src/activeRegion.js"
import { player } from "../src/creatures.js"
import { type Entity, isItem, type World } from "../src/world.js"

const floorAt = (key: string, x: number, y: number, z = 0): Entity => ({
  _tag: "floor",
  at: { x, y, z },
  in: "world",
  key
})

const hippieAt = (key: string, x: number, y: number, z = 0): Entity => ({
  _tag: "hippie",
  at: { x, y, z },
  attributes: balancedAttributes,
  in: "world",
  key,
  name: key
})

const flagAt = (
  key: string,
  x: number,
  y: number,
  owner: string
): Entity => ({
  _tag: "flag",
  at: { x, y, z: 0 },
  in: owner,
  key
})

const tentWallAt = (key: string, x: number, y: number): Entity => ({
  _tag: "tent-wall",
  at: { x, y, z: 0 },
  in: "world",
  key,
  variant: "vertical"
})

const tentPostAt = (key: string, x: number, y: number): Entity => ({
  _tag: "tent-post",
  at: { x, y, z: 0 },
  in: "world",
  key
})

const worldFrom = (entities: ReadonlyArray<Entity>): World =>
  HashMap.fromIterable(entities.map((entity) => [entity.key, entity]))

describe("campground active region", () => {
  it("mirrors the 80x20 viewport with a five-tile actor margin", () => {
    const actor = player(96, 120, 0)
    const nearLeft = hippieAt("near-left", 51, 105)
    const nearRight = hippieAt("near-right", 140, 134)
    const collisionOnly = hippieAt("collision-only", 50, 104)
    const far = hippieAt("far", 50, 103)
    const otherLevel = hippieAt("other-level", 96, 120, 1)
    const heldItem = flagAt("held-flag", 96, 120, actor.key)
    const heldItemMapKey = "held-flag-map-entry"
    const world = worldFrom([
      floorAt("extent-0", 0, 0),
      floorAt("extent-max", 359, 159),
      actor,
      nearLeft,
      nearRight,
      collisionOnly,
      far,
      otherLevel
    ]).pipe(HashMap.set(heldItemMapKey, heldItem))

    const region = campgroundActiveRegionForWorld(world, actor)

    expect(region).toBeDefined()
    if (region === undefined) return
    expect(region.viewport).toEqual({
      bottomExclusive: 130,
      left: 56,
      rightExclusive: 136,
      top: 110,
      z: 0
    })
    expect(region.actorBounds).toEqual({
      bottomExclusive: 135,
      left: 51,
      rightExclusive: 141,
      top: 105,
      z: 0
    })
    expect(region.collisionBounds).toEqual({
      bottomExclusive: 136,
      left: 50,
      rightExclusive: 142,
      top: 104,
      z: 0
    })

    expect(entityWithinBounds(region.actorBounds)(nearLeft)).toBe(true)
    expect(entityWithinBounds(region.actorBounds)(nearRight)).toBe(true)
    expect(entityWithinBounds(region.actorBounds)(collisionOnly)).toBe(
      false
    )
    expect(entityWithinBounds(region.collisionBounds)(collisionOnly)).toBe(
      true
    )
    expect(entityWithinBounds(region.collisionBounds)(far)).toBe(false)

    const actorWorldKeys = new Set(
      Array.from(HashMap.values(region.actorWorld)).map((entity) =>
        entity.key
      )
    )
    expect(actorWorldKeys.has(nearLeft.key)).toBe(true)
    expect(actorWorldKeys.has(nearRight.key)).toBe(true)
    expect(actorWorldKeys.has(collisionOnly.key)).toBe(false)
    expect(actorWorldKeys.has(far.key)).toBe(false)
    expect(actorWorldKeys.has(otherLevel.key)).toBe(false)
    expect(actorWorldKeys.has(heldItem.key)).toBe(false)
    expect(region.offscreenCreatures.map(({ key }) => key)).toEqual([
      far.key
    ])
    const expectedPlayerInventory = world.pipe(
      HashMap.filter(isItem),
      HashMap.filter((entity) => entity.in === actor.key)
    )
    expect(region.playerInventory).toEqual(expectedPlayerInventory)
    expect(HashMap.has(region.playerInventory, heldItemMapKey)).toBe(true)

    const viewportWorldKeys = new Set(
      Array.from(HashMap.values(region.viewportWorld)).map((entity) =>
        entity.key
      )
    )
    expect(viewportWorldKeys.has(actor.key)).toBe(true)
    expect(viewportWorldKeys.has(nearLeft.key)).toBe(false)
    expect(viewportWorldKeys.has(nearRight.key)).toBe(false)
    expect(viewportWorldKeys.has(collisionOnly.key)).toBe(false)
    expect(viewportWorldKeys.has(far.key)).toBe(false)
    expect(viewportWorldKeys.has(otherLevel.key)).toBe(false)
    expect(viewportWorldKeys.has(heldItem.key)).toBe(false)
    expect(region.viewportWorld).toEqual(
      filterWorldToBounds(world, region.viewport)
    )
  })

  it("reuses bounded projections for the same immutable world", () => {
    const actor = player(96, 120, 0)
    const world = worldFrom([
      floorAt("extent-0", 0, 0),
      floorAt("extent-max", 359, 159),
      actor
    ])

    const first = cachedCampgroundActiveRegionForWorld(world, actor)
    const repeated = cachedCampgroundActiveRegionForWorld(world, actor)
    const changedWorld = world.pipe(
      HashMap.set("visible-floor", floorAt("visible-floor", 96, 121))
    )
    const changed = cachedCampgroundActiveRegionForWorld(
      changedWorld,
      actor
    )

    expect(first).toBeDefined()
    expect(repeated).toBe(first)
    expect(changed).toBeDefined()
    expect(changed).not.toBe(first)
    expect(
      changed === undefined
        ? undefined
        : HashMap.has(changed.viewportWorld, "visible-floor")
    ).toBe(true)
  })

  it("keeps tent walls and posts in bounded collision worlds", () => {
    const actor = player(96, 120, 0)
    const wall = tentWallAt("tent-wall-1", 96, 119)
    const post = tentPostAt("tent-post-1", 97, 120)
    const world = worldFrom([
      floorAt("extent-0", 0, 0),
      floorAt("extent-max", 359, 159),
      actor,
      wall,
      post
    ])

    const region = campgroundActiveRegionForWorld(world, actor)

    expect(region).toBeDefined()
    if (region === undefined) return
    const collisionWorldKeys = new Set(
      Array.from(HashMap.values(region.collisionWorld)).map((entity) =>
        entity.key
      )
    )
    expect(collisionWorldKeys.has(wall.key)).toBe(true)
    expect(collisionWorldKeys.has(post.key)).toBe(true)
  })

  it("does not activate on smaller non-campground worlds", () => {
    const actor = player(10, 10, 0)
    const world = worldFrom([
      floorAt("extent-0", 0, 0),
      floorAt("extent-small", 79, 19),
      actor
    ])

    expect(campgroundActiveRegionForWorld(world, actor)).toBeUndefined()
  })
})
