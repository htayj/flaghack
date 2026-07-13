import { describe, expect, it } from "@effect/vitest"
import { EAction, GameState } from "@flaghack/domain/schemas"
import { Effect, HashMap } from "effect"
import { doAction } from "../src/actions.js"
import {
  campgroundCamps,
  formatCampgroundAddress
} from "../src/campground.js"
import {
  talkCampgroundAction,
  travelStepCampgroundAction
} from "../src/campgroundActions.js"
import {
  campgroundViewForState,
  markCampgroundDiscovery,
  normalizeCampgroundState
} from "../src/campgroundState.js"
import { makeHippie, makeRanger, player } from "../src/creatures.js"
import { latestGameplayEvent } from "../src/gameplayEvents.js"
import {
  makeCampProp,
  makeFloor,
  makeSign,
  makeTunnel,
  makeWall
} from "../src/terrain.js"
import type { Entity } from "../src/world.js"

type State = typeof GameState.Type

const flagLab = campgroundCamps.find(({ id }) => id === "flag-lab")
if (flagLab === undefined) throw new Error("missing Flag Lab fixture")

const flagLabSign = `${flagLab.name} — ${
  formatCampgroundAddress(flagLab.address)
}`

const stateOf = (
  entities: ReadonlyArray<Entity>,
  overrides: Omit<Partial<State>, "world"> = {}
): State =>
  GameState.make({
    ...overrides,
    world: HashMap.fromIterable(
      entities.map((entity) => [entity.key, entity] as const)
    )
  })

const floorRectangle = (
  width: number,
  height: number
): ReadonlyArray<Entity> =>
  Array.from(
    { length: height },
    (_, y) =>
      Array.from({ length: width }, (_, x) =>
        makeFloor(`floor-${x}-${y}`, x, y, 0))
  ).flat()

const addressedRoad = (width: number): ReadonlyArray<Entity> => [
  ...floorRectangle(width, 3),
  ...Array.from(
    { length: width },
    (_, x) => makeTunnel(`road-${x}`, x, 0, 0)
  ),
  makeSign("flag-lab-sign", width - 1, 0, 0, flagLabSign)
]

const entityByKey = (state: State, key: string): Entity | undefined =>
  Array.from(state.world.pipe(HashMap.values)).find((entity) =>
    entity.key === key
  )

describe("campground talk action", () => {
  const greeterFixture = (): State =>
    normalizeCampgroundState(stateOf([
      ...addressedRoad(8),
      player(0, 1, 0),
      makeCampProp("arrival-gate", 0, 0, 0, "arrival-gate"),
      makeRanger("greeter", 1, 1, 0, "Alex"),
      makeHippie("unrelated", 6, 2, 0)
    ], { turn: 7 }))

  it("advances and greets the initial ranger once with one gameplay event", () => {
    const initial = greeterFixture()
    const actor = entityByKey(initial, "player")
    if (actor === undefined) throw new Error("missing player")

    const first = talkCampgroundAction(initial, actor, "E")
    const second = talkCampgroundAction(first, actor, "E")

    expect(first.campground?.missingFlagPhase).toBe("seeking-rumors")
    expect(first.campground?.welcomeFavor).toEqual({
      giverNpcKey: "greeter",
      phase: "active"
    })
    expect(first.campground?.greetedNpcKeys).toEqual(["greeter"])
    expect(first.campground?.surfaceAmbience?.lastMessageTurn).toBe(8)
    expect(first.gameplayEvents).toHaveLength(1)
    expect(latestGameplayEvent(first)?.message.length).toBeGreaterThan(0)
    expect(second.campground?.missingFlagPhase).toBe("seeking-rumors")
    expect(second.campground?.welcomeFavor).toEqual(
      first.campground?.welcomeFavor
    )
    expect(second.campground?.greetedNpcKeys).toEqual(["greeter"])
    expect(second.gameplayEvents).toHaveLength(2)
    expect(entityByKey(second, "unrelated")).toEqual(
      entityByKey(initial, "unrelated")
    )
  })

  it("does not volunteer a hidden route when no destination was requested", () => {
    const base = normalizeCampgroundState(stateOf([
      ...addressedRoad(8),
      player(0, 1, 0),
      makeRanger("ranger", 1, 1, 0, "Dusty")
    ], { turn: 3 }))
    if (base.campground === undefined) throw new Error("missing state")
    const routed: State = {
      ...base,
      campground: {
        ...base.campground,
        missingFlagPhase: "seeking-rumors",
        npcAssignments: [{
          homeAt: { x: 1, y: 1, z: 0 },
          npcKey: "ranger",
          role: "patrol"
        }]
      }
    }
    const actor = entityByKey(routed, "player")
    if (actor === undefined) throw new Error("missing player")

    const next = talkCampgroundAction(routed, actor, "E")
    const message = latestGameplayEvent(next)?.message ?? ""

    expect(message).not.toMatch(/^Head (north|south|east|west)/)
    expect(message).not.toContain("Dusty Way")
    expect(message).not.toContain(flagLab.address.marker)
    expect(message).not.toContain(flagLab.name)
  })

  it("emits concise invalid-target messages without greeting or moving NPCs", () => {
    const initial = greeterFixture()
    const actor = entityByKey(initial, "player")
    if (actor === undefined) throw new Error("missing player")
    const beforeGreeter = entityByKey(initial, "greeter")

    const empty = talkCampgroundAction(initial, actor, "W")

    expect(latestGameplayEvent(empty)?.message).toBe(
      "Nobody is there to talk to."
    )
    expect(empty.campground?.greetedNpcKeys).toEqual([])
    expect(entityByKey(empty, "greeter")).toEqual(beforeGreeter)

    const crowded = normalizeCampgroundState(stateOf([
      ...addressedRoad(4),
      player(0, 1, 0),
      makeHippie("hippie-a", 1, 1, 0),
      makeHippie("hippie-b", 1, 1, 0)
    ]))
    const crowdedActor = entityByKey(crowded, "player")
    if (crowdedActor === undefined) throw new Error("missing player")
    const ambiguous = talkCampgroundAction(crowded, crowdedActor, "E")

    expect(latestGameplayEvent(ambiguous)?.message).toBe(
      "Choose one person to talk to."
    )
    expect(ambiguous.campground?.greetedNpcKeys).toEqual([])
  })

  it("is player-only and is integrated through doAction", () => {
    const initial = greeterFixture()
    const actor = entityByKey(initial, "player")
    const greeter = entityByKey(initial, "greeter")
    if (actor === undefined || greeter === undefined) {
      throw new Error("missing actors")
    }

    expect(talkCampgroundAction(initial, greeter, "W")).toBe(initial)

    const integrated = Effect.runSync(doAction(initial, {
      action: EAction.talk({ dir: "E" }),
      entity: actor
    }))
    expect(integrated.campground?.greetedNpcKeys).toEqual(["greeter"])
    expect(integrated.gameplayEvents).toHaveLength(1)
  })
})

describe("campground travel-step action", () => {
  const travelFixture = (
    extras: ReadonlyArray<Entity> = []
  ): State =>
    normalizeCampgroundState(stateOf([
      ...addressedRoad(8),
      player(0, 1, 0),
      ...extras
    ]))

  it("moves exactly one authoritative legal tile toward a discovered camp", () => {
    const initial = markCampgroundDiscovery(travelFixture(), flagLab.id)
    const actor = entityByKey(initial, "player")
    if (actor === undefined) throw new Error("missing player")

    const next = travelStepCampgroundAction(initial, actor, flagLab.id)
    const moved = entityByKey(next, "player")

    expect(moved?.at).toEqual({ x: 1, y: 0, z: 0 })
    expect(
      Math.max(
        Math.abs((moved?.at.x ?? 0) - actor.at.x),
        Math.abs((moved?.at.y ?? 0) - actor.at.y)
      )
    ).toBe(1)
    expect(next.gameplayEvents ?? []).toEqual([])
    expect(next.campground?.activeTravel).toMatchObject({
      destinationId: flagLab.id,
      nextIndex: 2
    })
  })

  it("reuses a hidden route and replans after divergence or a new blocker", () => {
    const initial = markCampgroundDiscovery(travelFixture(), flagLab.id)
    const actor = entityByKey(initial, "player")
    if (actor === undefined) throw new Error("missing player")
    const first = travelStepCampgroundAction(initial, actor, flagLab.id)
    const firstActor = entityByKey(first, "player")
    if (firstActor === undefined) throw new Error("missing moved player")
    const originalPath = first.campground?.activeTravel?.path

    const reused = travelStepCampgroundAction(
      first,
      firstActor,
      flagLab.id
    )
    expect(entityByKey(reused, "player")?.at).toEqual(originalPath?.at(2))
    expect(reused.campground?.activeTravel?.path).toEqual(originalPath)

    const divergedActor: Entity = {
      ...firstActor,
      at: { x: 0, y: 2, z: 0 }
    }
    const diverged: State = {
      ...first,
      world: first.world.pipe(
        HashMap.set<string, Entity>(divergedActor.key, divergedActor)
      )
    }
    const replanned = travelStepCampgroundAction(
      diverged,
      divergedActor,
      flagLab.id
    )
    expect(replanned.campground?.activeTravel?.path.at(0)).toEqual(
      divergedActor.at
    )

    const blockedStep = originalPath?.at(2)
    if (blockedStep === undefined) throw new Error("missing cached step")
    const blocker = makeWall(
      "new-blocker",
      blockedStep.x,
      blockedStep.y,
      blockedStep.z
    )
    const blocked: State = {
      ...first,
      world: first.world.pipe(
        HashMap.set<string, Entity>(blocker.key, blocker)
      )
    }
    const aroundBlocker = travelStepCampgroundAction(
      blocked,
      firstActor,
      flagLab.id
    )
    expect(entityByKey(aroundBlocker, "player")?.at).not.toEqual(
      blockedStep
    )
    expect(aroundBlocker.campground?.activeTravel?.path.at(0)).toEqual(
      firstActor.at
    )
  })

  it("uses a small movement world only for adjacent-step validation", () => {
    const initial = markCampgroundDiscovery(travelFixture(), flagLab.id)
    const actor = entityByKey(initial, "player")
    if (actor === undefined) throw new Error("missing player")
    const expected = travelStepCampgroundAction(initial, actor, flagLab.id)
    const expectedActor = entityByKey(expected, "player")
    if (expectedActor === undefined) {
      throw new Error("missing moved player")
    }

    const validationWorld = HashMap.fromIterable(
      Array.from(initial.world.pipe(HashMap.values))
        .filter((entity) => entity.at.x <= 1 && entity.at.y <= 1)
        .map((entity) => [entity.key, entity] as const)
    )
    const moved = Effect.runSync(doAction(initial, {
      action: EAction.travelStep({ landmarkId: flagLab.id }),
      entity: actor
    }, { movementWorld: validationWorld }))

    expect(entityByKey(moved, "player")?.at).toEqual(expectedActor.at)
    expect(moved.campground?.activeTravel?.path).toEqual(
      expected.campground?.activeTravel?.path
    )

    const validationOnlyBlocker: Entity = makeWall(
      "validation-only-blocker",
      expectedActor.at.x,
      expectedActor.at.y,
      expectedActor.at.z
    )
    const blocked = Effect.runSync(doAction(initial, {
      action: EAction.travelStep({ landmarkId: flagLab.id }),
      entity: actor
    }, {
      movementWorld: validationWorld.pipe(
        HashMap.set<string, Entity>(
          validationOnlyBlocker.key,
          validationOnlyBlocker
        )
      )
    }))

    expect(entityByKey(blocked, "player")?.at).toEqual(actor.at)
    expect(entityByKey(blocked, validationOnlyBlocker.key)).toBeUndefined()
    expect(latestGameplayEvent(blocked)?.message).toBe(
      "Travel is blocked."
    )
  })

  it("rejects hidden destinations without leaking their metadata", () => {
    const initial = travelFixture()
    const actor = entityByKey(initial, "player")
    if (actor === undefined) throw new Error("missing player")

    const next = travelStepCampgroundAction(initial, actor, flagLab.id)
    const message = latestGameplayEvent(next)?.message ?? ""

    expect(entityByKey(next, "player")?.at).toEqual(actor.at)
    expect(message).toBe("That campground destination is not available.")
    expect(message).not.toContain(flagLab.id)
    expect(message).not.toContain(flagLab.name)
    expect(message).not.toContain(String(flagLab.slot))
  })

  it("reports moving blockers and diagonal corner seals without moving", () => {
    const sealed = markCampgroundDiscovery(
      travelFixture([
        makeWall("wall-north", 0, 0, 0),
        makeWall("wall-east", 1, 1, 0),
        makeWall("wall-south", 0, 2, 0)
      ]),
      flagLab.id
    )
    const actor = entityByKey(sealed, "player")
    if (actor === undefined) throw new Error("missing player")

    const next = travelStepCampgroundAction(sealed, actor, flagLab.id)

    expect(entityByKey(next, "player")?.at).toEqual(actor.at)
    expect(latestGameplayEvent(next)?.message).toBe("Travel is blocked.")
  })

  it("is integrated through doAction and rejects non-player actors", () => {
    const initial = markCampgroundDiscovery(
      travelFixture([makeHippie("hippie", 7, 2, 0)]),
      flagLab.id
    )
    const actor = entityByKey(initial, "player")
    const hippie = entityByKey(initial, "hippie")
    if (actor === undefined || hippie === undefined) {
      throw new Error("missing actors")
    }
    expect(travelStepCampgroundAction(initial, hippie, flagLab.id)).toBe(
      initial
    )

    const integrated = Effect.runSync(doAction(initial, {
      action: EAction.travelStep({ landmarkId: flagLab.id }),
      entity: actor
    }))
    expect(entityByKey(integrated, "player")?.at).toEqual({
      x: 1,
      y: 0,
      z: 0
    })
  })

  it("never projects the persisted hidden route", () => {
    const initial = markCampgroundDiscovery(travelFixture(), flagLab.id)
    if (initial.campground === undefined) throw new Error("missing state")
    const withHiddenPath: State = {
      ...initial,
      campground: {
        ...initial.campground,
        activeTravel: {
          destinationId: flagLab.id,
          nextIndex: 1,
          path: [{ x: 12_345, y: 54_321, z: 0 }]
        }
      }
    }
    const projection = JSON.stringify(
      campgroundViewForState(withHiddenPath)
    )

    expect(projection).not.toContain("activeTravel")
    expect(projection).not.toContain("path")
    expect(projection).not.toContain("12345")
    expect(projection).not.toContain("54321")
  })
})
