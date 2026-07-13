import { describe, expect, it } from "@effect/vitest"
import { GameState } from "@flaghack/domain/schemas"
import { Effect, HashMap } from "effect"
import {
  type CampgroundCampDefinition,
  campgroundCamps,
  formatCampgroundAddress
} from "../src/campground.js"
import {
  advanceCampgroundAtmosphere,
  campgroundHeavyRainOutdoorAmbient,
  campgroundHeavyRainShelterAmbient,
  suppressCampgroundAtmosphere
} from "../src/campgroundAtmosphere.js"
import { campgroundPublicEvents } from "../src/campgroundDialogue.js"
import { player } from "../src/creatures.js"
import { latestGameplayEvent } from "../src/gameplayEvents.js"
import {
  advanceWorldAtmosphere,
  firstDungeonAmbientSounds
} from "../src/sounds.js"
import {
  makeCampProp,
  makeFloor,
  makeTemple,
  makeTent,
  makeTunnel
} from "../src/terrain.js"
import type { Entity } from "../src/world.js"

type State = typeof GameState.Type
type Campground = NonNullable<State["campground"]>
type CampPlacement = NonNullable<Campground["campPlacements"]>[number]

const firstCamp = campgroundCamps[0]
const secondCamp = campgroundCamps[1]
if (firstCamp === undefined || secondCamp === undefined) {
  throw new Error("missing camp fixtures")
}

const campPlacement = (
  camp: CampgroundCampDefinition,
  x: number,
  y: number,
  z = 0
): CampPlacement => ({
  address: {
    districtId: camp.address.district,
    label: formatCampgroundAddress(camp.address),
    marker: camp.address.marker,
    roadId: camp.address.roadId
  },
  entranceAt: { x, y, z },
  id: camp.id,
  kind: camp.kind,
  name: camp.name,
  signAt: { x: x + 1, y, z }
})

const campground = (
  overrides: Partial<Campground> = {}
): Campground => ({
  campPlacements: [],
  contentVersion: "test",
  discoveredIds: [],
  greetedNpcKeys: [],
  landmarkPlacements: [],
  missingFlagPhase: "not-started",
  npcAssignments: [],
  publicEvent: { phase: "cooldown", nextTurn: 1_000 },
  seed: 777,
  surfaceAmbience: { nextTurn: 1_000 },
  toolFavor: { phase: "unavailable" },
  version: 1,
  waterFavor: { phase: "unavailable" },
  welcomeFavor: { phase: "unavailable" },
  ...overrides
})

const stateOf = (
  at: { readonly x: number; readonly y: number; readonly z?: number },
  campgroundState: Campground,
  extraEntities: ReadonlyArray<Entity> = [],
  fields: Partial<Omit<State, "campground" | "world">> = {}
): State => {
  const z = at.z ?? 0
  const entities: ReadonlyArray<Entity> = [
    player(at.x, at.y, z),
    makeFloor("player-floor", at.x, at.y, z),
    ...extraEntities
  ]
  return GameState.make({
    ...fields,
    campground: campgroundState,
    world: HashMap.fromIterable(
      entities.map((entity) => [entity.key, entity] as const)
    )
  })
}

const eventMessageCount = (state: State): number =>
  state.gameplayEvents?.length ?? 0

describe("campground discovery and suppression", () => {
  it("discovers only the nearest same-level place once using stable plain ids", () => {
    const nearby = campPlacement(firstCamp, 2, 0)
    const hidden = campPlacement(secondCamp, 20, 0)
    const initial = stateOf(
      { x: 0, y: 0 },
      campground({ campPlacements: [nearby, hidden] })
    )

    const discovered = advanceCampgroundAtmosphere(initial, 1)
    const repeated = advanceCampgroundAtmosphere(discovered, 2)
    const message = latestGameplayEvent(discovered)?.message ?? ""

    expect(discovered.campground?.discoveredIds).toEqual([firstCamp.id])
    expect(message).toContain(firstCamp.name)
    expect(message).toContain(formatCampgroundAddress(firstCamp.address))
    expect(message).not.toContain(secondCamp.name)
    expect(eventMessageCount(repeated)).toBe(eventMessageCount(discovered))
    expect(repeated.campground?.discoveredIds).toEqual([firstCamp.id])
  })

  it("does not discover a different level or leak distant destinations", () => {
    const otherLevel = campPlacement(firstCamp, 0, 0, 1)
    const distant = campPlacement(secondCamp, 30, 30)
    const initial = stateOf(
      { x: 0, y: 0 },
      campground({ campPlacements: [otherLevel, distant] })
    )

    const next = advanceCampgroundAtmosphere(initial, 1)

    expect(next.campground?.discoveredIds).toEqual([])
    expect(next.gameplayEvents).toBeUndefined()
  })

  it("suppresses the occupied turn without consuming due work", () => {
    const placement = campPlacement(firstCamp, 1, 0)
    const initial = stateOf(
      { x: 0, y: 0 },
      campground({
        campPlacements: [placement],
        discoveredIds: [firstCamp.id],
        publicEvent: {
          hostCampId: firstCamp.id,
          kind: "meal",
          phase: "scheduled",
          startTurn: 1
        },
        surfaceAmbience: { nextTurn: 1 }
      })
    )

    const suppressed = suppressCampgroundAtmosphere(initial, 1)
    const quiet = advanceCampgroundAtmosphere(suppressed, 1)
    const announced = advanceCampgroundAtmosphere(quiet, 2)

    expect(quiet.gameplayEvents).toBeUndefined()
    expect(quiet.campground?.publicEvent?.phase).toBe("scheduled")
    expect(announced.campground?.publicEvent?.phase).toBe("active")
    expect(announced.gameplayEvents).toHaveLength(1)
  })
})

describe("campground public events", () => {
  it("gives due event start and end announcements priority over discovery and ambient", () => {
    const placement = campPlacement(firstCamp, 1, 0)
    const content = campgroundPublicEvents.find(({ id }) => id === "meal")
    if (content === undefined) throw new Error("missing meal event")
    const initial = stateOf(
      { x: 0, y: 0 },
      campground({
        campPlacements: [placement],
        discoveredIds: [firstCamp.id],
        publicEvent: {
          hostCampId: firstCamp.id,
          kind: content.id,
          phase: "scheduled",
          startTurn: 1
        },
        surfaceAmbience: { nextTurn: 1 }
      })
    )

    const started = advanceCampgroundAtmosphere(initial, 1)
    const endTurn = started.campground?.publicEvent?.endTurn
    if (endTurn === undefined) throw new Error("missing event end turn")
    const ended = advanceCampgroundAtmosphere(started, endTurn)

    expect(started.campground?.publicEvent?.phase).toBe("active")
    expect(started.gameplayEvents?.map(({ message }) => message)).toEqual([
      content.announcement
    ])
    expect(ended.campground?.publicEvent?.phase).toBe("cooldown")
    expect(ended.gameplayEvents?.at(-1)?.message).toBe(
      content.endingAnnouncement
    )
    expect(eventMessageCount(ended)).toBe(2)
  })

  it("schedules a single event only at a discovered eligible host", () => {
    const mealCamp = campPlacement(firstCamp, 10, 10)
    const undiscovered = advanceCampgroundAtmosphere(
      stateOf(
        { x: 0, y: 0 },
        campground({
          campPlacements: [mealCamp],
          publicEvent: { phase: "cooldown", nextTurn: 1 }
        })
      ),
      1
    )
    const discovered = advanceCampgroundAtmosphere(
      stateOf(
        { x: 0, y: 0 },
        campground({
          campPlacements: [mealCamp],
          discoveredIds: [firstCamp.id],
          publicEvent: { phase: "cooldown", nextTurn: 1 }
        })
      ),
      1
    )

    expect(undiscovered.campground?.publicEvent).toMatchObject({
      phase: "cooldown"
    })
    expect(undiscovered.campground?.publicEvent?.kind).toBeUndefined()
    expect(discovered.campground?.publicEvent).toMatchObject({
      hostCampId: firstCamp.id,
      kind: "meal",
      phase: "scheduled"
    })
    expect(discovered.campground?.publicEvent?.startTurn)
      .toBeGreaterThan(1)

    const invalidActive = advanceCampgroundAtmosphere(
      stateOf(
        { x: 10, y: 10 },
        campground({
          campPlacements: [mealCamp],
          publicEvent: {
            endTurn: 100,
            hostCampId: firstCamp.id,
            kind: "meal",
            phase: "active",
            startTurn: 0
          },
          surfaceAmbience: { nextTurn: 1 }
        })
      ),
      1
    )
    const meal = campgroundPublicEvents.find(({ id }) => id === "meal")

    expect(invalidActive.campground?.publicEvent?.phase).toBe("cooldown")
    expect(meal?.ambient).not.toContain(
      latestGameplayEvent(invalidActive)?.message
    )
    expect(latestGameplayEvent(invalidActive)?.message).not.toBe(
      meal?.announcement
    )
  })
})

describe("campground ambient zones", () => {
  it("uses frequent heavy-rain ambience without immediate repetition", () => {
    const placement = campPlacement(firstCamp, 0, 0)
    const initial = stateOf(
      { x: 0, y: 0 },
      campground({
        campPlacements: [placement],
        discoveredIds: [firstCamp.id],
        surfaceAmbience: { nextTurn: 1 }
      })
    )

    const first = advanceCampgroundAtmosphere(initial, 1)
    const firstMessage = latestGameplayEvent(first)?.message
    const firstNextTurn = first.campground?.surfaceAmbience?.nextTurn
    const firstCampgroundState = first.campground
    if (firstCampgroundState === undefined) {
      throw new Error("missing normalized campground")
    }
    const dueAgain = GameState.make({
      ...first,
      campground: {
        ...firstCampgroundState,
        surfaceAmbience: {
          ...firstCampgroundState.surfaceAmbience,
          nextTurn: 2
        }
      }
    })
    const second = advanceCampgroundAtmosphere(dueAgain, 2)
    const secondMessage = latestGameplayEvent(second)?.message

    expect(campgroundHeavyRainOutdoorAmbient).toContain(firstMessage)
    expect(firstNextTurn).toBeGreaterThanOrEqual(7)
    expect(firstNextTurn).toBeLessThanOrEqual(13)
    expect(first.campground?.surfaceAmbience?.zoneId).toBe(
      `rain:outdoor:camp:${firstCamp.id}`
    )
    expect(latestGameplayEvent(first)?.interruptsTravel).toBe(false)
    expect(secondMessage).not.toBe(firstMessage)
    expect(eventMessageCount(second)).toBe(2)
  })

  it("distinguishes outdoor rain from tents, the temple, and the arrival gate", () => {
    const due = campground({ surfaceAmbience: { nextTurn: 1 } })
    const outdoor = advanceCampgroundAtmosphere(
      stateOf({ x: 0, y: 0 }, due),
      1
    )
    const tent = advanceCampgroundAtmosphere(
      stateOf(
        { x: 0, y: 0 },
        due,
        [makeTent("tent-roof", 0, 0, 0)]
      ),
      1
    )
    const gate = advanceCampgroundAtmosphere(
      stateOf(
        { x: 0, y: 0 },
        due,
        [makeCampProp("arrival-gate", 0, 0, 0, "arrival-gate")]
      ),
      1
    )
    const temple = advanceCampgroundAtmosphere(
      stateOf(
        { x: 0, y: 2 },
        due,
        [makeTemple("temple", 0, 0, 0)]
      ),
      1
    )
    const underground = advanceCampgroundAtmosphere(
      stateOf(
        { x: 0, y: 0, z: 1 },
        campground({ surfaceAmbience: { nextTurn: 1 } }),
        [makeTunnel("dungeon-tunnel", 0, 0, 1)]
      ),
      1
    )

    expect(campgroundHeavyRainOutdoorAmbient).toContain(
      latestGameplayEvent(outdoor)?.message
    )
    expect(campgroundHeavyRainShelterAmbient).toContain(
      latestGameplayEvent(tent)?.message
    )
    expect(campgroundHeavyRainShelterAmbient).toContain(
      latestGameplayEvent(gate)?.message
    )
    expect(campgroundHeavyRainShelterAmbient).toContain(
      latestGameplayEvent(temple)?.message
    )
    expect(tent.campground?.surfaceAmbience?.zoneId).toContain(
      "rain:sheltered:"
    )
    expect(gate.campground?.surfaceAmbience?.zoneId).toContain(
      "rain:sheltered:"
    )
    expect(temple.campground?.surfaceAmbience?.zoneId).toContain(
      "rain:sheltered:"
    )
    expect(underground.gameplayEvents).toBeUndefined()
  })
})

describe("world atmosphere dispatch", () => {
  it("increments the world turn exactly once for surface and dungeon branches", () => {
    const surface = stateOf(
      { x: 0, y: 0 },
      campground({ surfaceAmbience: { nextTurn: 1 } }),
      [],
      { turn: 0 }
    )
    const dungeon = stateOf(
      { x: 0, y: 0, z: 1 },
      campground(),
      [makeTunnel("dungeon-tunnel", 0, 0, 1)],
      { nextDungeonAmbientTurn: 1, turn: 0 }
    )

    const nextSurface = Effect.runSync(advanceWorldAtmosphere(surface))
    const nextDungeon = Effect.runSync(advanceWorldAtmosphere(dungeon))

    expect(nextSurface.turn).toBe(1)
    expect(nextDungeon.turn).toBe(1)
    expect(campgroundHeavyRainOutdoorAmbient).toContain(
      latestGameplayEvent(nextSurface)?.message
    )
    expect(firstDungeonAmbientSounds).toContain(
      latestGameplayEvent(nextDungeon)?.message
    )
  })
})
