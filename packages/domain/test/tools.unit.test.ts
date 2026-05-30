import { describe, expect, it } from "@effect/vitest"
import { getTile } from "@flaghack/domain/display"
import { AnyItem } from "@flaghack/domain/schemas"
import { Either, Schema as S } from "effect"

const expectRight = <A, E>(either: Either.Either<A, E>): A =>
  Either.match(either, {
    onLeft: (error) => {
      throw new Error(
        `Expected schema validation to succeed: ${String(error)}`
      )
    },
    onRight: (value) => value
  })

const sampleHammer = {
  _tag: "hammer" as const,
  key: "hammer-1",
  in: "toolbox",
  at: { x: 2, y: 3, z: 0 }
}

const sampleNails = {
  _tag: "nails" as const,
  key: "nails-1",
  in: "toolbox",
  at: { x: 3, y: 3, z: 0 }
}

describe("tool items", () => {
  it("decodes and validates tools as AnyItem", () => {
    for (const tool of [sampleHammer, sampleNails]) {
      expectRight(S.decodeUnknownEither(AnyItem)(tool))
      expectRight(S.validateEither(AnyItem)(tool))
    }
  })

  it("renders hammer and nails with distinct tool tiles", () => {
    const hammer = expectRight(
      S.decodeUnknownEither(AnyItem)(sampleHammer)
    )
    const nails = expectRight(S.decodeUnknownEither(AnyItem)(sampleNails))

    expect(getTile(hammer)).toEqual({
      color: "white",
      bright: true,
      char: "T"
    })
    expect(getTile(nails)).toEqual({
      color: "cyan",
      bright: true,
      char: ":"
    })
  })
})
