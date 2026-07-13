import { describe, expect, it } from "@effect/vitest"
import { Effect, HashMap } from "effect"
import { readFileSync } from "node:fs"
import { BSPGenLevel, type World } from "../src/world.js"

const terrainTopology = (world: World): Array<string> =>
  Array.from(world.pipe(HashMap.values))
    .filter((entity) =>
      entity.in === "world"
      && (
        entity._tag === "door"
        || entity._tag === "floor"
        || entity._tag === "tunnel"
        || entity._tag === "wall"
      )
    )
    .map((entity) => `${entity._tag}:${entity.at.x},${entity.at.y}`)
    .sort()

describe("level generation randomness", () => {
  it("uses Effect Random for seeded sampling", () => {
    const source = readFileSync(
      new URL("../src/world.ts", import.meta.url),
      "utf8"
    )

    expect(source).toContain("Random.shuffle")
    expect(source).toContain("flag-hack:level-generation:v1")
    expect(source).not.toContain("seed * 100 + dlvl")
    expect(source).not.toContain("Math.random")
  })

  it("keeps formerly colliding seed and level pairs independent", () => {
    const first = terrainTopology(
      Effect.runSync(BSPGenLevel(1, 102))
    )
    const repeat = terrainTopology(
      Effect.runSync(BSPGenLevel(1, 102))
    )
    const formerlyColliding = terrainTopology(
      Effect.runSync(BSPGenLevel(2, 2))
    )

    expect(repeat).toEqual(first)
    expect(formerlyColliding).not.toEqual(first)
  })
})
