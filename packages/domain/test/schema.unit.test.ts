import { describe, expect, it } from "@effect/vitest"
import {
  AnyTerrain,
  conforms,
  Pos,
  SAction,
  World
} from "@flaghack/domain/schemas"
import { Either, HashMap, Schema as S } from "effect"
import { readFileSync } from "node:fs"

const expectRight = <A, E>(either: Either.Either<A, E>): A =>
  Either.match(either, {
    onLeft: (error) => {
      throw new Error(
        `Expected schema validation to succeed: ${String(error)}`
      )
    },
    onRight: (value) => value
  })

const sampleFloor = {
  _tag: "floor" as const,
  key: "floor-1",
  in: "world",
  at: { x: 1, y: 2, z: 0 }
}

describe("domain source schemas", () => {
  it("requires three-dimensional positions", () => {
    expect(Either.isRight(S.validateEither(Pos)(sampleFloor.at))).toBe(
      true
    )
    expect(
      Either.isRight(S.validateEither(Pos)({ x: -1, y: -2, z: -3 }))
    ).toBe(true)
    expect(Either.isLeft(S.validateEither(Pos)({ x: 1, y: 2 }))).toBe(true)

    for (
      const fractionalPosition of [
        { x: 1.5, y: 2, z: 0 },
        { x: 1, y: 2.5, z: 0 },
        { x: 1, y: 2, z: 0.5 }
      ]
    ) {
      expect(Either.isLeft(S.validateEither(Pos)(fractionalPosition)))
        .toBe(
          true
        )
    }
  })

  it("decodes current movement and multi-item actions", () => {
    expectRight(S.decodeUnknownEither(SAction)({ _tag: "move", dir: "N" }))
    expectRight(
      S.decodeUnknownEither(SAction)({
        _tag: "pickupMulti",
        keys: ["floor-1", "flag-1"]
      })
    )
    expectRight(
      S.decodeUnknownEither(SAction)({
        _tag: "dropMulti",
        keys: ["floor-1"]
      })
    )
  })

  it("validates a tiny world HashMap from source schema", () => {
    const world = HashMap.fromIterable([[sampleFloor.key, sampleFloor]])

    expect(HashMap.size(world)).toBe(1)
    expect(Either.isRight(S.validateEither(World)(world))).toBe(true)
  })

  it("exposes conforms as a terrain type guard", () => {
    const conformsToTerrain: (u: unknown) => u is typeof AnyTerrain.Type =
      conforms(AnyTerrain)

    expect(conformsToTerrain(sampleFloor)).toBe(true)
    expect(
      conformsToTerrain({
        _tag: "flag",
        key: "flag-1",
        in: "world",
        at: { x: 0, y: 0, z: 0 }
      })
    ).toBe(false)
  })

  it("implements conforms with canonical Schema.is validation", () => {
    const source = readFileSync(
      new URL("../src/schemas.ts", import.meta.url),
      "utf8"
    )
    const conformsStart = source.indexOf("export const conforms")
    const worldStart = source.indexOf("export const World", conformsStart)
    const effectImport = source
      .split("\n")
      .find((line) => line.includes("from \"effect\"")) ?? ""

    expect(conformsStart).toBeGreaterThanOrEqual(0)
    expect(worldStart).toBeGreaterThan(conformsStart)
    const implementation = source.slice(conformsStart, worldStart)

    expect(effectImport).not.toContain("Either")
    expect(implementation).toContain("S.is")
    expect(implementation).not.toContain("validateEither")
    expect(implementation).not.toContain("Either.match")
  })
})
