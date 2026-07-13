import { describe, expect, it } from "@effect/vitest"
import {
  type Action as ActionSchema,
  EAction,
  GameState
} from "@flaghack/domain/schemas"
import { Effect, HashMap } from "effect"
import { readFileSync } from "node:fs"
import { doAction } from "../src/actions.js"
import {
  campgroundCamps,
  campgroundRoads,
  formatCampgroundAddress
} from "../src/campground.js"
import {
  CAMPGROUND_BORROWED_TOOL_KEY,
  CAMPGROUND_MISSING_FLAG_KEY,
  CAMPGROUND_WELCOME_REWARD_KEY,
  progressCampgroundConversation,
  reconcileCampgroundProgress
} from "../src/campgroundProgress.js"
import {
  campgroundViewForState,
  normalizeCampgroundState
} from "../src/campgroundState.js"
import { player } from "../src/creatures.js"
import { makeGroundFlag, makeGroundHammer } from "../src/items.js"
import {
  BSPGenLevel,
  CampgroundGenLevel,
  type Entity,
  firstDungeonArrivalCoordinate,
  type World
} from "../src/world.js"

type State = typeof GameState.Type
type Action = ActionSchema
type Assignment = NonNullable<
  NonNullable<State["campground"]>["npcAssignments"]
>[number]

const surfaceCache = new Map<number, World>()
const dungeonCache = new Map<number, World>()

const generatedSurface = (seed: number): World => {
  const cached = surfaceCache.get(seed)
  if (cached !== undefined) return cached
  const world = Effect.runSync(CampgroundGenLevel(seed, 0))
  surfaceCache.set(seed, world)
  return world
}

const generatedDungeon = (seed: number): World => {
  const cached = dungeonCache.get(seed)
  if (cached !== undefined) return cached
  const world = Effect.runSync(BSPGenLevel(seed, 1))
  dungeonCache.set(seed, world)
  return world
}

const entitiesFrom = (world: World): ReadonlyArray<Entity> =>
  Array.from(world.pipe(HashMap.values))

const entityByKey = (state: State, key: string): Entity | undefined =>
  HashMap.get(state.world, key).pipe((option) =>
    option._tag === "Some" ? option.value : undefined
  )

const initialGeneratedState = (seed = 777): State => {
  const surface = generatedSurface(seed)
  const arrival =
    entitiesFrom(surface).find((entity) =>
      entity._tag === "camp-prop" && entity.kind === "arrival-gate"
    )?.at ?? { x: 96, y: 120, z: 0 }
  return normalizeCampgroundState(GameState.make({
    world: surface.pipe(
      HashMap.set<string, Entity>(
        "player",
        player(
          arrival.x,
          arrival.y,
          arrival.z
        )
      )
    )
  }))
}

const withPlayerAt = (
  state: State,
  at: Entity["at"]
): State => {
  const actor = entityByKey(state, "player")
  if (actor?._tag !== "player") throw new Error("missing player")
  return {
    ...state,
    world: state.world.pipe(
      HashMap.set<string, Entity>(actor.key, { ...actor, at })
    )
  }
}

const withEntity = (state: State, entity: Entity): State => ({
  ...state,
  world: state.world.pipe(HashMap.set<string, Entity>(entity.key, entity))
})

const runAction = (
  state: State,
  action: Action
): State => {
  const actor = entityByKey(state, "player")
  if (actor?._tag !== "player") throw new Error("missing player")
  return Effect.runSync(doAction(state, {
    action,
    entity: actor
  }))
}

const assignment = (
  state: State,
  predicate: (candidate: Assignment) => boolean,
  description: string
): Assignment => {
  const result = state.campground?.npcAssignments?.find(predicate)
  if (result === undefined) throw new Error(`missing ${description}`)
  return result
}

const conversation = (
  state: State,
  npcAssignment: Assignment
) => {
  const actor = entityByKey(state, "player")
  const npc = entityByKey(state, npcAssignment.npcKey)
  if (actor?._tag !== "player" || npc === undefined) {
    throw new Error(
      `missing conversation entities for ${npcAssignment.npcKey}`
    )
  }
  return progressCampgroundConversation(
    state,
    actor,
    npc,
    npcAssignment
  )
}

const positionKey = (entity: Pick<Entity, "at">): string =>
  `${entity.at.x},${entity.at.y},${entity.at.z}`

const cardinalKeys = (
  entity: Pick<Entity, "at">
): ReadonlyArray<string> => [
  `${entity.at.x + 1},${entity.at.y},${entity.at.z}`,
  `${entity.at.x - 1},${entity.at.y},${entity.at.z}`,
  `${entity.at.x},${entity.at.y + 1},${entity.at.z}`,
  `${entity.at.x},${entity.at.y - 1},${entity.at.z}`
]

const reachableTunnelKeys = (
  entities: ReadonlyArray<Entity>,
  start: Entity["at"]
): ReadonlySet<string> => {
  const tunnels = new Set(
    entities.filter(({ _tag }) => _tag === "tunnel").map(positionKey)
  )
  const startKey = `${start.x},${start.y},${start.z}`
  const reachable = new Set<string>()
  const queue = tunnels.has(startKey) ? [startKey] : []

  while (queue.length > 0) {
    const current = queue.shift()
    if (current === undefined || reachable.has(current)) continue
    reachable.add(current)
    const [rawX, rawY, rawZ] = current.split(",")
    const at = {
      x: Number(rawX),
      y: Number(rawY),
      z: Number(rawZ)
    }
    for (const key of cardinalKeys({ at })) {
      if (tunnels.has(key) && !reachable.has(key)) queue.push(key)
    }
  }
  return reachable
}

describe("generated campground content contracts", () => {
  it("generates all addressed camps and named roads across a modest seed corpus", () => {
    for (const seed of [1, 17, 777]) {
      const entities = entitiesFrom(generatedSurface(seed))
      const signNames = new Set(
        entities.filter(({ _tag }) => _tag === "sign").map((entity) =>
          entity._tag === "sign" ? entity.name : ""
        )
      )
      const campSignNames = campgroundCamps.map((camp) =>
        `${camp.name} — ${formatCampgroundAddress(camp.address)}`
      )
      const actualCampSigns = entities.filter((entity) =>
        entity._tag === "sign" && campSignNames.includes(entity.name)
      )
      const actualRoadSigns = entities.filter((entity) =>
        entity._tag === "sign"
        && campgroundRoads.some(({ signLabel }) =>
          signLabel === entity.name
        )
      )

      expect(campSignNames, `seed ${seed}`).toHaveLength(24)
      expect(new Set(campSignNames).size, `seed ${seed}`).toBe(24)
      expect(actualCampSigns, `seed ${seed}`).toHaveLength(24)
      expect(actualRoadSigns, `seed ${seed}`).toHaveLength(
        campgroundRoads.length
      )
      expect(
        campSignNames.every((name) => signNames.has(name)),
        `seed ${seed}`
      ).toBe(true)
      expect(
        campgroundRoads.every(({ signLabel }) => signNames.has(signLabel)),
        `seed ${seed}`
      ).toBe(true)
    }
  })

  it("derives stable real greeter, flagship-host, effigy, and temple assignments", () => {
    const first = initialGeneratedState()
    const repeat = initialGeneratedState()
    const assignments = first.campground?.npcAssignments ?? []
    const flagshipIds = campgroundCamps.filter(({ kind }) =>
      kind === "flagship"
    ).map(({ id }) => id)
    const greeter = assignment(
      first,
      ({ landmarkId, role }) =>
        landmarkId === "arrival-plaza" && role === "civic",
      "arrival greeter"
    )
    const effigy = assignment(
      first,
      ({ landmarkId, role }) =>
        landmarkId === "central-effigy" && role === "civic",
      "effigy worker"
    )
    const temple = assignment(
      first,
      ({ landmarkId, role }) =>
        landmarkId === "temple" && role === "civic",
      "temple caretaker"
    )
    const hosts = assignments.filter(({ role }) => role === "host")

    expect(repeat.campground?.npcAssignments).toEqual(assignments)
    expect(entityByKey(first, greeter.npcKey)?._tag).toBe("ranger")
    expect(entityByKey(first, effigy.npcKey)).toBeDefined()
    expect(entityByKey(first, temple.npcKey)).toBeDefined()
    expect(hosts.map(({ campId }) => campId).sort()).toEqual(
      [...flagshipIds].sort()
    )
    expect(new Set(assignments.map(({ npcKey }) => npcKey)).size).toBe(
      assignments.length
    )
  })

  it("places the exact borrowed hammer in Patch Bay and the exact flag at a reachable unoccupied dead end", () => {
    const surfaceState = initialGeneratedState()
    const patchBay = surfaceState.campground?.campPlacements?.find((
      { id }
    ) => id === "patch-bay")
    const hammer = entityByKey(surfaceState, CAMPGROUND_BORROWED_TOOL_KEY)
    const hammerContainer = hammer === undefined
      ? undefined
      : entityByKey(surfaceState, hammer.in)

    expect(patchBay).toBeDefined()
    expect(hammer?._tag).toBe("hammer")
    expect(hammerContainer?._tag).toBe("cooler")
    if (patchBay !== undefined && hammerContainer !== undefined) {
      expect(
        Math.abs(hammerContainer.at.x - patchBay.signAt.x)
          + Math.abs(hammerContainer.at.y - patchBay.signAt.y)
      ).toBeLessThanOrEqual(3)
    }

    for (const seed of [1, 17, 777]) {
      const entities = entitiesFrom(generatedDungeon(seed))
      const flag = entities.find(({ key }) =>
        key === CAMPGROUND_MISSING_FLAG_KEY
      )
      if (flag === undefined) {
        throw new Error(`missing flag for seed ${seed}`)
      }
      const tunnelKeys = new Set(
        entities.filter(({ _tag }) => _tag === "tunnel").map(positionKey)
      )
      const reachable = reachableTunnelKeys(entities, {
        ...firstDungeonArrivalCoordinate,
        z: 1
      })
      const otherOccupants = entities.filter((entity) =>
        entity.in === "world"
        && positionKey(entity) === positionKey(flag)
        && entity.key !== flag.key
        && entity._tag !== "tunnel"
      )

      expect(flag._tag, `seed ${seed}`).toBe("flag")
      expect(flag.in, `seed ${seed}`).toBe("world")
      expect(tunnelKeys.has(positionKey(flag)), `seed ${seed}`).toBe(true)
      expect(reachable.has(positionKey(flag)), `seed ${seed}`).toBe(true)
      expect(
        cardinalKeys(flag).filter((key) => tunnelKeys.has(key)),
        `seed ${seed}`
      ).toHaveLength(1)
      expect(otherOccupants, `seed ${seed}`).toHaveLength(0)
    }
  })
})

describe("generated hidden campground progression", () => {
  it("supports independent cryptic clues, exact-key handoffs, early pickup, return, and repeat safety", () => {
    const initial = initialGeneratedState()
    const greeter = assignment(
      initial,
      ({ landmarkId }) => landmarkId === "arrival-plaza",
      "greeter"
    )
    const dustyHost = assignment(
      initial,
      ({ campId, role }) => campId === "dusty-spoon" && role === "host",
      "Dusty Spoon host"
    )
    const effigyWorker = assignment(
      initial,
      ({ landmarkId }) => landmarkId === "central-effigy",
      "effigy worker"
    )

    const greeted = conversation(initial, greeter)
    expect(greeted.handled).toBe(true)
    expect(greeted.state.campground?.missingFlagPhase).toBe(
      "seeking-rumors"
    )
    expect(greeted.message).not.toMatch(/quest|objective|phase/i)

    const dustyClue = conversation(greeted.state, dustyHost)
    expect(dustyClue.handled).toBe(true)
    expect(dustyClue.state.campground?.missingFlagPhase).toBe(
      "temple-lead"
    )
    expect(entityByKey(dustyClue.state, CAMPGROUND_WELCOME_REWARD_KEY))
      .toMatchObject({ _tag: "pancake", in: "player" })
    const repeatedDusty = conversation(dustyClue.state, dustyHost)
    expect(repeatedDusty.handled).toBe(false)
    expect(
      entitiesFrom(repeatedDusty.state.world).filter(({ key }) =>
        key === CAMPGROUND_WELCOME_REWARD_KEY
      )
    ).toHaveLength(1)

    const effigyOffer = conversation(greeted.state, effigyWorker)
    expect(effigyOffer.handled).toBe(true)
    expect(effigyOffer.state.campground?.toolFavor?.phase).toBe("active")
    const exactHammer = entityByKey(
      effigyOffer.state,
      CAMPGROUND_BORROWED_TOOL_KEY
    )
    if (exactHammer?._tag !== "hammer") {
      throw new Error("missing exact borrowed hammer")
    }
    const decoyHammer: Entity = {
      ...makeGroundHammer("ordinary-hammer", { x: 0, y: 0, z: 0 }),
      in: "player"
    }
    const withDecoyHammer = withEntity(effigyOffer.state, decoyHammer)
    const wrongTool = conversation(withDecoyHammer, effigyWorker)
    expect(wrongTool.state.campground?.toolFavor?.phase).toBe("active")
    expect(entityByKey(wrongTool.state, decoyHammer.key)?.in).toBe(
      "player"
    )
    expect(entityByKey(wrongTool.state, exactHammer.key)?.in).toBe(
      exactHammer.in
    )

    const cooler = entityByKey(wrongTool.state, exactHammer.in)
    if (cooler?._tag !== "cooler") {
      throw new Error("missing Patch Bay cooler")
    }
    const atCooler = withPlayerAt(wrongTool.state, cooler.at)
    const actorAtCooler = entityByKey(atCooler, "player")
    if (actorAtCooler?._tag !== "player") throw new Error("missing player")
    const tookExactTool = Effect.runSync(doAction(atCooler, {
      action: EAction.lootTakeMulti({
        containerKey: cooler.key,
        keys: [exactHammer.key]
      }),
      entity: actorAtCooler
    }))
    expect(entityByKey(tookExactTool, exactHammer.key)?.in).toBe("player")
    expect(tookExactTool.campground?.toolFavor?.phase).toBe("ready")
    const exactToolClue = conversation(tookExactTool, effigyWorker)
    expect(exactToolClue.handled).toBe(true)
    expect(exactToolClue.state.campground?.toolFavor).toMatchObject({
      phase: "completed",
      requiredItemKey: CAMPGROUND_BORROWED_TOOL_KEY,
      rewardGranted: true
    })
    expect(exactToolClue.state.campground?.missingFlagPhase).toBe(
      "temple-lead"
    )
    expect(entityByKey(exactToolClue.state, exactHammer.key)?.in).toBe(
      effigyWorker.npcKey
    )
    expect(entityByKey(exactToolClue.state, decoyHammer.key)?.in).toBe(
      "player"
    )
    const repeatedTool = conversation(exactToolClue.state, effigyWorker)
    expect(repeatedTool.handled).toBe(false)
    expect(repeatedTool.state.campground?.toolFavor).toEqual(
      exactToolClue.state.campground?.toolFavor
    )

    const decoyFlag: Entity = {
      ...makeGroundFlag("ordinary-flag", { x: 0, y: 0, z: 0 }),
      in: "player"
    }
    const withWrongFlag = withEntity(exactToolClue.state, decoyFlag)
    const wrongReturn = conversation(withWrongFlag, greeter)
    expect(wrongReturn.handled).toBe(false)
    expect(wrongReturn.state.campground?.missingFlagPhase).toBe(
      "temple-lead"
    )
    expect(entityByKey(wrongReturn.state, decoyFlag.key)?.in).toBe(
      "player"
    )

    const downStairs = entitiesFrom(wrongReturn.state.world).find(
      ({ _tag }) => _tag === "stairs-down"
    )
    if (downStairs === undefined) throw new Error("missing temple stairs")
    const atDownStairs = withPlayerAt(wrongReturn.state, downStairs.at)
    const descended = runAction(atDownStairs, EAction.descend())
    const exactFlag = entityByKey(descended, CAMPGROUND_MISSING_FLAG_KEY)
    if (exactFlag?._tag !== "flag") throw new Error("missing dungeon flag")
    const atFlag = withPlayerAt(descended, exactFlag.at)
    const picked = runAction(
      atFlag,
      EAction.pickupMulti({ keys: [exactFlag.key] })
    )
    expect(entityByKey(picked, exactFlag.key)?.in).toBe("player")
    expect(picked.campground?.missingFlagPhase).toBe("flag-retrieved")

    const upstairs = entitiesFrom(picked.world).find(
      ({ _tag }) => _tag === "stairs-up"
    )
    if (upstairs === undefined) throw new Error("missing return stairs")
    const ascended = runAction(
      withPlayerAt(picked, upstairs.at),
      EAction.ascend()
    )
    expect(entityByKey(ascended, "player")?.at.z).toBe(0)
    const returned = conversation(ascended, greeter)
    expect(returned.handled).toBe(true)
    expect(returned.state.campground?.missingFlagPhase).toBe("returned")
    expect(entityByKey(returned.state, exactFlag.key)?.in).toBe(
      greeter.npcKey
    )
    expect(entityByKey(returned.state, decoyFlag.key)?.in).toBe("player")
    const repeatedReturn = conversation(returned.state, greeter)
    expect(repeatedReturn.state.campground?.missingFlagPhase).toBe(
      "returned"
    )
    expect(
      entitiesFrom(repeatedReturn.state.world).filter(({ key }) =>
        key === CAMPGROUND_MISSING_FLAG_KEY
      )
    ).toHaveLength(1)

    const earlyDown = withPlayerAt(initial, downStairs.at)
    const earlyDungeon = runAction(earlyDown, EAction.descend())
    const earlyFlag = entityByKey(
      earlyDungeon,
      CAMPGROUND_MISSING_FLAG_KEY
    )
    if (earlyFlag?._tag !== "flag") throw new Error("missing early flag")
    const earlyPickup = runAction(
      withPlayerAt(earlyDungeon, earlyFlag.at),
      EAction.pickupMulti({ keys: [earlyFlag.key] })
    )
    expect(earlyPickup.campground?.missingFlagPhase).toBe("flag-retrieved")
    expect(earlyPickup.campground?.missingFlagOwnerNpcKey).toBe(
      greeter.npcKey
    )
    const earlyUpstairs = entitiesFrom(earlyPickup.world).find(
      ({ _tag }) => _tag === "stairs-up"
    )
    if (earlyUpstairs === undefined) {
      throw new Error("missing early stairs")
    }
    const earlySurface = runAction(
      withPlayerAt(earlyPickup, earlyUpstairs.at),
      EAction.ascend()
    )
    const earlyReturn = conversation(earlySurface, greeter)
    expect(earlyReturn.state.campground?.missingFlagPhase).toBe("returned")
  })

  it("keeps hidden phases, keys, coordinates, and objectives out of the client campground view and Charm model", () => {
    const initial = reconcileCampgroundProgress(initialGeneratedState(), {
      emitMessages: false
    })
    const campground = initial.campground
    if (campground === undefined) {
      throw new Error("missing campground state")
    }
    const hiddenState: State = {
      ...initial,
      campground: {
        ...campground,
        missingFlagKey: CAMPGROUND_MISSING_FLAG_KEY,
        missingFlagPhase: "temple-lead",
        toolFavor: {
          phase: "ready",
          requiredItemKey: CAMPGROUND_BORROWED_TOOL_KEY
        }
      }
    }
    const view = campgroundViewForState(hiddenState)
    const serialized = JSON.stringify(view)
    const hiddenTemple = campground.landmarkPlacements?.find(({ id }) =>
      id === "temple"
    )
    const hiddenCamp = campground.campPlacements?.find(({ id }) =>
      id === "flag-lab"
    )
    const charmSource = readFileSync(
      new URL("../../cli/charm/main.go", import.meta.url),
      "utf8"
    )
    const charmView = charmSource.match(
      /type campgroundView struct \{([\s\S]*?)\n\}/
    )?.[1] ?? ""

    expect(Object.keys(view).sort()).toEqual([
      "currentAddress",
      "discoveredLandmarks",
      "weather"
    ])
    expect(view.weather).toEqual({ condition: "heavy-rain" })
    expect(view.discoveredLandmarks.map(({ id }) => id)).toEqual([
      "arrival-plaza"
    ])
    for (
      const hidden of [
        "objective",
        "quest",
        "missingFlagPhase",
        "temple-lead",
        CAMPGROUND_MISSING_FLAG_KEY,
        CAMPGROUND_BORROWED_TOOL_KEY,
        "requiredItemKey"
      ]
    ) {
      expect(serialized).not.toContain(hidden)
      expect(charmView).not.toContain(hidden)
    }
    expect(charmView).not.toMatch(
      /Objective|Quest|MissingFlag|RequiredItem/
    )
    expect(view.discoveredLandmarks.every(({ at }) => at.z === 0)).toBe(
      true
    )
    for (
      const hiddenPosition of [
        hiddenTemple?.at,
        hiddenCamp?.entranceAt
      ]
    ) {
      if (hiddenPosition === undefined) {
        throw new Error("missing hidden generated position")
      }
      expect(serialized).not.toContain(
        `"x":${hiddenPosition.x},"y":${hiddenPosition.y},"z":${hiddenPosition.z}`
      )
    }
  })
})
