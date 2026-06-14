import { describe, expect, it } from "@effect/vitest"
import {
  AllAttributes,
  AllStates,
  AnyAttribute,
  AnyState,
  HitP,
  HungerP,
  StatusEffect,
  VrilP
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

  it("bounds attributes to integer values from 0 through 20", () => {
    expect(
      accepts(AllAttributes, {
        charisma: 0,
        strength: 0,
        intelligence: 0,
        dexterity: 0,
        constitution: 0,
        wisdom: 0
      })
    ).toBe(true)

    expect(
      accepts(AllAttributes, {
        charisma: 20,
        strength: 20,
        intelligence: 20,
        dexterity: 20,
        constitution: 20,
        wisdom: 20
      })
    ).toBe(true)

    for (
      const value of [
        -1,
        21,
        10.5,
        Number.NaN,
        Number.POSITIVE_INFINITY
      ]
    ) {
      expect(rejects(AnyAttribute, { wisdom: value })).toBe(true)
      expect(
        rejects(AllAttributes, {
          charisma: value,
          strength: 10,
          intelligence: 10,
          dexterity: 10,
          constitution: 10,
          wisdom: 10
        })
      ).toBe(true)
    }
  })

  it("bounds status effect timing to non-negative integers", () => {
    expect(
      accepts(StatusEffect, { active: true, started: 0, duration: 0 })
    ).toBe(true)
    expect(
      accepts(StatusEffect, { active: true, started: 1, duration: 2 })
    ).toBe(true)

    for (
      const value of [
        -1,
        1.5,
        Number.NaN,
        Number.POSITIVE_INFINITY
      ]
    ) {
      expect(
        rejects(StatusEffect, {
          active: true,
          started: value,
          duration: 0
        })
      ).toBe(true)
      expect(
        rejects(StatusEffect, {
          active: true,
          started: 0,
          duration: value
        })
      ).toBe(true)
    }
  })

  it("bounds point deltas to non-negative integers", () => {
    for (
      const [schema, field] of [
        [HitP, "dhp"],
        [VrilP, "dvp"],
        [HungerP, "dhunger"]
      ] as const
    ) {
      expect(accepts(schema, { [field]: 0 })).toBe(true)
      expect(accepts(schema, { [field]: 3 })).toBe(true)

      for (
        const value of [
          -1,
          1.5,
          Number.NaN,
          Number.POSITIVE_INFINITY
        ]
      ) {
        expect(rejects(schema, { [field]: value })).toBe(true)
      }
    }
  })
})
