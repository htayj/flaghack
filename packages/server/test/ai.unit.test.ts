import { describe, expect, it } from "@effect/vitest"
import { GameState } from "@flaghack/domain/schemas"
import { balancedAttributes } from "@flaghack/domain/stats"
import { Effect, HashMap, Option } from "effect"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { allAiPlan, planOneAi } from "../src/ai/ai.js"
import type { Entity } from "../src/world.js"

const aiSourcePath = fileURLToPath(
  new URL("../src/ai/ai.ts", import.meta.url)
)

const readAiSource = () => readFileSync(aiSourcePath, "utf8")

const directionOffsets = {
  E: { x: 1, y: 0 },
  N: { x: 0, y: -1 },
  NE: { x: 1, y: -1 },
  NW: { x: -1, y: -1 },
  S: { x: 0, y: 1 },
  SE: { x: 1, y: 1 },
  SW: { x: -1, y: 1 },
  W: { x: -1, y: 0 }
} as const

const hippieAt = (key: string, x: number, y: number, z = 0): Entity => ({
  _tag: "hippie",
  at: { x, y, z },
  attributes: balancedAttributes,
  in: "world",
  key,
  name: key
})

const terrainAt = (
  key: string,
  x: number,
  y: number,
  tag: "floor" | "tunnel" = "floor",
  z = 0
): Entity => ({
  _tag: tag,
  at: { x, y, z },
  in: "world",
  key
})

const floorRectangle = (
  width: number,
  height: number,
  z = 0
): ReadonlyArray<Entity> =>
  Array.from({ length: width * height }, (_, index) => {
    const x = index % width
    const y = Math.floor(index / width)
    return terrainAt(`floor-${z}-${x}-${y}`, x, y, "floor", z)
  })

const stateWith = (
  entities: ReadonlyArray<Entity>,
  assignments: ReadonlyArray<{
    readonly campId?: string
    readonly homeAt?: {
      readonly x: number
      readonly y: number
      readonly z: number
    }
    readonly landmarkId?: string
    readonly npcKey: string
    readonly role: "resident" | "host" | "civic" | "traveler" | "patrol"
    readonly routeLandmarkIds?: ReadonlyArray<string>
  }>,
  options: {
    readonly activeHostCampId?: string
    readonly camps?: ReadonlyArray<{
      readonly at: {
        readonly x: number
        readonly y: number
        readonly z: number
      }
      readonly id: string
    }>
    readonly discoveredIds?: ReadonlyArray<string>
    readonly landmarks?: ReadonlyArray<{
      readonly at: {
        readonly x: number
        readonly y: number
        readonly z: number
      }
      readonly id: string
    }>
  } = {}
) =>
  GameState.make({
    campground: {
      campPlacements: (options.camps ?? []).map(({ at, id }) => ({
        address: { label: id },
        entranceAt: at,
        id,
        kind: "camp",
        name: id,
        signAt: at
      })),
      discoveredIds: options.discoveredIds ?? [],
      landmarkPlacements: (options.landmarks ?? []).map(({ at, id }) => ({
        address: { label: id },
        at,
        id,
        kind: "landmark",
        name: id,
        travelAt: at
      })),
      npcAssignments: assignments.map((assignment) => ({
        ...assignment,
        routeLandmarkIds: assignment.routeLandmarkIds === undefined
          ? undefined
          : [...assignment.routeLandmarkIds]
      })),
      publicEvent: options.activeHostCampId === undefined
        ? { phase: "cooldown" }
        : {
          hostCampId: options.activeHostCampId,
          phase: "active"
        },
      version: 1
    },
    world: HashMap.fromIterable(
      entities.map((entity) => [entity.key, entity] as const)
    )
  })

const plannedActionFor = (
  state: ReturnType<typeof stateWith>,
  key: string
) => {
  const entity = Option.getOrUndefined(HashMap.get(state.world, key))
  if (entity === undefined) {
    throw new Error(`missing simulated actor ${key}`)
  }
  const planned = planOneAi(state, entity)
  if (Option.isNone(planned)) throw new Error(`AI did not plan ${key}`)
  return planned.value.action
}

const applyPlannedAction = (
  state: ReturnType<typeof stateWith>,
  key: string
): ReturnType<typeof stateWith> => {
  const entity = Option.getOrUndefined(HashMap.get(state.world, key))
  if (entity === undefined) {
    throw new Error(`missing simulated actor ${key}`)
  }
  const action = plannedActionFor(state, key)
  if (action._tag === "noop") {
    return { ...state, turn: (state.turn ?? 0) + 1 }
  }
  if (action._tag !== "move") {
    throw new Error(`unexpected AI action ${action._tag}`)
  }

  const offset = directionOffsets[action.dir]
  return {
    ...state,
    turn: (state.turn ?? 0) + 1,
    world: HashMap.set(state.world, key, {
      ...entity,
      at: {
        x: entity.at.x + offset.x,
        y: entity.at.y + offset.y,
        z: entity.at.z
      }
    })
  }
}

describe("server ai planning", () => {
  it("plans only non-player creatures from the world", () => {
    const player = {
      key: "player",
      at: { x: 1, y: 1, z: 0 },
      in: "world",
      _tag: "player",
      attributes: balancedAttributes,
      name: "you"
    } satisfies Entity
    const hippie = {
      key: "hippie-1",
      at: { x: 50, y: 3, z: 0 },
      in: "world",
      _tag: "hippie",
      attributes: balancedAttributes,
      name: "Ian"
    } satisfies Entity
    const item = {
      key: "flag-1",
      at: { x: 2, y: 1, z: 0 },
      in: "world",
      _tag: "flag"
    } satisfies Entity
    const terrain = {
      key: "floor-1",
      at: { x: 1, y: 2, z: 0 },
      in: "world",
      _tag: "floor"
    } satisfies Entity
    const gs = GameState.make({
      world: HashMap.fromIterable<string, Entity>([
        [player.key, player],
        [hippie.key, hippie],
        [item.key, item],
        [terrain.key, terrain]
      ])
    })

    const planned = Effect.runSync(allAiPlan(gs))
    const plannedKeys = planned.map(({ entity }) => entity.key)

    expect(new Set(plannedKeys)).toEqual(new Set([hippie.key]))
    expect(plannedKeys).not.toContain(player.key)
    expect(plannedKeys).not.toContain(item.key)
    expect(plannedKeys).not.toContain(terrain.key)
  })

  it("plans one AI action only for non-player creatures", () => {
    const gs = GameState.make({ world: HashMap.empty<string, Entity>() })
    const player = {
      key: "player",
      at: { x: 1, y: 1, z: 0 },
      in: "world",
      _tag: "player",
      attributes: balancedAttributes,
      name: "you"
    } satisfies Entity
    const hippie = {
      key: "hippie-1",
      at: { x: 50, y: 3, z: 0 },
      in: "world",
      _tag: "hippie",
      attributes: balancedAttributes,
      name: "Ian"
    } satisfies Entity
    const terrain = {
      key: "floor-1",
      at: { x: 50, y: 3, z: 0 },
      in: "world",
      _tag: "floor"
    } satisfies Entity

    const planned = planOneAi(gs, hippie)

    expect(Option.isNone(planOneAi(gs, player))).toBe(true)
    expect(Option.isNone(planOneAi(gs, terrain))).toBe(true)
    expect(Option.isSome(planned)).toBe(true)
    if (Option.isSome(planned)) {
      expect(planned.value.entity.key).toBe(hippie.key)
    }
  })

  it("keeps first-dungeon hippies at their tunnel dead ends", () => {
    const gs = GameState.make({ world: HashMap.empty<string, Entity>() })
    const dungeonHippie = {
      key: "hippie-dungeon",
      at: { x: 50, y: 3, z: 1 },
      in: "world",
      _tag: "hippie",
      attributes: balancedAttributes,
      name: "Tunnel Hippie"
    } satisfies Entity
    const planned = planOneAi(gs, dungeonHippie)

    expect(Option.isSome(planned)).toBe(true)
    if (Option.isSome(planned)) {
      expect(planned.value.action).toEqual({ _tag: "noop" })
    }
  })

  it("keeps assigned residents close to home over a long deterministic simulation", () => {
    const key = "resident-long-run"
    const home = { x: 7, y: 7, z: 0 }
    const resident = hippieAt(key, home.x, home.y)
    let state = stateWith(
      [...floorRectangle(15, 15), resident],
      [{ homeAt: home, npcKey: key, role: "resident" }]
    )
    let noopCount = 0

    for (let turn = 0; turn < 1_000; turn += 1) {
      const action = plannedActionFor(state, key)
      expect(["move", "noop"]).toContain(action._tag)
      if (action._tag === "noop") noopCount += 1
      state = applyPlannedAction(state, key)
      const current = Option.getOrUndefined(HashMap.get(state.world, key))
      expect(current).toBeDefined()
      expect(current?.at.z).toBe(0)
      expect(Math.max(
        Math.abs((current?.at.x ?? 0) - home.x),
        Math.abs((current?.at.y ?? 0) - home.y)
      )).toBeLessThanOrEqual(3)
    }

    expect(noopCount).toBeGreaterThan(700)
  })

  it("steps a displaced resident toward home before resuming bounded wandering", () => {
    const key = "resident-displaced"
    const home = { x: 3, y: 3, z: 0 }
    const resident = hippieAt(key, 10, 3)
    let state = stateWith(
      [...floorRectangle(13, 7), resident],
      [{ homeAt: home, npcKey: key, role: "host" }]
    )

    for (let turn = 0; turn < 4; turn += 1) {
      const before = Option.getOrUndefined(HashMap.get(state.world, key))
      const beforeDistance = Math.abs((before?.at.x ?? 0) - home.x)
        + Math.abs((before?.at.y ?? 0) - home.y)
      const action = plannedActionFor(state, key)
      expect(action._tag).toBe("move")
      state = applyPlannedAction(state, key)
      const after = Option.getOrUndefined(HashMap.get(state.world, key))
      const afterDistance = Math.abs((after?.at.x ?? 0) - home.x)
        + Math.abs((after?.at.y ?? 0) - home.y)
      expect(afterDistance).toBeLessThan(beforeDistance)
    }
  })

  it("keeps travelers on tunnel roads and shoulders while moving toward a destination", () => {
    const key = "traveler-long-run"
    const traveler = hippieAt(key, 1, 5)
    const tunnels = Array.from(
      { length: 40 },
      (_, index) => terrainAt(`road-${index + 1}`, index + 1, 5, "tunnel")
    )
    const shoulders = Array.from({ length: 40 }, (_, index) => [
      terrainAt(`north-shoulder-${index + 1}`, index + 1, 4),
      terrainAt(`south-shoulder-${index + 1}`, index + 1, 6)
    ]).flat()
    let state = stateWith(
      [...tunnels, ...shoulders, traveler],
      [{ campId: "destination", npcKey: key, role: "traveler" }],
      { camps: [{ at: { x: 40, y: 5, z: 0 }, id: "destination" }] }
    )
    const seenActions: Array<unknown> = []

    for (let turn = 0; turn < 500; turn += 1) {
      const action = plannedActionFor(state, key)
      expect(["move", "noop"]).toContain(action._tag)
      if (action._tag === "move") {
        expect(Object.keys(directionOffsets)).toContain(action.dir)
      }
      seenActions.push(action)
      state = applyPlannedAction(state, key)
      const current = Option.getOrUndefined(HashMap.get(state.world, key))
      expect(current?.at.z).toBe(0)
      expect(current?.at.y).toBe(5)
      expect(current?.at.x).toBeGreaterThanOrEqual(1)
      expect(current?.at.x).toBeLessThanOrEqual(40)
    }

    expect(Option.getOrUndefined(HashMap.get(state.world, key))?.at)
      .toEqual({
        x: 40,
        y: 5,
        z: 0
      })

    let replay = stateWith(
      [...tunnels, ...shoulders, traveler],
      [{ campId: "destination", npcKey: key, role: "traveler" }],
      { camps: [{ at: { x: 40, y: 5, z: 0 }, id: "destination" }] }
    )
    const replayActions: Array<unknown> = []
    for (let turn = 0; turn < 500; turn += 1) {
      replayActions.push(plannedActionFor(replay, key))
      replay = applyPlannedAction(replay, key)
    }
    expect(replayActions).toEqual(seenActions)
  })

  it("biases travelers toward a discovered active-event host without teleporting", () => {
    const key = "event-traveler"
    const traveler = hippieAt(key, 10, 5)
    const road = Array.from(
      { length: 20 },
      (_, index) =>
        terrainAt(`event-road-${index + 1}`, index + 1, 5, "tunnel")
    )
    let state = stateWith(
      [...road, traveler],
      [{ landmarkId: "usual-stop", npcKey: key, role: "patrol" }],
      {
        activeHostCampId: "host-camp",
        camps: [{ at: { x: 20, y: 5, z: 0 }, id: "host-camp" }],
        discoveredIds: ["host-camp"],
        landmarks: [{ at: { x: 1, y: 5, z: 0 }, id: "usual-stop" }]
      }
    )
    let moved = false

    for (let turn = 0; turn < 12; turn += 1) {
      const before = Option.getOrUndefined(HashMap.get(state.world, key))
      const action = plannedActionFor(state, key)
      state = applyPlannedAction(state, key)
      const after = Option.getOrUndefined(HashMap.get(state.world, key))
      if (action._tag === "move") {
        moved = true
        expect(after?.at.x).toBe((before?.at.x ?? 0) + 1)
        expect(after?.at.y).toBe(before?.at.y)
        expect(after?.at.z).toBe(before?.at.z)
      }
    }

    expect(moved).toBe(true)
  })

  it("keeps unassigned creatures and assigned dungeon hippies inert across levels", () => {
    const surfaceKey = "generic-no-ai"
    const dungeonKey = "assigned-dungeon-hippie"
    const surface = hippieAt(surfaceKey, 3, 3)
    const dungeon = hippieAt(dungeonKey, 3, 3, 1)
    const state = stateWith(
      [
        terrainAt("surface-floor", 3, 3),
        terrainAt("dungeon-tunnel", 3, 3, "tunnel", 1),
        surface,
        dungeon
      ],
      [{
        homeAt: { x: 3, y: 3, z: 0 },
        npcKey: dungeonKey,
        role: "resident"
      }]
    )

    for (let turn = 0; turn < 256; turn += 1) {
      const atTurn = { ...state, turn }
      expect(plannedActionFor(atTurn, surfaceKey)).toEqual({
        _tag: "noop"
      })
      expect(plannedActionFor(atTurn, dungeonKey)).toEqual({
        _tag: "noop"
      })
    }
  })

  it("plans only non-player creatures from a supplied active planning world", () => {
    const player = {
      key: "player",
      at: { x: 1, y: 1, z: 0 },
      in: "world",
      _tag: "player",
      attributes: balancedAttributes,
      name: "you"
    } satisfies Entity
    const nearHippie = {
      key: "hippie-near",
      at: { x: 50, y: 3, z: 0 },
      in: "world",
      _tag: "hippie",
      attributes: balancedAttributes,
      name: "Near"
    } satisfies Entity
    const farHippie = {
      key: "hippie-far",
      at: { x: 70, y: 50, z: 0 },
      in: "world",
      _tag: "hippie",
      attributes: balancedAttributes,
      name: "Far"
    } satisfies Entity
    const fullWorld = HashMap.fromIterable<string, Entity>([
      [player.key, player],
      [nearHippie.key, nearHippie],
      [farHippie.key, farHippie]
    ])
    const activeWorld = HashMap.fromIterable<string, Entity>([
      [player.key, player],
      [nearHippie.key, nearHippie]
    ])
    const gs = GameState.make({ world: fullWorld })

    const planned = Effect.runSync(allAiPlan(gs, activeWorld))
    const plannedKeys = planned.map(({ entity }) => entity.key)

    expect(plannedKeys).toEqual([nearHippie.key])
    expect(plannedKeys).not.toContain(farHippie.key)
  })

  it("uses synchronous effects for pure AI planning", () => {
    const aiSource = readAiSource()
    const effectConstructorImport = aiSource.match(
      /import\s*\{(?<imports>[\s\S]*?)\}\s*from\s*["']effect\/Effect["']/
    )

    expect(effectConstructorImport?.groups?.imports ?? "").not.toMatch(
      /\bpromise\b/
    )
    expect(aiSource).not.toContain("promise(async")
    expect(aiSource).not.toContain("Effect.promise")
    expect(aiSource).toContain("export const allAiPlan")
    expect(aiSource).toMatch(
      /succeed\(\{\s*action:\s*assignedCampgroundAction\(/
    )
  })

  it("filters the world to non-player creatures before planning", () => {
    const aiSource = readAiSource()
    const allAiPlanIndex = aiSource.indexOf("export const allAiPlan")

    expect(aiSource).toContain(
      "import { isCreatureTag } from \"@flaghack/domain/creatureCapabilities\""
    )
    expect(aiSource).toContain("const isNonPlayerCreature")
    expect(aiSource).toContain("const nonPlayerCreaturesFrom")
    expect(aiSource).toContain("filter(isNonPlayerCreature)")
    expect(aiSource).toContain("makePlanningContext(gs, planningWorld)")
    expect(allAiPlanIndex).toBeGreaterThanOrEqual(0)

    const allAiPlanSource = aiSource.slice(allAiPlanIndex)
    const filterIndex = allAiPlanSource.indexOf(
      "andThen(nonPlayerCreaturesFrom)"
    )
    const planIndex = allAiPlanSource.indexOf(
      "andThen(planAllAi(gs, context))"
    )

    expect(filterIndex).toBeGreaterThanOrEqual(0)
    expect(planIndex).toBeGreaterThan(filterIndex)
  })

  it("makes allAiPlan concurrency explicit", () => {
    const aiSource = readAiSource()
    const allAiPlanIndex = aiSource.indexOf("export const allAiPlan")

    expect(allAiPlanIndex).toBeGreaterThanOrEqual(0)

    const allAiPlanSource = aiSource.slice(allAiPlanIndex)

    expect(allAiPlanSource).not.toContain("todo: set concurrency")
    expect(allAiPlanSource).not.toMatch(/andThen\(\s*all\s*\)/)
    expect(allAiPlanSource).toMatch(
      /all\(\s*[^,]+,\s*\{\s*concurrency\s*:\s*1\s*\}/s
    )
  })
})
