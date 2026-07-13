import { describe, expect, it } from "@effect/vitest"
import { EAction, GameState } from "@flaghack/domain/schemas"
import { Effect, HashMap } from "effect"
import { doAction } from "../src/actions.js"
import {
  campgroundCamps,
  formatCampgroundAddress
} from "../src/campground.js"
import { talkCampgroundAction } from "../src/campgroundActions.js"
import {
  CAMPGROUND_BORROWED_TOOL_KEY,
  CAMPGROUND_MISSING_FLAG_KEY,
  CAMPGROUND_WATER_REWARD_KEY,
  CAMPGROUND_WELCOME_REWARD_KEY,
  progressCampgroundConversation,
  reconcileCampgroundProgress,
  transitionCampgroundFavor
} from "../src/campgroundProgress.js"
import { campgroundViewForState } from "../src/campgroundState.js"
import { makeHippie, makeRanger, player } from "../src/creatures.js"
import { latestGameplayEvent } from "../src/gameplayEvents.js"
import {
  makeCooler,
  makeGroundFlag,
  makeGroundHammer,
  makeWaterBottle
} from "../src/items.js"
import { makeFloor, makeTunnel } from "../src/terrain.js"
import type { Entity } from "../src/world.js"

type State = typeof GameState.Type
type Campground = NonNullable<State["campground"]>

const campById = (id: string) => {
  const camp = campgroundCamps.find((candidate) => candidate.id === id)
  if (camp === undefined) throw new Error(`missing ${id}`)
  return camp
}

const campPlacement = (
  id: "dusty-spoon" | "patch-bay" | "pulse-dome",
  x: number
): NonNullable<Campground["campPlacements"]>[number] => {
  const camp = campById(id)
  return {
    address: {
      districtId: camp.address.district,
      label: formatCampgroundAddress(camp.address),
      marker: camp.address.marker,
      roadId: camp.address.roadId
    },
    entranceAt: { x, y: 0, z: 0 },
    id,
    kind: camp.kind,
    name: camp.name,
    signAt: { x, y: 1, z: 0 },
    signKey: `${id}-sign`
  }
}

const assignments: NonNullable<Campground["npcAssignments"]> = [
  {
    homeAt: { x: 1, y: 0, z: 0 },
    landmarkId: "arrival-plaza",
    npcKey: "greeter",
    role: "civic"
  },
  {
    campId: "dusty-spoon",
    homeAt: { x: 2, y: 0, z: 0 },
    npcKey: "dusty-host",
    role: "host"
  },
  {
    homeAt: { x: 3, y: 0, z: 0 },
    landmarkId: "central-effigy",
    npcKey: "effigy-worker",
    role: "civic"
  },
  {
    campId: "pulse-dome",
    homeAt: { x: 4, y: 0, z: 0 },
    npcKey: "pulse-host",
    role: "host"
  },
  {
    homeAt: { x: 5, y: 0, z: 0 },
    landmarkId: "temple",
    npcKey: "temple-caretaker",
    role: "civic"
  }
]

const baseCampground = (
  overrides: Partial<Campground> = {}
): Campground => ({
  campPlacements: [
    campPlacement("dusty-spoon", 2),
    campPlacement("patch-bay", 6),
    campPlacement("pulse-dome", 10)
  ],
  contentVersion: "campground-v1",
  discoveredIds: ["arrival-plaza"],
  greetedNpcKeys: [],
  landmarkPlacements: [{
    address: { label: "Gate and Main Road" },
    at: { x: 0, y: 0, z: 0 },
    id: "arrival-plaza",
    kind: "civic",
    name: "Arrival Plaza",
    travelAt: { x: 0, y: 0, z: 0 }
  }, {
    address: { label: "Center Junction" },
    at: { x: 3, y: 0, z: 0 },
    id: "central-effigy",
    kind: "effigy",
    name: "The Effigy",
    travelAt: { x: 3, y: 0, z: 0 }
  }, {
    address: { label: "Far end of Temple Road" },
    at: { x: 5, y: 0, z: 0 },
    id: "temple",
    kind: "temple",
    name: "The Temple",
    travelAt: { x: 5, y: 0, z: 0 }
  }],
  missingFlagKey: CAMPGROUND_MISSING_FLAG_KEY,
  missingFlagOwnerNpcKey: "greeter",
  missingFlagPhase: "not-started",
  npcAssignments: assignments,
  publicEvent: { phase: "cooldown" },
  seed: 777,
  surfaceAmbience: {},
  toolFavor: {
    phase: "unavailable",
    requiredItemKey: CAMPGROUND_BORROWED_TOOL_KEY
  },
  version: 1,
  waterFavor: { phase: "unavailable" },
  welcomeFavor: { phase: "unavailable" },
  ...overrides
})

const baseEntities = (): ReadonlyArray<Entity> => [
  player(0, 0, 0),
  makeFloor("surface-floor", 0, 0, 0),
  makeRanger("greeter", 1, 0, 0, "Alex"),
  makeHippie("dusty-host", 2, 0, 0),
  makeHippie("effigy-worker", 3, 0, 0),
  makeHippie("pulse-host", 4, 0, 0),
  makeHippie("temple-caretaker", 5, 0, 0),
  makeCooler("patch-cooler", 6, 1, 0)
]

const stateOf = (
  entities: ReadonlyArray<Entity> = baseEntities(),
  campground: Campground = baseCampground(),
  extras: Omit<Partial<State>, "campground" | "world"> = {}
): State =>
  GameState.make({
    campground,
    ...extras,
    world: HashMap.fromIterable(
      entities.map((entity) => [entity.key, entity] as const)
    )
  })

const entityByKey = (state: State, key: string): Entity | undefined =>
  Array.from(state.world.pipe(HashMap.values)).find((entity) =>
    entity.key === key
  )

const assignment = (key: string) => {
  const found = assignments.find(({ npcKey }) => npcKey === key)
  if (found === undefined) throw new Error(`missing assignment ${key}`)
  return found
}

const conversationalText = (message: string | undefined): string =>
  (message ?? "").toLocaleLowerCase()

describe("campground favor state machines", () => {
  it("moves every favor phase forward idempotently while preserving keys", () => {
    const offered = transitionCampgroundFavor(
      { phase: "unavailable", giverNpcKey: "giver" },
      "offer"
    )
    const active = transitionCampgroundFavor(offered, "activate")
    const ready = transitionCampgroundFavor(active, "ready", {
      requiredItemKey: "exact-item"
    })
    const completed = transitionCampgroundFavor(ready, "complete", {
      rewardGranted: true
    })

    expect([offered.phase, active.phase, ready.phase, completed.phase])
      .toEqual([
        "offered",
        "active",
        "ready",
        "completed"
      ])
    expect(completed).toMatchObject({
      giverNpcKey: "giver",
      requiredItemKey: "exact-item",
      rewardGranted: true
    })
    expect(transitionCampgroundFavor(completed, "activate")).toEqual(
      completed
    )
  })

  it("passes the greeter's verbal message to Dusty Spoon and grants one pancake", () => {
    const initial = stateOf()
    const playerEntity = entityByKey(initial, "player")
    const greeter = entityByKey(initial, "greeter")
    const host = entityByKey(initial, "dusty-host")
    if (
      playerEntity === undefined || greeter === undefined
      || host === undefined
    ) {
      throw new Error("missing actors")
    }

    const started = progressCampgroundConversation(
      initial,
      playerEntity,
      greeter,
      assignment("greeter")
    )
    const completed = progressCampgroundConversation(
      started.state,
      playerEntity,
      host,
      assignment("dusty-host")
    )
    const repeated = progressCampgroundConversation(
      completed.state,
      playerEntity,
      host,
      assignment("dusty-host")
    )

    expect(started.state.campground?.welcomeFavor).toMatchObject({
      giverNpcKey: "greeter",
      phase: "active"
    })
    expect(started.state.campground?.missingFlagPhase).toBe(
      "seeking-rumors"
    )
    expect(completed.state.campground?.welcomeFavor).toMatchObject({
      phase: "completed",
      recipientNpcKey: "dusty-host",
      rewardGranted: true
    })
    expect(completed.state.campground?.missingFlagPhase).toBe(
      "temple-lead"
    )
    expect(completed.state.campground?.discoveredIds).toContain(
      "dusty-spoon"
    )
    expect(entityByKey(completed.state, CAMPGROUND_WELCOME_REWARD_KEY))
      .toMatchObject({
        _tag: "pancake",
        in: "player"
      })
    expect(
      Array.from(repeated.state.world.pipe(HashMap.values)).filter((
        { key }
      ) => key === CAMPGROUND_WELCOME_REWARD_KEY)
    ).toHaveLength(1)
    for (const message of [started.message, completed.message]) {
      expect(conversationalText(message)).not.toContain("quest")
      expect(conversationalText(message)).not.toContain("objective")
      expect(conversationalText(message)).not.toContain("complete")
    }
  })

  it("accepts only the exact Patch Bay hammer and transfers it once", () => {
    const exact = makeGroundHammer(
      CAMPGROUND_BORROWED_TOOL_KEY,
      { x: 0, y: 0, z: 0 }
    )
    const wrong = makeGroundHammer("wrong-hammer", { x: 0, y: 0, z: 0 })
    const initial = stateOf([
      ...baseEntities(),
      { ...exact, in: "player" },
      { ...wrong, in: "player" }
    ], baseCampground({ missingFlagPhase: "seeking-rumors" }))
    const playerEntity = entityByKey(initial, "player")
    const worker = entityByKey(initial, "effigy-worker")
    if (playerEntity === undefined || worker === undefined) {
      throw new Error("missing actors")
    }

    const ready = reconcileCampgroundProgress(
      stateOf(
        [...baseEntities(), { ...exact, in: "player" }, {
          ...wrong,
          in: "player"
        }],
        baseCampground({
          missingFlagPhase: "seeking-rumors",
          toolFavor: {
            phase: "active",
            requiredItemKey: CAMPGROUND_BORROWED_TOOL_KEY
          }
        })
      ),
      { emitMessages: false }
    )
    expect(ready.campground?.toolFavor?.phase).toBe("ready")

    const completed = progressCampgroundConversation(
      initial,
      playerEntity,
      worker,
      assignment("effigy-worker")
    )
    const repeated = progressCampgroundConversation(
      completed.state,
      playerEntity,
      worker,
      assignment("effigy-worker")
    )

    expect(completed.state.campground?.toolFavor).toMatchObject({
      phase: "completed",
      recipientNpcKey: "effigy-worker",
      requiredItemKey: CAMPGROUND_BORROWED_TOOL_KEY,
      rewardGranted: true
    })
    expect(completed.state.campground?.missingFlagPhase).toBe(
      "temple-lead"
    )
    expect(completed.state.campground?.discoveredIds).not.toContain(
      "patch-bay"
    )
    expect(
      campgroundViewForState(completed.state).discoveredLandmarks.some(
        ({ id }) => id === "patch-bay"
      )
    ).toBe(false)
    expect(entityByKey(completed.state, CAMPGROUND_BORROWED_TOOL_KEY)?.in)
      .toBe(
        "effigy-worker"
      )
    expect(entityByKey(completed.state, "wrong-hammer")?.in).toBe("player")
    expect(repeated.state.campground?.toolFavor?.phase).toBe("completed")
  })

  it("takes one held water at Pulse Dome and grants one repeat-safe reward", () => {
    const water = makeWaterBottle("water", 0, 0, 0, "player")
    const initial = stateOf([...baseEntities(), water])
    const playerEntity = entityByKey(initial, "player")
    const host = entityByKey(initial, "pulse-host")
    if (playerEntity === undefined || host === undefined) {
      throw new Error("missing actors")
    }

    const completed = progressCampgroundConversation(
      initial,
      playerEntity,
      host,
      assignment("pulse-host")
    )
    const repeated = progressCampgroundConversation(
      completed.state,
      playerEntity,
      host,
      assignment("pulse-host")
    )

    expect(completed.state.campground?.waterFavor).toMatchObject({
      phase: "completed",
      recipientNpcKey: "pulse-host",
      rewardGranted: true
    })
    expect(entityByKey(completed.state, "water")?.in).toBe("pulse-host")
    expect(entityByKey(completed.state, CAMPGROUND_WATER_REWARD_KEY))
      .toMatchObject({
        _tag: "trailmix",
        in: "player"
      })
    expect(
      Array.from(repeated.state.world.pipe(HashMap.values)).filter((
        { key }
      ) => key === CAMPGROUND_WATER_REWARD_KEY)
    ).toHaveLength(1)
  })
})

describe("missing flag reconciliation", () => {
  it("recognizes only the exact flag when picked up early", () => {
    const exact = {
      ...makeGroundFlag(CAMPGROUND_MISSING_FLAG_KEY, { x: 0, y: 0, z: 0 }),
      in: "player"
    } as Entity
    const wrong = {
      ...makeGroundFlag("wrong-flag", { x: 0, y: 0, z: 0 }),
      in: "player"
    } as Entity
    const exactState = reconcileCampgroundProgress(stateOf([
      ...baseEntities(),
      exact,
      wrong
    ]))
    const wrongState = reconcileCampgroundProgress(stateOf([
      ...baseEntities(),
      wrong
    ]))

    expect(exactState.campground?.missingFlagPhase).toBe("flag-retrieved")
    expect(latestGameplayEvent(exactState)?.message).toContain("stitching")
    expect(wrongState.campground?.missingFlagPhase).toBe("not-started")
  })

  it("returns the exact flag to its stored owner once through normal talk", () => {
    const exact = {
      ...makeGroundFlag(CAMPGROUND_MISSING_FLAG_KEY, { x: 0, y: 0, z: 0 }),
      in: "player"
    } as Entity
    const initial = stateOf(
      [...baseEntities(), exact],
      baseCampground({ missingFlagPhase: "flag-retrieved" }),
      { turn: 9 }
    )
    const actor = entityByKey(initial, "player")
    if (actor === undefined) throw new Error("missing player")

    const returned = talkCampgroundAction(initial, actor, "E")
    const repeated = talkCampgroundAction(returned, actor, "E")

    expect(returned.campground?.missingFlagPhase).toBe("returned")
    expect(entityByKey(returned, CAMPGROUND_MISSING_FLAG_KEY)?.in).toBe(
      "greeter"
    )
    expect(returned.gameplayEvents).toHaveLength(1)
    expect(conversationalText(latestGameplayEvent(returned)?.message))
      .not.toContain("complete")
    expect(repeated.campground?.missingFlagPhase).toBe("returned")
    expect(entityByKey(repeated, CAMPGROUND_MISSING_FLAG_KEY)?.in).toBe(
      "greeter"
    )
  })

  it("runs exact-flag reconciliation after an ordinary pickup action", () => {
    const exact = makeGroundFlag(
      CAMPGROUND_MISSING_FLAG_KEY,
      { x: 0, y: 0, z: 0 }
    )
    const initial = stateOf([...baseEntities(), exact])
    const actor = entityByKey(initial, "player")
    if (actor === undefined) throw new Error("missing player")

    const pickedUp = Effect.runSync(doAction(initial, {
      action: EAction.pickupMulti({ keys: [CAMPGROUND_MISSING_FLAG_KEY] }),
      entity: actor
    }))

    expect(entityByKey(pickedUp, CAMPGROUND_MISSING_FLAG_KEY)?.in).toBe(
      "player"
    )
    expect(pickedUp.campground?.missingFlagPhase).toBe("flag-retrieved")
  })
})

describe("legacy progress entity repair", () => {
  const dungeonTunnels = (): ReadonlyArray<Entity> => [
    makeTunnel("tunnel-1", 1, 1, 1),
    makeTunnel("tunnel-2", 2, 1, 1),
    makeTunnel("tunnel-3", 3, 1, 1),
    makeTunnel("tunnel-4", 3, 2, 1),
    makeTunnel("tunnel-5", 3, 3, 1)
  ]

  it("repairs the flag at a deterministic reachable unoccupied dead end", () => {
    const initial = stateOf([...baseEntities(), ...dungeonTunnels()])
    const first = reconcileCampgroundProgress(initial, {
      emitMessages: false
    })
    const second = reconcileCampgroundProgress(first, {
      emitMessages: false
    })

    expect(entityByKey(first, CAMPGROUND_MISSING_FLAG_KEY)).toMatchObject({
      _tag: "flag",
      at: { x: 3, y: 3, z: 1 },
      in: "world"
    })
    expect(
      Array.from(second.world.pipe(HashMap.values)).filter(({ key }) =>
        key === CAMPGROUND_MISSING_FLAG_KEY
      )
    ).toHaveLength(1)

    const returned = reconcileCampgroundProgress(
      stateOf(
        [...baseEntities(), ...dungeonTunnels()],
        baseCampground({ missingFlagPhase: "returned" })
      ),
      { emitMessages: false }
    )
    expect(entityByKey(returned, CAMPGROUND_MISSING_FLAG_KEY))
      .toBeUndefined()
  })

  it("defers keyless flag repair until the player enters the dungeon", () => {
    const initial = stateOf(
      [...baseEntities(), ...dungeonTunnels()],
      baseCampground({ missingFlagKey: undefined })
    )
    const surface = reconcileCampgroundProgress(initial, {
      emitMessages: false
    })
    const actor = entityByKey(surface, "player")
    if (actor === undefined) throw new Error("missing player")
    const underground = {
      ...surface,
      world: surface.world.pipe(
        HashMap.set(actor.key, {
          ...actor,
          at: { x: 1, y: 1, z: 1 }
        })
      )
    }
    const repaired = reconcileCampgroundProgress(underground, {
      emitMessages: false
    })

    expect(entityByKey(surface, CAMPGROUND_MISSING_FLAG_KEY))
      .toBeUndefined()
    expect(entityByKey(repaired, CAMPGROUND_MISSING_FLAG_KEY))
      .toMatchObject({
        _tag: "flag",
        at: { x: 3, y: 3, z: 1 },
        in: "world"
      })
  })

  it("repairs the borrowed hammer at Patch Bay and never recreates it after completion", () => {
    const first = reconcileCampgroundProgress(stateOf(), {
      emitMessages: false
    })
    const hammer = entityByKey(first, CAMPGROUND_BORROWED_TOOL_KEY)

    expect(hammer).toMatchObject({
      _tag: "hammer",
      in: "patch-cooler"
    })
    const completed = reconcileCampgroundProgress(
      stateOf(
        baseEntities(),
        baseCampground({
          toolFavor: {
            phase: "completed",
            requiredItemKey: CAMPGROUND_BORROWED_TOOL_KEY,
            rewardGranted: true
          }
        })
      ),
      { emitMessages: false }
    )
    expect(entityByKey(completed, CAMPGROUND_BORROWED_TOOL_KEY))
      .toBeUndefined()
  })

  it("waives an irreparable borrowed tool once with a natural message", () => {
    const withoutPatch = baseCampground({
      campPlacements: [campPlacement("dusty-spoon", 2)]
    })
    const first = reconcileCampgroundProgress(stateOf(
      baseEntities().filter(({ key }) => key !== "patch-cooler"),
      withoutPatch
    ))
    const second = reconcileCampgroundProgress(first)

    expect(first.campground?.toolFavor).toMatchObject({
      phase: "completed",
      rewardGranted: true
    })
    expect(latestGameplayEvent(first)?.message).toContain(
      "wrote that hammer off"
    )
    expect(second.gameplayEvents).toHaveLength(
      first.gameplayEvents?.length ?? 0
    )
  })
})
