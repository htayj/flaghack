import { describe, expect, it } from "@effect/vitest"
import { Effect, HashMap } from "effect"
import { readFileSync } from "node:fs"
import { getPickupItemsFor } from "../src/gameloop.js"

describe("getPickupItemsFor", () => {
  it("returns an empty HashMap for a missing entity", () => {
    const items = Effect.runSync(getPickupItemsFor("__missing__"))

    expect(Array.from(HashMap.values(items))).toHaveLength(0)
  })

  it("does not handle missing entities through NoSuchElementException catchTag", () => {
    const gameloopSource = readFileSync(
      new URL("../src/gameloop.ts", import.meta.url),
      "utf8"
    )
    const legacyCatchTag = [
      "catchTag(\"NoSuchElement",
      "Exception\""
    ].join("")

    expect(gameloopSource).not.toContain(legacyCatchTag)
  })
})
