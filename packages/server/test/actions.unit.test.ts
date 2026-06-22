import { describe, expect, it } from "@effect/vitest"
import { EAction, GameState } from "@flaghack/domain/schemas"
import { Effect, HashMap } from "effect"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { doAction } from "../src/actions.js"
import { makeHippie, player } from "../src/creatures.js"
import {
  makeBeer,
  makeCooler,
  makeGroundFlag,
  makeHotdog,
  makeWaterBottle
} from "../src/items.js"
import type { Entity } from "../src/world.js"

const actionsSourcePath = fileURLToPath(
  new URL("../src/actions.ts", import.meta.url)
)

const entityByKey = (gs: typeof GameState.Type, key: string) =>
  Array.from(gs.world.pipe(HashMap.values)).find((entity) =>
    entity.key === key
  )

const floorAt = (key: string, x: number, y: number): Entity => ({
  _tag: "floor",
  at: { x, y, z: 0 },
  in: "world",
  key
})

const campgroundMarkerAt = (
  tag: "tent" | "sign" | "effigy" | "temple"
): Entity => ({
  _tag: tag,
  at: { x: 1, y: 0, z: 0 },
  in: "world",
  key: `${tag}-1`,
  ...(tag === "sign" ? { name: "Camp Functional" } : {})
} as Entity)

const tentBlockerAt = (tag: "tent-wall" | "tent-post"): Entity => ({
  _tag: tag,
  at: { x: 1, y: 0, z: 0 },
  in: "world",
  key: `${tag}-1`,
  ...(tag === "tent-wall" ? { variant: "vertical" as const } : {})
} as Entity)

const doorAt = (
  key: string,
  x: number,
  y: number,
  open: boolean
): Entity => ({
  _tag: "door",
  at: { x, y, z: 0 },
  in: "world",
  key,
  open,
  variant: "vertical"
})

describe("server actions", () => {
  it("does not run nested effects in action handlers", () => {
    const actionsSource = readFileSync(actionsSourcePath, "utf8")

    expect(actionsSource).not.toContain("Effect.runSync")
  })

  it("does not keep stale full-entity pickup action handlers", () => {
    const actionsSource = readFileSync(actionsSourcePath, "utf8")

    for (
      const stalePattern of [
        "const pickupItem =",
        "pickup: ({ object })",
        "some(object)"
      ]
    ) {
      expect(actionsSource).not.toContain(stalePattern)
    }
  })

  it("moves pickupMulti floor item keys into the player container", () => {
    const actor = player(2, 3, 0)
    const item = makeGroundFlag("flag-1", { x: 2, y: 3, z: 0 })
    const secondItem = makeWaterBottle("water-1", 2, 3, 0)
    const gs = GameState.make({
      world: HashMap.fromIterable<string, Entity>([
        [actor.key, actor],
        [item.key, item],
        [secondItem.key, secondItem]
      ])
    })

    const next = Effect.runSync(
      doAction(gs, {
        action: EAction.pickupMulti({ keys: [item.key, secondItem.key] }),
        entity: actor
      })
    )

    expect(entityByKey(next, item.key)?.in).toBe(actor.key)
    expect(entityByKey(next, secondItem.key)?.in).toBe(actor.key)
  })

  it("does not let pickupMulti take contained items from a floor container", () => {
    const actor = player(2, 3, 0)
    const cooler = makeCooler("cooler-1", 2, 3, 0)
    const beer = makeBeer("beer-1", 2, 3, 0, cooler.key)
    const gs = GameState.make({
      world: HashMap.fromIterable<string, Entity>([
        [actor.key, actor],
        [cooler.key, cooler],
        [beer.key, beer]
      ])
    })

    const next = Effect.runSync(
      doAction(gs, {
        action: EAction.pickupMulti({ keys: [beer.key] }),
        entity: actor
      })
    )

    expect(entityByKey(next, beer.key)?.in).toBe(cooler.key)
  })

  it("blocks movement into ungenerated void outside terrain bounds", () => {
    const actor = player(0, 0, 0)
    const gs = GameState.make({
      world: HashMap.fromIterable<string, Entity>([
        [actor.key, actor],
        ["floor-0", floorAt("floor-0", 0, 0)]
      ])
    })

    const next = Effect.runSync(
      doAction(gs, {
        action: EAction.move({ dir: "W" }),
        entity: actor
      })
    )

    expect(entityByKey(next, actor.key)?.at).toEqual(actor.at)
  })

  it("can use a bounded movement world for collision while preserving full state", () => {
    const actor = player(0, 0, 0)
    const farItem = makeGroundFlag("flag-far", { x: 100, y: 100, z: 0 })
    const gs = GameState.make({
      world: HashMap.fromIterable<string, Entity>([
        [actor.key, actor],
        [farItem.key, farItem]
      ])
    })
    const movementWorld = HashMap.fromIterable<string, Entity>([
      [actor.key, actor],
      ["floor-1", floorAt("floor-1", 1, 0)]
    ])

    const next = Effect.runSync(
      doAction(gs, {
        action: EAction.move({ dir: "E" }),
        entity: actor
      }, { movementWorld })
    )

    expect(entityByKey(next, actor.key)?.at).toEqual({
      x: 1,
      y: 0,
      z: 0
    })
    expect(entityByKey(next, farItem.key)).toEqual(farItem)
  })

  it("allows movement onto passable campground marker terrain", () => {
    for (const tag of ["tent", "sign", "effigy", "temple"] as const) {
      const actor = player(0, 0, 0)
      const marker = campgroundMarkerAt(tag)
      const gs = GameState.make({
        world: HashMap.fromIterable<string, Entity>([
          [actor.key, actor],
          ["floor-0", floorAt("floor-0", 0, 0)],
          [marker.key, marker]
        ])
      })

      const next = Effect.runSync(
        doAction(gs, {
          action: EAction.move({ dir: "E" }),
          entity: actor
        })
      )

      expect(entityByKey(next, actor.key)?.at).toEqual(marker.at)
    }
  })

  it("auto-opens a closed adjacent door when moving into it, then moves through the open door", () => {
    const actor = player(0, 0, 0)
    const door = doorAt("door-1", 1, 0, false)
    const gs = GameState.make({
      world: HashMap.fromIterable<string, Entity>([
        [actor.key, actor],
        ["floor-0", floorAt("floor-0", 0, 0)],
        ["floor-1", floorAt("floor-1", 1, 0)],
        [door.key, door]
      ])
    })

    const afterOpen = Effect.runSync(
      doAction(gs, {
        action: EAction.move({ dir: "E" }),
        entity: actor
      })
    )
    const openedDoor = entityByKey(afterOpen, door.key)
    const afterMove = Effect.runSync(
      doAction(afterOpen, {
        action: EAction.move({ dir: "E" }),
        entity: entityByKey(afterOpen, actor.key) ?? actor
      })
    )

    expect(entityByKey(afterOpen, actor.key)?.at).toEqual(actor.at)
    expect(openedDoor?._tag === "door" ? openedDoor.open : false).toBe(
      true
    )
    expect(entityByKey(afterMove, actor.key)?.at).toEqual(door.at)
  })

  it("opens and closes adjacent doors with explicit direction actions", () => {
    const actor = player(0, 0, 0)
    const door = doorAt("door-1", 1, 0, false)
    const gs = GameState.make({
      world: HashMap.fromIterable<string, Entity>([
        [actor.key, actor],
        ["floor-0", floorAt("floor-0", 0, 0)],
        ["floor-1", floorAt("floor-1", 1, 0)],
        [door.key, door]
      ])
    })

    const afterOpen = Effect.runSync(
      doAction(gs, {
        action: EAction.open({ dir: "E" }),
        entity: actor
      })
    )
    const afterClose = Effect.runSync(
      doAction(afterOpen, {
        action: EAction.close({ dir: "E" }),
        entity: entityByKey(afterOpen, actor.key) ?? actor
      })
    )
    const openedDoor = entityByKey(afterOpen, door.key)
    const closedDoor = entityByKey(afterClose, door.key)

    expect(openedDoor?._tag === "door" ? openedDoor.open : false).toBe(
      true
    )
    expect(closedDoor?._tag === "door" ? closedDoor.open : true).toBe(
      false
    )
  })

  it("does not close an open door occupied by a creature", () => {
    const actor = player(0, 0, 0)
    const door = doorAt("door-1", 1, 0, true)
    const blocker = makeHippie("hippie-on-door", 1, 0, 0)
    const gs = GameState.make({
      world: HashMap.fromIterable<string, Entity>([
        [actor.key, actor],
        [blocker.key, blocker],
        ["floor-0", floorAt("floor-0", 0, 0)],
        ["floor-1", floorAt("floor-1", 1, 0)],
        [door.key, door]
      ])
    })

    const afterClose = Effect.runSync(
      doAction(gs, {
        action: EAction.close({ dir: "E" }),
        entity: actor
      })
    )
    const maybeDoor = entityByKey(afterClose, door.key)

    expect(maybeDoor?._tag === "door" ? maybeDoor.open : false).toBe(
      true
    )
  })

  it("blocks movement into tent wall and post terrain", () => {
    for (const tag of ["tent-wall", "tent-post"] as const) {
      const actor = player(0, 0, 0)
      const blocker = tentBlockerAt(tag)
      const gs = GameState.make({
        world: HashMap.fromIterable<string, Entity>([
          [actor.key, actor],
          ["floor-0", floorAt("floor-0", 0, 0)],
          ["floor-1", floorAt("floor-1", 1, 0)],
          [blocker.key, blocker]
        ])
      })

      const next = Effect.runSync(
        doAction(gs, {
          action: EAction.move({ dir: "E" }),
          entity: actor
        })
      )

      expect(entityByKey(next, actor.key)?.at).toEqual(actor.at)
    }
  })

  it("moves dropMulti inventory item keys to the player's location", () => {
    const actor = player(5, 6, 0)
    const item = makeWaterBottle("water-1", 0, 0, 0, actor.key)
    const secondItem = makeWaterBottle("water-2", 1, 1, 0, actor.key)
    const gs = GameState.make({
      world: HashMap.fromIterable<string, Entity>([
        [actor.key, actor],
        [item.key, item],
        [secondItem.key, secondItem]
      ])
    })

    const next = Effect.runSync(
      doAction(gs, {
        action: EAction.dropMulti({ keys: [item.key, secondItem.key] }),
        entity: actor
      })
    )
    const dropped = entityByKey(next, item.key)
    const secondDropped = entityByKey(next, secondItem.key)

    expect(dropped?.in).toBe("world")
    expect(dropped?.at).toEqual(actor.at)
    expect(secondDropped?.in).toBe("world")
    expect(secondDropped?.at).toEqual(actor.at)
  })

  it("does not let dropMulti move items that are not in the player's inventory", () => {
    const actor = player(5, 6, 0)
    const item = makeWaterBottle("water-1", 5, 6, 0, "world")
    const gs = GameState.make({
      world: HashMap.fromIterable<string, Entity>([
        [actor.key, actor],
        [item.key, item]
      ])
    })

    const next = Effect.runSync(
      doAction(gs, {
        action: EAction.dropMulti({ keys: [item.key] }),
        entity: actor
      })
    )

    expect(entityByKey(next, item.key)?.in).toBe("world")
    expect(entityByKey(next, item.key)?.at).toEqual(item.at)
  })

  it("eats only selected held food items", () => {
    const actor = player(5, 6, 0)
    const hotdog = makeHotdog("hotdog-1", 0, 0, 0, actor.key)
    const beer = makeBeer("beer-1", 0, 0, 0, actor.key)
    const flag = makeGroundFlag("flag-1", { x: 0, y: 0, z: 0 })
    const floorHotdog = makeHotdog("hotdog-floor", 5, 6, 0, "world")
    const gs = GameState.make({
      world: HashMap.fromIterable<string, Entity>([
        [actor.key, actor],
        [hotdog.key, hotdog],
        [beer.key, beer],
        [flag.key, flag],
        [floorHotdog.key, floorHotdog]
      ])
    })

    const next = Effect.runSync(
      doAction(gs, {
        action: EAction.eatMulti({
          keys: [hotdog.key, beer.key, flag.key, floorHotdog.key]
        }),
        entity: actor
      })
    )

    expect(entityByKey(next, hotdog.key)).toBeUndefined()
    expect(entityByKey(next, beer.key)?.in).toBe(actor.key)
    expect(entityByKey(next, flag.key)?.in).toBe("world")
    expect(entityByKey(next, floorHotdog.key)?.in).toBe("world")
  })

  it("quaffs only selected held drink items", () => {
    const actor = player(5, 6, 0)
    const water = makeWaterBottle("water-1", 0, 0, 0, actor.key)
    const beer = makeBeer("beer-1", 0, 0, 0, actor.key)
    const hotdog = makeHotdog("hotdog-1", 0, 0, 0, actor.key)
    const floorBeer = makeBeer("beer-floor", 5, 6, 0, "world")
    const gs = GameState.make({
      world: HashMap.fromIterable<string, Entity>([
        [actor.key, actor],
        [water.key, water],
        [beer.key, beer],
        [hotdog.key, hotdog],
        [floorBeer.key, floorBeer]
      ])
    })

    const next = Effect.runSync(
      doAction(gs, {
        action: EAction.quaffMulti({
          keys: [water.key, beer.key, hotdog.key, floorBeer.key]
        }),
        entity: actor
      })
    )

    expect(entityByKey(next, water.key)).toBeUndefined()
    expect(entityByKey(next, beer.key)).toBeUndefined()
    expect(entityByKey(next, hotdog.key)?.in).toBe(actor.key)
    expect(entityByKey(next, floorBeer.key)?.in).toBe("world")
  })

  it("loots items out of and into an accessible floor container", () => {
    const actor = player(2, 3, 0)
    const cooler = makeCooler("cooler-1", 2, 3, 0)
    const beer = makeBeer("beer-1", 2, 3, 0, cooler.key)
    const water = makeWaterBottle("water-1", 0, 0, 0, actor.key)
    const gs = GameState.make({
      world: HashMap.fromIterable<string, Entity>([
        [actor.key, actor],
        [cooler.key, cooler],
        [beer.key, beer],
        [water.key, water]
      ])
    })

    const afterTake = Effect.runSync(
      doAction(gs, {
        action: EAction.lootTakeMulti({
          containerKey: cooler.key,
          keys: [beer.key]
        }),
        entity: actor
      })
    )
    const afterPut = Effect.runSync(
      doAction(afterTake, {
        action: EAction.lootPutMulti({
          containerKey: cooler.key,
          keys: [water.key]
        }),
        entity: actor
      })
    )

    expect(entityByKey(afterTake, beer.key)?.in).toBe(actor.key)
    expect(entityByKey(afterPut, water.key)?.in).toBe(cooler.key)
    expect(entityByKey(afterPut, water.key)?.at).toEqual(cooler.at)
  })

  it("ignores loot actions for containers that are not on the actor's floor tile", () => {
    const actor = player(2, 3, 0)
    const cooler = makeCooler("cooler-1", 4, 3, 0)
    const beer = makeBeer("beer-1", 4, 3, 0, cooler.key)
    const gs = GameState.make({
      world: HashMap.fromIterable<string, Entity>([
        [actor.key, actor],
        [cooler.key, cooler],
        [beer.key, beer]
      ])
    })

    const next = Effect.runSync(
      doAction(gs, {
        action: EAction.lootTakeMulti({
          containerKey: cooler.key,
          keys: [beer.key]
        }),
        entity: actor
      })
    )

    expect(entityByKey(next, beer.key)?.in).toBe(cooler.key)
  })
})
