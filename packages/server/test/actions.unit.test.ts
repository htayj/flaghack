import { describe, expect, it } from "@effect/vitest"
import { EAction, GameState } from "@flaghack/domain/schemas"
import { Effect, HashMap } from "effect"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { doAction } from "../src/actions.js"
import { player } from "../src/creatures.js"
import {
  makeBeer,
  makeCooler,
  makeGroundFlag,
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
