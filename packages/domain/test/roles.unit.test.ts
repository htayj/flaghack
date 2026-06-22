import { describe, expect, it } from "@effect/vitest"
import { Role, roles, virginRole } from "@flaghack/domain/roles"
import { Either, Schema as S } from "effect"

describe("character roles", () => {
  it("defines the virgin role with NetHack-style letter and balanced empty start", () => {
    expect(roles).toEqual([virginRole])
    expect(virginRole).toMatchObject({
      id: "virgin",
      letter: "v",
      name: "virgin",
      attributes: {
        charisma: 10,
        constitution: 10,
        dexterity: 10,
        intelligence: 10,
        strength: 10,
        wisdom: 10
      },
      equipment: [],
      startingInventory: []
    })
  })

  it("validates role data through the shared role schema", () => {
    expect(Either.isRight(S.validateEither(Role)(virginRole))).toBe(true)
  })
})
