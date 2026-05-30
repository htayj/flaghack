import { describe, expect, it } from "@effect/vitest"
import {
  AllAttributes,
  AllStates,
  AnyAttribute,
  AnyState,
  HitP,
  HungerP
} from "@flaghack/domain/stats"
import { Either, Schema as S } from "effect"

const accepts = (schema: S.Schema.AnyNoContext, input: unknown): boolean =>
  Either.isRight(S.decodeUnknownEither(schema)(input))

const rejects = (schema: S.Schema.AnyNoContext, input: unknown): boolean =>
  Either.isLeft(S.decodeUnknownEither(schema)(input))

describe("stats schemas", () => {
  it("treats wisdom as its own required attribute field", () => {
    expect(
      accepts(AllAttributes, {
        charisma: 10,
        strength: 11,
        intelligence: 12,
        dexterity: 13,
        constitution: 14,
        wisdom: 15
      })
    ).toBe(true)

    expect(
      rejects(AllAttributes, {
        charisma: 10,
        strength: 11,
        intelligence: 12,
        dexterity: 13,
        constitution: 14
      })
    ).toBe(true)

    expect(accepts(AnyAttribute, { wisdom: 15 })).toBe(true)
    expect(rejects(AnyAttribute, { widsom: 15 })).toBe(true)
  })

  it("models phase and BUC item states instead of properties", () => {
    expect(
      accepts(AllStates, { phase: "solid", buc: "uncursed" })
    ).toBe(true)
    expect(rejects(AllStates, { fixed: true, wet: true })).toBe(true)

    expect(accepts(AnyState, { phase: "gas" })).toBe(true)
    expect(accepts(AnyState, { buc: "blessed" })).toBe(true)
    expect(rejects(AnyState, { fixed: true })).toBe(true)
  })

  it("uses a distinct hunger loss field from hit point loss", () => {
    expect(accepts(HungerP, { dhunger: 3 })).toBe(true)
    expect(rejects(HungerP, { dhp: 3 })).toBe(true)
    expect(accepts(HitP, { dhp: 3 })).toBe(true)
  })
})
