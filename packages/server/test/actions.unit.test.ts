import { describe, expect, it } from "@effect/vitest"
import { EAction, GameState } from "@flaghack/domain/schemas"
import { Effect, HashMap } from "effect"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { doAction } from "../src/actions.js"
import { player } from "../src/creatures.js"
import { groundFlag, waterbottle } from "../src/items.js"
import type { Entity } from "../src/world.js"

const actionsSourcePath = fileURLToPath(
  new URL("../src/actions.ts", import.meta.url)
)

const entityByKey = (gs: typeof GameState.Type, key: string) =>
  Array.from(gs.world.pipe(HashMap.values)).find((entity) =>
    entity.key === key
  )

describe("server actions", () => {
  it("does not run nested effects in action handlers", () => {
    const actionsSource = readFileSync(actionsSourcePath, "utf8")

    expect(actionsSource).not.toContain("Effect.runSync")
  })

  it("moves pickupMulti item keys into the player container", () => {
    const actor = player(2, 3, 0)
    const item = groundFlag({ x: 2, y: 3, z: 0 })
    const gs = GameState.make({
      world: HashMap.fromIterable<string, Entity>([
        [actor.key, actor],
        [item.key, item]
      ])
    })

    const next = Effect.runSync(
      doAction(gs, {
        action: EAction.pickupMulti({ keys: [item.key] }),
        entity: actor
      })
    )

    expect(entityByKey(next, item.key)?.in).toBe(actor.key)
  })

  it("moves dropMulti inventory item keys to the player's location", () => {
    const actor = player(5, 6, 0)
    const item = waterbottle(0, 0, 0, actor.key)
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
    const dropped = entityByKey(next, item.key)

    expect(dropped?.in).toBe("world")
    expect(dropped?.at).toEqual(actor.at)
  })
})
