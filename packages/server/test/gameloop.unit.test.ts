import { describe, expect, it } from "@effect/vitest"
import {
  AnyCreature,
  AnyTerrain,
  conforms
} from "@flaghack/domain/schemas"
import { Effect, HashMap } from "effect"
import { readFileSync } from "node:fs"
import { getPickupItemsFor } from "../src/gameloop.js"

const readGameloopSource = (): string =>
  readFileSync(new URL("../src/gameloop.ts", import.meta.url), "utf8")

const exportedConstBody = (source: string, constName: string): string => {
  const start = source.indexOf(`export const ${constName}`)

  expect(start).toBeGreaterThanOrEqual(0)

  const nextExport = source.indexOf("\n\nexport const ", start + 1)
  const end = nextExport === -1 ? source.length : nextExport

  return source.slice(start, end)
}

describe("getPickupItemsFor", () => {
  it("returns an empty HashMap for a missing entity", () => {
    const items = Effect.runSync(getPickupItemsFor("__missing__"))

    expect(Array.from(HashMap.values(items))).toHaveLength(0)
  })

  it("excludes terrain and creatures from pickup items at the player", () => {
    const isTerrain = conforms(AnyTerrain)
    const isCreature = conforms(AnyCreature)
    const items = Effect.runSync(getPickupItemsFor("player"))
    const values = Array.from(HashMap.values(items))

    expect(values.some(isTerrain)).toBe(false)
    expect(values.some(isCreature)).toBe(false)
    expect(values.some((entity) => entity._tag === "floor")).toBe(false)
  })

  it("does not handle missing entities through NoSuchElementException catchTag", () => {
    const gameloopSource = readGameloopSource()
    const legacyCatchTag = [
      "catchTag(\"NoSuchElement",
      "Exception\""
    ].join("")

    expect(gameloopSource).not.toContain(legacyCatchTag)
  })

  it("filters inventory and pickup results through the item guard", () => {
    const gameloopSource = readGameloopSource()
    const inventoryBody = exportedConstBody(gameloopSource, "getInventory")
    const pickupBody = exportedConstBody(
      gameloopSource,
      "getPickupItemsFor"
    )

    expect(inventoryBody).toContain("filter(isItem)")
    expect(pickupBody).toContain("HashMap.filter(isItem)")
  })
})
