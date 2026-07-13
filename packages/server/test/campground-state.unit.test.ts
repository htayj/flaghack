import { describe, expect, it } from "@effect/vitest"
import { GameState } from "@flaghack/domain/schemas"
import { Effect, HashMap } from "effect"
import {
  campgroundCamps,
  formatCampgroundAddress
} from "../src/campground.js"
import {
  CAMPGROUND_CONTENT_VERSION,
  CAMPGROUND_RETURN_STAIRS_POSITION,
  CAMPGROUND_STATE_VERSION,
  CAMPGROUND_WAKE_UP_MESSAGE,
  campgroundViewForState,
  DEFAULT_CAMPGROUND_WEATHER,
  deriveCampgroundCampPlacements,
  deriveCampgroundNpcAssignments,
  markCampgroundDiscovery,
  markCampgroundGreeting,
  normalizeCampgroundState,
  prepareRestoredCampgroundState
} from "../src/campgroundState.js"
import { makeHippie, makeRanger, player } from "../src/creatures.js"
import { makeCooler } from "../src/items.js"
import {
  makeCampProp,
  makeEffigy,
  makeFloor,
  makeSign,
  makeStairsUp,
  makeTemple,
  makeTunnel
} from "../src/terrain.js"
import { CampgroundGenLevel, type Entity } from "../src/world.js"

type State = typeof GameState.Type

const stateOf = (
  entities: ReadonlyArray<Entity>,
  campground?: State["campground"]
): State =>
  GameState.make({
    ...(campground === undefined ? {} : { campground }),
    world: HashMap.fromIterable(
      entities.map((entity) => [entity.key, entity] as const)
    )
  })

const firstCamp = campgroundCamps[0]
if (firstCamp === undefined) throw new Error("missing camp fixture")

const integratedCampSign = `${firstCamp.name} — ${
  formatCampgroundAddress(firstCamp.address)
}`

const campgroundFixture = (): ReadonlyArray<Entity> => [
  player(0, 0, 0),
  makeFloor("player-floor", 0, 0, 0),
  makeTunnel("camp-road", 4, 5, 0),
  makeFloor("camp-floor", 5, 5, 0),
  makeSign("camp-sign", 5, 5, 0, integratedCampSign),
  makeCooler("camp-cooler", 6, 5, 0),
  makeCampProp("arrival", 0, 0, 0, "arrival-gate"),
  makeCampProp("directory", 1, 0, 0, "directory"),
  makeCampProp("water", 2, 0, 0, "water-station"),
  makeFloor("water-neighbor", 2, 1, 0),
  makeEffigy("effigy-left", 10, 10, 0),
  makeEffigy("effigy-center", 11, 10, 0),
  makeEffigy("effigy-right", 12, 10, 0),
  makeTemple("temple", 20, 10, 0),
  makeHippie("resident", 6, 6, 0),
  makeHippie("traveler", 15, 5, 0, "traveler"),
  makeRanger("greeter", 2, 2, 0, "Alex"),
  makeRanger("patrol", 40, 40, 0, "Dusty")
]

describe("campground state normalization", () => {
  it("hydrates a legacy save conservatively from actual world entities", () => {
    const normalized = normalizeCampgroundState(
      stateOf(campgroundFixture())
    )
    const campground = normalized.campground

    expect(campground).toBeDefined()
    expect(campground?.version).toBe(CAMPGROUND_STATE_VERSION)
    expect(campground?.contentVersion).toBe(CAMPGROUND_CONTENT_VERSION)
    expect(campground?.discoveredIds).toEqual(["arrival-plaza"])
    expect(campground?.greetedNpcKeys).toEqual([])
    expect(campground?.missingFlagPhase).toBe("not-started")
    expect(campground?.welcomeFavor).toEqual({ phase: "unavailable" })
    expect(campground?.toolFavor).toEqual({ phase: "unavailable" })
    expect(campground?.waterFavor).toEqual({ phase: "unavailable" })
    expect(campground?.surfaceAmbience).toEqual({})
    expect(campground?.publicEvent).toEqual({ phase: "cooldown" })
    expect(campground?.weather).toEqual(DEFAULT_CAMPGROUND_WEATHER)
    expect(campground?.campPlacements).toMatchObject([{
      entranceAt: { x: 4, y: 5, z: 0 },
      id: firstCamp.id,
      signAt: { x: 5, y: 5, z: 0 },
      signKey: "camp-sign"
    }])
    expect(campground?.landmarkPlacements?.map(({ id }) => id)).toEqual([
      "arrival-plaza",
      "directory",
      "water-station",
      "central-effigy",
      "temple"
    ])
    expect(campground?.npcAssignments).toHaveLength(4)
    expect(campground?.npcAssignments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          landmarkId: "arrival-plaza",
          role: "civic"
        }),
        expect.objectContaining({
          campId: firstCamp.id,
          role: "host"
        }),
        expect.objectContaining({
          landmarkId: "central-effigy",
          role: "civic"
        }),
        expect.objectContaining({
          landmarkId: "temple",
          role: "civic"
        })
      ])
    )
    expect(campground?.missingFlagOwnerNpcKey).toBe("greeter")
  })

  it("supports legacy signs outside the current catalog without inventing camps from civic signs", () => {
    const world = stateOf([
      player(0, 0, 0),
      makeSign("legacy-sign", 8, 8, 0, "Camp Old Geometry"),
      makeCooler("legacy-cooler", 9, 8, 0),
      makeTunnel("legacy-road", 7, 8, 0),
      makeSign("civic-sign", 2, 2, 0, "Old Directory")
    ]).world

    expect(deriveCampgroundCampPlacements(world)).toEqual([{
      address: { label: "Unmapped camp" },
      entranceAt: { x: 7, y: 8, z: 0 },
      id: "legacy-legacy-sign",
      kind: "legacy",
      name: "Camp Old Geometry",
      signAt: { x: 8, y: 8, z: 0 },
      signKey: "legacy-sign"
    }])
  })

  it("initializes an empty legacy world without fabricating placements", () => {
    const legacy = stateOf([player(0, 0, 0)])
    const normalized = normalizeCampgroundState(legacy)

    expect(normalized.campground).toMatchObject({
      campPlacements: [],
      discoveredIds: [],
      landmarkPlacements: [],
      npcAssignments: [],
      version: CAMPGROUND_STATE_VERSION
    })
    expect(campgroundViewForState(legacy)).toEqual({
      discoveredLandmarks: [],
      weather: DEFAULT_CAMPGROUND_WEATHER
    })
  })

  it("repairs a player stranded on level one exactly once", () => {
    const legacy = stateOf([
      player(1, 1, 1),
      makeTunnel("arrival-tunnel", 1, 1, 1)
    ])
    const first = normalizeCampgroundState(legacy)
    const second = normalizeCampgroundState(first)
    const stairs = Array.from(first.world.pipe(HashMap.values)).filter(
      ({ _tag }) => _tag === "stairs-up"
    )

    expect(stairs).toHaveLength(1)
    expect(stairs[0]?.at).toEqual(CAMPGROUND_RETURN_STAIRS_POSITION)
    expect(second).toBe(first)

    const alreadySafe = stateOf([
      player(1, 1, 1),
      makeTunnel("arrival-tunnel", 1, 1, 1),
      makeStairsUp("existing-stairs", 2, 1, 1)
    ])
    const safeResult = normalizeCampgroundState(alreadySafe)
    expect(
      Array.from(safeResult.world.pipe(HashMap.values)).filter(
        ({ _tag }) => _tag === "stairs-up"
      ).map(({ key }) => key)
    ).toEqual(["existing-stairs"])

    const surfaceOnly = normalizeCampgroundState(stateOf([
      player(0, 0, 0),
      makeTunnel("ungenerated-return", 1, 1, 1)
    ]))
    expect(
      Array.from(surfaceOnly.world.pipe(HashMap.values)).some(
        ({ _tag }) => _tag === "stairs-up"
      )
    ).toBe(false)
  })

  it("fills absent runtime fields without overwriting partial saved fields", () => {
    const partial = {
      version: 9,
      campPlacements: [],
      discoveredIds: ["temple"],
      missingFlagKey: "saved-flag",
      missingFlagPhase: "temple-lead" as const,
      publicEvent: { phase: "scheduled" as const, nextTurn: 88 },
      surfaceAmbience: { nextTurn: 44 },
      waterFavor: { phase: "completed" as const, rewardGranted: true }
    }
    const saved = stateOf(campgroundFixture(), partial)
    const savedCampPlacements = saved.campground?.campPlacements
    const normalized = normalizeCampgroundState(saved)

    expect(normalized.campground).toMatchObject(partial)
    expect(normalized.campground?.campPlacements).toBe(
      savedCampPlacements
    )
    expect(normalized.campground?.landmarkPlacements?.length)
      .toBeGreaterThan(
        0
      )
    expect(normalized.campground?.welcomeFavor).toEqual({
      phase: "unavailable"
    })
    expect(normalized.campground?.toolFavor).toEqual({
      phase: "unavailable"
    })
    expect(normalized.campground?.weather).toEqual(
      DEFAULT_CAMPGROUND_WEATHER
    )
  })

  it("strips only retained arrival narration when preparing a restore", () => {
    const saved = GameState.make({
      campground: { version: 1 },
      gameplayEvents: [{
        id: 11,
        message: "A different retained event."
      }, {
        id: 12,
        kind: "arrival-narration",
        message: CAMPGROUND_WAKE_UP_MESSAGE
      }],
      nextGameplayEventId: 19,
      setup: { phase: "complete" },
      world: stateOf(campgroundFixture()).world
    })

    const restored = prepareRestoredCampgroundState(saved)

    expect(restored.gameplayEvents).toEqual([{
      id: 11,
      message: "A different retained event."
    }])
    expect(restored.nextGameplayEventId).toBe(19)
    expect(restored.campground?.weather).toEqual(
      DEFAULT_CAMPGROUND_WEATHER
    )
    expect(prepareRestoredCampgroundState(restored)).toBe(restored)
  })

  it("returns an already normalized safe state by reference", () => {
    const first = normalizeCampgroundState(stateOf(campgroundFixture()))
    expect(normalizeCampgroundState(first)).toBe(first)
  })

  it("assigns every generated NPC once while reserving civic and flagship roles", () => {
    const world = Effect.runSync(CampgroundGenLevel(777, 0))
    const assignments = deriveCampgroundNpcAssignments(world)
    const npcCount = Array.from(world.pipe(HashMap.values)).filter(
      ({ _tag }) => _tag === "hippie" || _tag === "ranger"
    ).length

    expect(assignments).toHaveLength(npcCount)
    expect(new Set(assignments.map(({ npcKey }) => npcKey)).size).toBe(
      npcCount
    )
    for (
      const landmarkId of [
        "arrival-plaza",
        "central-effigy",
        "temple"
      ]
    ) {
      expect(assignments).toContainEqual(
        expect.objectContaining({ landmarkId, role: "civic" })
      )
    }
    for (
      const campId of [
        "dusty-spoon",
        "patch-bay",
        "pulse-dome",
        "flag-lab"
      ]
    ) {
      expect(assignments).toContainEqual(
        expect.objectContaining({ campId, role: "host" })
      )
    }
  })
})

describe("campground state updates and projection", () => {
  it("marks discoveries and greetings once in stable order", () => {
    const base = stateOf(campgroundFixture(), {
      version: 1,
      discoveredIds: ["temple"],
      greetedNpcKeys: ["npc-z"]
    })
    const discovered = markCampgroundDiscovery(
      markCampgroundDiscovery(base, firstCamp.id),
      "arrival-plaza"
    )
    const greeted = markCampgroundGreeting(
      markCampgroundGreeting(discovered, "npc-a"),
      "npc-z"
    )

    expect(greeted.campground?.discoveredIds).toEqual([
      "arrival-plaza",
      "temple",
      firstCamp.id
    ])
    expect(greeted.campground?.greetedNpcKeys).toEqual([
      "npc-a",
      "npc-z"
    ])
  })

  it("projects current address and only discovered destination coordinates", () => {
    const hiddenCampCoordinate = 8_765
    const hiddenTempleCoordinate = 9_876
    const campground = {
      version: 1,
      campPlacements: [{
        address: { label: "Secret Camp Address" },
        entranceAt: { x: hiddenCampCoordinate, y: 0, z: 0 },
        id: "secret-camp",
        kind: "flagship",
        name: "Secret Camp",
        signAt: { x: hiddenCampCoordinate + 1, y: 0, z: 0 }
      }],
      landmarkPlacements: [{
        address: { label: "Gate and Main Road" },
        at: { x: 0, y: 0, z: 0 },
        id: "arrival-plaza",
        kind: "civic",
        name: "Arrival Plaza",
        travelAt: { x: 0, y: 0, z: 0 }
      }, {
        address: { label: "Hidden Temple Address" },
        at: { x: hiddenTempleCoordinate, y: 0, z: 0 },
        id: "temple",
        kind: "temple",
        name: "The Temple",
        travelAt: { x: hiddenTempleCoordinate, y: 1, z: 0 }
      }],
      discoveredIds: ["arrival-plaza"],
      missingFlagPhase: "temple-lead" as const,
      publicEvent: {
        phase: "active" as const,
        hostCampId: "secret-camp",
        kind: "dance"
      }
    }
    const view = campgroundViewForState(
      stateOf([player(0, 0, 0), makeFloor("floor", 0, 0, 0)], campground)
    )
    const serialized = JSON.stringify(view)

    expect(view).toEqual({
      currentAddress: "Gate and Main Road",
      discoveredLandmarks: [{
        address: "Gate and Main Road",
        at: { x: 0, y: 0, z: 0 },
        id: "arrival-plaza",
        kind: "civic",
        name: "Arrival Plaza",
        travelAvailable: true
      }],
      weather: DEFAULT_CAMPGROUND_WEATHER
    })
    expect(serialized).not.toContain(String(hiddenCampCoordinate))
    expect(serialized).not.toContain(String(hiddenTempleCoordinate))
    expect(serialized).not.toContain("Secret Camp")
    expect(serialized).not.toContain("Hidden Temple Address")
    expect(serialized).not.toContain("missingFlagPhase")
    expect(serialized).not.toContain("temple-lead")
  })

  it("projects a named district road when no camp or landmark is nearby", () => {
    const positions = [
      { expected: "Lantern Road", x: 0, y: -30 },
      { expected: "Sunrise Spoke", x: 30, y: 0 },
      { expected: "Dusty Way", x: 0, y: 30 },
      { expected: "Sunset Spoke", x: -30, y: 0 }
    ] as const

    for (const { expected, x, y } of positions) {
      const state = stateOf(
        [
          player(x, y, 0),
          makeTunnel(`road-${x}-${y}`, x, y, 0),
          makeEffigy("center", 0, 0, 0)
        ],
        {
          campPlacements: [],
          discoveredIds: [],
          landmarkPlacements: [{
            address: { label: "Center Junction" },
            at: { x: 0, y: 0, z: 0 },
            id: "central-effigy",
            kind: "effigy",
            name: "The Effigy",
            travelAt: { x: 0, y: 0, z: 0 }
          }],
          version: 1
        }
      )

      expect(campgroundViewForState(state).currentAddress).toBe(expected)
    }
  })

  it("projects heavy rain only while the player is on the surface", () => {
    const surface = campgroundViewForState(stateOf([
      player(0, 0, 0),
      makeFloor("surface-floor", 0, 0, 0)
    ]))
    const underground = campgroundViewForState(stateOf([
      player(0, 0, 1),
      makeTunnel("dungeon-tunnel", 0, 0, 1)
    ]))

    expect(surface.weather).toEqual(DEFAULT_CAMPGROUND_WEATHER)
    expect(underground.weather).toBeUndefined()
  })
})
