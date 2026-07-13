import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import {
  campgroundCamps,
  formatCampgroundAddress,
  getCampgroundCamp
} from "../src/campground.js"
import {
  campgroundFavorContents,
  campgroundPublicEvents,
  campHostDialogue,
  greeterDialogue,
  keyToolRunFavor,
  rangerDialogue,
  repeatCampgroundDialogue,
  residentDialogue,
  templeCaretakerDialogue,
  toolRunFavor,
  waterRunFavor,
  welcomeMessageFavor
} from "../src/campgroundDialogue.js"
import {
  campPlaceKey,
  type DiscoverableCampgroundPlace,
  discoverCampgroundPlaces
} from "../src/campgroundNavigation.js"
import { CampgroundGenLevel } from "../src/world.js"

const context = (
  overrides: Partial<Parameters<typeof greeterDialogue>[0]> = {}
): Parameters<typeof greeterDialogue>[0] => ({
  seed: 777,
  speakerKey: "npc-greeter",
  turn: 42,
  ...overrides
})

const firstCamp = campgroundCamps[0]
if (firstCamp === undefined) throw new Error("missing first camp")

describe("authored campground dialogue", () => {
  it("keeps real generated records available without volunteering hidden places", () => {
    const world = Effect.runSync(CampgroundGenLevel(777, 0))
    const places = discoverCampgroundPlaces(world)
    const generatedCamp = places.find((place) =>
      place.discoveryKey === campPlaceKey(firstCamp.id)
    )
    if (generatedCamp === undefined) {
      throw new Error("missing generated camp discovery record")
    }

    const result = greeterDialogue(context({ places }))

    expect(result.topic).toBe("flavor")
    expect(result.destination).toBeUndefined()
    expect(result.message).not.toContain(generatedCamp.addressLabel)
    expect(generatedCamp.name).toBe(firstCamp.name)
    expect(generatedCamp.addressLabel).toBe(
      formatCampgroundAddress(firstCamp.address)
    )
  })

  it("chooses deterministically and keeps role wrappers useful", () => {
    const shared = context({ places: [] })
    const camp = getCampgroundCamp("dusty-spoon")
    if (camp === undefined) throw new Error("missing Dusty Spoon")

    expect(greeterDialogue(shared)).toEqual(greeterDialogue(shared))
    expect(campHostDialogue(camp, shared)).toEqual(
      campHostDialogue(camp, shared)
    )
    expect(residentDialogue(camp, shared).message.length).toBeGreaterThan(
      0
    )
    expect(templeCaretakerDialogue(shared).message.length).toBeGreaterThan(
      0
    )
    expect(campHostDialogue(camp, shared).message).toContain(camp.name)
    expect(campHostDialogue(camp, shared).message).toContain(
      formatCampgroundAddress(camp.address)
    )
    expect(repeatCampgroundDialogue("resident", shared, camp).topic).toBe(
      "repeat"
    )
  })

  it("prioritizes rumors and favors without volunteering discoveries", () => {
    const places: ReadonlyArray<DiscoverableCampgroundPlace> = [{
      _tag: "camp",
      address: firstCamp.address,
      addressLabel: formatCampgroundAddress(firstCamp.address),
      at: { x: 1, y: 1, z: 0 },
      catalogOrder: firstCamp.slot,
      definition: firstCamp,
      discoveryKey: campPlaceKey(firstCamp.id),
      entityKeys: ["sign-1"],
      id: firstCamp.id,
      name: firstCamp.name
    }]
    const favor = { content: waterRunFavor, phase: "active" as const }

    expect(
      greeterDialogue(context({
        favor,
        missingFlagPhase: "temple-lead",
        places
      })).topic
    ).toBe("missing-flag")
    expect(greeterDialogue(context({ favor, places })).topic).toBe("favor")
    expect(
      greeterDialogue(context({
        favor: { content: waterRunFavor, phase: "unavailable" },
        places
      })).topic
    ).toBe("flavor")
    expect(
      greeterDialogue(context({
        discoveredPlaceKeys: [campPlaceKey(firstCamp.id)],
        places
      })).topic
    ).toBe("flavor")
  })

  it("uses supplied navigation directions without authored route claims", () => {
    const destination: DiscoverableCampgroundPlace = {
      _tag: "camp",
      address: firstCamp.address,
      addressLabel: formatCampgroundAddress(firstCamp.address),
      at: { x: 9, y: 3, z: 0 },
      catalogOrder: firstCamp.slot,
      definition: firstCamp,
      discoveryKey: campPlaceKey(firstCamp.id),
      entityKeys: ["sign-1"],
      id: firstCamp.id,
      name: firstCamp.name
    }
    const suppliedDirections = "ROUTE_FROM_LIVE_NAVIGATION"
    const result = rangerDialogue(context({
      requestedRoute: {
        destination,
        directions: suppliedDirections,
        nextStep: { x: 2, y: 2, z: 0 },
        path: [{ x: 1, y: 1, z: 0 }, { x: 2, y: 2, z: 0 }]
      }
    }))

    expect(result.topic).toBe("directions")
    expect(result.message).toBe(suppliedDirections)
    expect(result.destination).toBe(destination)
  })
})

describe("campground favors and events", () => {
  it("defines welcome, exact-key tool, and repeat-safe water favors", () => {
    expect(campgroundFavorContents.map(({ id }) => id)).toEqual([
      "welcome-message",
      "tool-run",
      "water-run"
    ])
    expect(welcomeMessageFavor.reward.oncePerRun).toBe(true)
    expect(toolRunFavor.objectiveByPhase.active).toContain("hammer")
    expect(keyToolRunFavor("tool-47").requiredItemKey).toBe("tool-47")
    expect(waterRunFavor.reward.oncePerRun).toBe(true)
    expect(waterRunFavor.repeat).not.toBe(waterRunFavor.completion)
    expect(waterRunFavor.repeat.toLocaleLowerCase()).toContain("all set")

    for (const favor of campgroundFavorContents) {
      expect(favor.offer.length).toBeGreaterThan(0)
      expect(favor.ready.length).toBeGreaterThan(0)
      expect(favor.completion.length).toBeGreaterThan(0)
      expect(favor.repeat.length).toBeGreaterThan(0)
      expect(favor.objectiveByPhase.active?.length ?? 0).toBeGreaterThan(0)
      expect(favor.objectiveByPhase.ready?.length ?? 0).toBeGreaterThan(0)
    }
  })

  it("defines meal, workshop, and dance events at real addressed camps", () => {
    expect(campgroundPublicEvents.map(({ id }) => id)).toEqual([
      "meal",
      "workshop",
      "dance"
    ])

    for (const event of campgroundPublicEvents) {
      const host = getCampgroundCamp(event.hostCampId)
      expect(host).toBeDefined()
      if (host === undefined) continue
      expect(event.announcement).toContain(host.name)
      expect(event.announcement).toContain(
        formatCampgroundAddress(host.address)
      )
      expect(event.endingAnnouncement).toContain(host.name)
      expect(event.ambient.length).toBeGreaterThanOrEqual(2)
    }
  })

  it("keeps favor text conversational rather than exposing tracked objectives", () => {
    for (const favor of campgroundFavorContents) {
      const text = [
        favor.offer,
        favor.ready,
        favor.completion,
        favor.repeat,
        ...Object.values(favor.objectiveByPhase).filter(Boolean)
      ].join(" ").toLocaleLowerCase()
      expect(text).not.toContain("quest")
      expect(text).not.toContain("objective")
      expect(text).not.toContain("quest complete")
    }
  })
})
