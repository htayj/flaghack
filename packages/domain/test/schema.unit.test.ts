import { describe, expect, it } from "@effect/vitest"
import { Pos, SAction, World } from "@flaghack/domain/schemas"
import { Either, HashMap, Schema as S } from "effect"

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
    expect(Either.isLeft(S.validateEither(Pos)({ x: 1, y: 2 }))).toBe(true)
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
})
