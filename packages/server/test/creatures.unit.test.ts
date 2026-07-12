import { describe, expect, it } from "@effect/vitest"
import { AnyCreature, conforms } from "@flaghack/domain/schemas"
import {
  ATTRIBUTE_NAMES,
  balancedAttributes
} from "@flaghack/domain/stats"
import { Effect, Random } from "effect"
import {
  acidcop,
  hippie,
  makeAcidcop,
  makeHippie,
  makeRanger,
  player,
  ranger,
  rolledPlayer
} from "../src/creatures.js"
import { CounterKeyGeneratorLive } from "../src/keyGenerator.js"

const allAttributesWithinCreationBounds = (
  attributes: typeof balancedAttributes
): boolean =>
  ATTRIBUTE_NAMES.every((attribute) =>
    attributes[attribute] >= 3 && attributes[attribute] <= 18
  )

describe("server creature constructors", () => {
  it("keeps pure fixture constructors explicit and schema-valid", () => {
    const fixtureAttributes = {
      charisma: 7,
      constitution: 8,
      dexterity: 9,
      intelligence: 10,
      strength: 11,
      wisdom: 12
    }
    const creatures = [
      player(1, 2, 3, fixtureAttributes),
      makeHippie("hippie-1", 4, 5, 6, "Ian", fixtureAttributes),
      makeRanger("ranger-1", 7, 8, 9, "Ranger", fixtureAttributes),
      makeAcidcop("acidcop-1", 10, 11, 12, "Acidcop", fixtureAttributes)
    ]

    for (const creature of creatures) {
      expect(conforms(AnyCreature)(creature)).toBe(true)
      expect(creature.attributes).toEqual(fixtureAttributes)
    }
  })

  it("provides balanced attributes for static fixture convenience", () => {
    expect(player(0, 0, 0).attributes).toEqual(balancedAttributes)
    expect(makeHippie("hippie-1", 0, 0, 0).attributes).toEqual(
      balancedAttributes
    )
  })

  it("rolls deterministic player attributes while preserving the fixed player key", () => {
    const first = Effect.runSync(
      rolledPlayer(1, 2, 3).pipe(Effect.withRandom(Random.make(1234)))
    )
    const second = Effect.runSync(
      rolledPlayer(1, 2, 3).pipe(Effect.withRandom(Random.make(1234)))
    )

    expect(second).toEqual(first)
    expect(first.key).toBe("player")
    expect(first.at).toEqual({ x: 1, y: 2, z: 3 })
    expect(allAttributesWithinCreationBounds(first.attributes)).toBe(true)
    expect(first.attributes).not.toEqual(balancedAttributes)
  })

  it("rolls NPC attributes without consuming deterministic key order", () => {
    const program = Effect.all([
      hippie(1, 2, 3, "Ian"),
      ranger(4, 5, 6, "Ranger"),
      acidcop(7, 8, 9, "Acidcop")
    ])
    const first = Effect.runSync(
      program.pipe(
        Effect.provide(CounterKeyGeneratorLive),
        Effect.withRandom(Random.make(777))
      )
    )
    const second = Effect.runSync(
      program.pipe(
        Effect.provide(CounterKeyGeneratorLive),
        Effect.withRandom(Random.make(777))
      )
    )

    expect(second).toEqual(first)
    expect(first.map((creature) => creature.key)).toEqual([
      "entity-0",
      "entity-1",
      "entity-2"
    ])
    for (const creature of first) {
      expect(conforms(AnyCreature)(creature)).toBe(true)
      expect(allAttributesWithinCreationBounds(creature.attributes)).toBe(
        true
      )
      expect(creature.attributes).not.toEqual(balancedAttributes)
    }
  })
})
