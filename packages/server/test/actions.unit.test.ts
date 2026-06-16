import { describe, expect, it } from "@effect/vitest"
import { EAction, GameState } from "@flaghack/domain/schemas"
import { Effect, HashMap } from "effect"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { doAction } from "../src/actions.js"
import { player } from "../src/creatures.js"
import { makeGroundFlag, makeWaterBottle } from "../src/items.js"
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

  it("moves pickupMulti item keys into the player container", () => {
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
})
