import { describe, expect, it } from "@effect/vitest"
import {
  campgroundCamps,
  campgroundLandmarks,
  campgroundRoads,
  deterministicCampgroundChoice,
  formatCampgroundAddress,
  getCampgroundCamp,
  getCampgroundCampAtSlot,
  getCampgroundLandmark,
  getCampgroundRoad
} from "../src/campground.js"

const unique = <T>(values: ReadonlyArray<T>): boolean =>
  new Set(values).size === values.length

describe("campground content catalog", () => {
  it("defines one stable, uniquely named camp for each generator slot", () => {
    expect(campgroundCamps).toHaveLength(24)
    expect(campgroundCamps.map(({ slot }) => slot)).toEqual(
      Array.from({ length: 24 }, (_, slot) => slot)
    )
    expect(unique(campgroundCamps.map(({ id }) => id))).toBe(true)
    expect(unique(campgroundCamps.map(({ name }) => name))).toBe(true)
    expect(
      unique(campgroundCamps.map(({ address }) => address.marker))
    ).toBe(true)

    for (const camp of campgroundCamps) {
      expect(getCampgroundCampAtSlot(camp.slot)).toEqual(camp)
      expect(getCampgroundCamp(camp.id)).toEqual(camp)
    }
    expect(getCampgroundCampAtSlot(24)).toBeUndefined()
    expect(getCampgroundCamp("not-a-camp")).toBeUndefined()
  })

  it("provides eight distinctive flagships and quieter support camps", () => {
    const flagships = campgroundCamps.filter(({ kind }) =>
      kind === "flagship"
    )
    const supportCamps = campgroundCamps.filter(({ kind }) =>
      kind === "support"
    )

    expect(flagships).toHaveLength(8)
    expect(supportCamps).toHaveLength(16)
    expect(unique(flagships.map(({ structure }) => structure.motif))).toBe(
      true
    )
    expect(
      supportCamps.every(({ ambientIntensity }) =>
        ambientIntensity === "quiet"
      )
    ).toBe(true)
    expect(
      supportCamps.every(({ npcMix }) =>
        npcMix.hippies + npcMix.rangers <= 3
      )
    ).toBe(true)
  })

  it("keeps every content entry usable by deterministic generation", () => {
    const roadIds = new Set(campgroundRoads.map(({ id }) => id))

    for (const camp of campgroundCamps) {
      expect(roadIds.has(camp.address.roadId)).toBe(true)
      expect(
        getCampgroundRoad(camp.address.roadId)?.district
      ).toBe(camp.address.district)
      expect(formatCampgroundAddress(camp.address)).toContain(
        camp.address.marker
      )
      expect(camp.structure.personalTents).toBeGreaterThanOrEqual(0)
      expect(camp.structure.popupCanopies).toBeGreaterThanOrEqual(0)
      expect(camp.structure.carports).toBeGreaterThanOrEqual(0)
      expect(camp.barks.length).toBeGreaterThanOrEqual(2)
      expect(camp.ambient.length).toBeGreaterThanOrEqual(2)

      const lootCount = Object.values(camp.coolerLoot).reduce(
        (total, count) => total + count,
        0
      )
      expect(lootCount).toBeGreaterThan(0)
      expect(Object.values(camp.coolerLoot).every(Number.isInteger)).toBe(
        true
      )
    }
  })

  it("defines unique landmarks for onboarding, navigation, and tone", () => {
    expect(campgroundLandmarks.map(({ id }) => id)).toEqual([
      "arrival-plaza",
      "directory",
      "water-station",
      "central-effigy",
      "temple"
    ])
    expect(unique(campgroundLandmarks.map(({ name }) => name))).toBe(true)

    for (const landmark of campgroundLandmarks) {
      expect(getCampgroundLandmark(landmark.id)).toEqual(landmark)
      expect(landmark.signText.length).toBeGreaterThan(0)
      expect(landmark.purpose.length).toBeGreaterThan(0)
      expect(landmark.barks.length).toBeGreaterThanOrEqual(2)
      expect(landmark.ambient.length).toBeGreaterThanOrEqual(2)
    }
  })

  it("selects flavor text reproducibly without mutable random state", () => {
    const lines = ["alpha", "beta", "gamma"] as const

    expect(deterministicCampgroundChoice(lines, 777, "camp:0:turn:8"))
      .toBe(
        deterministicCampgroundChoice(lines, 777, "camp:0:turn:8")
      )
    expect(deterministicCampgroundChoice([], 777, "empty")).toBeUndefined()

    const choices = Array.from(
      { length: 100 },
      (_, index) =>
        deterministicCampgroundChoice(lines, 777, `camp:${index}`)
    )
    expect(new Set(choices)).toEqual(new Set(lines))
  })
})
