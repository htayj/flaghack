import { describe, expect, it } from "@effect/vitest"
import {
  CREATURE_TAGS,
  creatureCapabilityMask,
  creatureCapabilityMaskByTag,
  EGREGORE,
  HAS_EYES,
  HAS_HANDS,
  hasAllCreatureCapabilities,
  hasCreatureCapability,
  HAVE_BRAIN,
  HUMANOID,
  isCreatureTag,
  MINDLESS
} from "@flaghack/domain/creatureCapabilities"
import type { AnyCreature } from "@flaghack/domain/schemas"

describe("creature capability masks", () => {
  it("maps every creature schema tag to a numeric bitmask", () => {
    const expectedTags = [
      "player",
      "ranger",
      "hippie",
      "wook",
      "acidcop",
      "lesser_egregore",
      "greater_egregore",
      "collective_egregore"
    ] as const satisfies ReadonlyArray<typeof AnyCreature.Type["_tag"]>

    expect(CREATURE_TAGS).toEqual(expectedTags)
    expect(Object.keys(creatureCapabilityMaskByTag).sort()).toEqual(
      [...expectedTags].sort()
    )

    for (const tag of expectedTags) {
      expect(isCreatureTag(tag)).toBe(true)
      expect(creatureCapabilityMask(tag)).toBe(
        creatureCapabilityMaskByTag[tag]
      )
    }
  })

  it("checks NetHack-like creature capabilities with cheap bit operations", () => {
    expect(hasCreatureCapability("player", HAVE_BRAIN)).toBe(true)
    expect(hasCreatureCapability("hippie", HAVE_BRAIN)).toBe(true)
    expect(hasCreatureCapability("ranger", HAS_HANDS)).toBe(true)
    expect(hasAllCreatureCapabilities("wook", HAVE_BRAIN | HUMANOID))
      .toBe(true)
    expect(hasCreatureCapability("lesser_egregore", HAVE_BRAIN)).toBe(
      false
    )
    expect(
      hasAllCreatureCapabilities("greater_egregore", EGREGORE | MINDLESS)
    )
      .toBe(true)
    expect(
      hasCreatureCapability({ _tag: "collective_egregore" }, HAS_EYES)
    )
      .toBe(true)
  })

  it("rejects non-creature tags without schema decoding", () => {
    expect(isCreatureTag("floor")).toBe(false)
    expect(creatureCapabilityMask("floor")).toBe(0)
    expect(hasCreatureCapability("floor", HAVE_BRAIN)).toBe(false)
  })
})
