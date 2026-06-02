import { describe, expect, it } from "@effect/vitest"
import {
  AnyCreature,
  AnyTerrain,
  conforms
} from "@flaghack/domain/schemas"
import { Effect, HashMap, Option } from "effect"
import { readFileSync } from "node:fs"
import { eGetWorld, getPickupItemsFor } from "../src/gameloop.js"

const readGameloopSource = (): string =>
  readFileSync(new URL("../src/gameloop.ts", import.meta.url), "utf8")

const exportedConstBody = (source: string, constName: string): string => {
  const start = source.indexOf(`export const ${constName}`)

  expect(start).toBeGreaterThanOrEqual(0)

  const nextExport = source.indexOf("\n\nexport const ", start + 1)
  const end = nextExport === -1 ? source.length : nextExport

  return source.slice(start, end)
}

const initialSpawnSetupSource = (source: string): string => {
  const start = source.indexOf("const testLevel")

  expect(start).toBeGreaterThanOrEqual(0)

  const end = source.indexOf("const testPlayer", start)

  expect(end).toBeGreaterThan(start)

  return source.slice(start, end)
}

describe("initial world", () => {
  it("places the player on a generated floor tile", () => {
    const world = Effect.runSync(eGetWorld)
    const playerEntityOption = world.pipe(HashMap.get("player"))

    expect(Option.isSome(playerEntityOption)).toBe(true)
    if (Option.isNone(playerEntityOption)) return

    const playerEntity = playerEntityOption.value

    expect(playerEntity._tag).toBe("player")
    if (playerEntity._tag !== "player") return

    const floorAtPlayer = Array.from(HashMap.values(world)).find(
      (entity) =>
        entity._tag === "floor"
        && entity.at.x === playerEntity.at.x
        && entity.at.y === playerEntity.at.y
        && entity.at.z === playerEntity.at.z
    )

    expect(floorAtPlayer?._tag).toBe("floor")
  })

  it("does not fall back to the origin when selecting the player spawn", () => {
    const gameloopSource = readGameloopSource()
    const initialSpawnSetup = initialSpawnSetupSource(gameloopSource)

    expect(initialSpawnSetup).not.toContain("testLevelFloors.first()?.at")
    expect(initialSpawnSetup).not.toContain("{ x: 0, y: 0, z: 0 }")
    expect(initialSpawnSetup).not.toMatch(
      /(?:\?\?|\|\|)\s*\{\s*x:\s*0,\s*y:\s*0,\s*z:\s*0\s*\}/u
    )
  })
})

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
