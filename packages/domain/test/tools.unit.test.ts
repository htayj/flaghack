import { describe, it } from "@effect/vitest"
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
})
