import { isCreatureTag } from "@flaghack/domain/creatureCapabilities"
import {
  type Action,
  type Direction as DirectionSchema,
  EAction
} from "@flaghack/domain/schemas"
import { Option, pipe } from "effect"
import type { Effect } from "effect/Effect"
import {
  all,
  andThen,
  log,
  succeed,
  tap,
  withLogSpan
} from "effect/Effect"
import type { HashMap } from "effect/HashMap"
import { filter, map, values } from "effect/HashMap"
import type { Creature } from "../creatures.js"
import type { GameState } from "../gamestate.js"
import type { TPos } from "../position.js"
import {
  type Entity,
  isCreature,
  isImpassable,
  isPassableTerrain,
  isTerrain,
  type World
} from "../world.js"

export type PlannedAction = { entity: Entity; action: Action }

type Direction = typeof DirectionSchema.Type
type NonPlayerCreature = Exclude<Creature, { readonly _tag: "player" }>
type CampgroundState = NonNullable<GameState["campground"]>
type NpcAssignment = NonNullable<
  CampgroundState["npcAssignments"]
>[number]
type NpcRole = NpcAssignment["role"]

type NavigationCell = {
  blocked: boolean
  floor: boolean
  passable: boolean
  tunnel: boolean
}

type AiPlanningContext = {
  assignments: ReadonlyMap<string, NpcAssignment>
  navigation: ReadonlyMap<string, NavigationCell>
}

const RESIDENT_HOME_RADIUS = 3
const RESIDENT_MOVE_PERIOD = 5
const TRAVELER_MOVE_PERIOD = 5
const DESTINATION_EPOCH_TURNS = 32

const directionVectors: ReadonlyArray<
  readonly [Direction, number, number]
> = [
  ["N", 0, -1],
  ["NE", 1, -1],
  ["E", 1, 0],
  ["SE", 1, 1],
  ["S", 0, 1],
  ["SW", -1, 1],
  ["W", -1, 0],
  ["NW", -1, -1]
]

const cardinalVectors: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0]
]

const isNonPlayerCreature = (e: Entity): e is NonPlayerCreature =>
  e._tag !== "player" && isCreatureTag(e._tag)

const nonPlayerCreaturesFrom = (w: HashMap<string, Entity>) =>
  w.pipe(filter(isNonPlayerCreature))

const positionKey = ({ x, y, z }: TPos): string => `${x},${y},${z}`

const shiftPosition = (
  position: TPos,
  direction: readonly [Direction, number, number]
): TPos => ({
  x: position.x + direction[1],
  y: position.y + direction[2],
  z: position.z
})

const chebyshevDistance = (left: TPos, right: TPos): number =>
  Math.max(
    Math.abs(left.x - right.x),
    Math.abs(left.y - right.y),
    Math.abs(left.z - right.z)
  )

const manhattanDistance = (left: TPos, right: TPos): number =>
  Math.abs(left.x - right.x)
  + Math.abs(left.y - right.y)
  + Math.abs(left.z - right.z)

const stableHash = (value: string): number => {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

const deterministicIndex = (
  gs: GameState,
  entity: NonPlayerCreature,
  salt: string,
  count: number
): number =>
  count === 0
    ? 0
    : stableHash(`${gs.turn ?? 0}:${entity.key}:${salt}`) % count

const destinationEpoch = (gs: GameState): number =>
  Math.floor((gs.turn ?? 0) / DESTINATION_EPOCH_TURNS)

const makeNavigationIndex = (
  world: World
): Map<string, NavigationCell> => {
  const result = new Map<string, NavigationCell>()

  for (const entity of world.pipe(values)) {
    if (entity.in !== "world") continue
    const key = positionKey(entity.at)
    const cell = result.get(key) ?? {
      blocked: false,
      floor: false,
      passable: false,
      tunnel: false
    }

    if (isPassableTerrain(entity)) cell.passable = true
    if (entity._tag === "floor") cell.floor = true
    if (entity._tag === "tunnel") cell.tunnel = true
    if (
      isCreature(entity) || (isTerrain(entity) && isImpassable(entity))
    ) {
      cell.blocked = true
    }
    result.set(key, cell)
  }

  return result
}

const makePlanningContext = (
  gs: GameState,
  navigationWorld: World = gs.world
): AiPlanningContext => {
  const assignments = new Map(
    (gs.campground?.npcAssignments ?? []).map((assignment) => [
      assignment.npcKey,
      assignment
    ])
  )

  return {
    assignments,
    navigation: assignments.size === 0
      ? new Map()
      : makeNavigationIndex(navigationWorld)
  }
}

const isOpenPosition = (
  navigation: AiPlanningContext["navigation"],
  position: TPos
): boolean => {
  const cell = navigation.get(positionKey(position))
  return cell?.passable === true && !cell.blocked
}

const isRoadOrShoulder = (
  navigation: AiPlanningContext["navigation"],
  position: TPos,
  allowOccupied = false
): boolean => {
  const cell = navigation.get(positionKey(position))
  if (cell?.tunnel === true) return allowOccupied || !cell.blocked
  if (cell?.floor !== true || (cell.blocked && !allowOccupied)) {
    return false
  }

  return cardinalVectors.some(([dx, dy]) =>
    navigation.get(positionKey({
      x: position.x + dx,
      y: position.y + dy,
      z: position.z
    }))?.tunnel === true
  )
}

type DirectedStep = {
  direction: Direction
  position: TPos
}

const adjacentSteps = (position: TPos): ReadonlyArray<DirectedStep> =>
  directionVectors.map((direction) => ({
    direction: direction[0],
    position: shiftPosition(position, direction)
  }))

const chooseDeterministicStep = (
  gs: GameState,
  entity: NonPlayerCreature,
  salt: string,
  candidates: ReadonlyArray<DirectedStep>
): DirectedStep | undefined =>
  candidates.at(deterministicIndex(gs, entity, salt, candidates.length))

const noop = (): Action => EAction.noop()

const actionForStep = (step: DirectedStep | undefined): Action =>
  step === undefined ? noop() : EAction.move({ dir: step.direction })

const residentAction = (
  gs: GameState,
  entity: NonPlayerCreature,
  assignment: NpcAssignment,
  context: AiPlanningContext
): Action => {
  const home = assignment.homeAt
  if (home === undefined || home.z !== entity.at.z) return noop()

  const distanceFromHome = chebyshevDistance(entity.at, home)
  const openSteps = adjacentSteps(entity.at).filter(({ position }) =>
    isOpenPosition(context.navigation, position)
  )

  if (distanceFromHome > RESIDENT_HOME_RADIUS) {
    const currentDistance = manhattanDistance(entity.at, home)
    const towardHome = openSteps.filter(({ position }) =>
      manhattanDistance(position, home) < currentDistance
    )
    return actionForStep(
      chooseDeterministicStep(gs, entity, "return-home", towardHome)
    )
  }

  if (
    deterministicIndex(
      gs,
      entity,
      `resident-noop:${assignment.role}`,
      RESIDENT_MOVE_PERIOD
    ) !== 0
  ) return noop()

  const boundedSteps = openSteps.filter(({ position }) =>
    chebyshevDistance(position, home) <= RESIDENT_HOME_RADIUS
  )
  return actionForStep(
    chooseDeterministicStep(
      gs,
      entity,
      `resident-wander:${assignment.role}`,
      boundedSteps
    )
  )
}

type NamedDestination = { id: string; at: TPos }

const campgroundDestinations = (
  gs: GameState
): ReadonlyArray<NamedDestination> => {
  const campground = gs.campground
  if (campground === undefined) return []

  return [
    ...(campground.campPlacements ?? []).map((camp) => ({
      at: camp.entranceAt,
      id: camp.id
    })),
    ...(campground.landmarkPlacements ?? []).map((landmark) => ({
      at: landmark.travelAt ?? landmark.at,
      id: landmark.id
    }))
  ].sort((left, right) => left.id.localeCompare(right.id))
}

const eventDestination = (
  gs: GameState,
  destinations: ReadonlyArray<NamedDestination>
): NamedDestination | undefined => {
  const campground = gs.campground
  const event = campground?.publicEvent
  if (
    campground === undefined
    || event?.phase !== "active"
    || event.hostCampId === undefined
    || !(campground.discoveredIds ?? []).includes(event.hostCampId)
  ) return undefined

  return destinations.find(({ id }) => id === event.hostCampId)
}

const assignedDestinationIds = (
  assignment: NpcAssignment
): ReadonlyArray<string> => [
  ...(assignment.routeLandmarkIds ?? []),
  ...(assignment.landmarkId === undefined ? [] : [assignment.landmarkId]),
  ...(assignment.campId === undefined ? [] : [assignment.campId])
]

const travelDestination = (
  gs: GameState,
  entity: NonPlayerCreature,
  assignment: NpcAssignment
): NamedDestination | undefined => {
  const destinations = campgroundDestinations(gs)
  const event = eventDestination(gs, destinations)
  if (event !== undefined) return event

  const destinationsById = new Map(
    destinations.map((destination) => [destination.id, destination])
  )
  const assigned = assignedDestinationIds(assignment).flatMap((id) => {
    const destination = destinationsById.get(id)
    return destination === undefined ? [] : [destination]
  })
  const candidates = assigned.length === 0 ? destinations : assigned
  if (candidates.length === 0) return undefined

  const index = stableHash(
    `${destinationEpoch(gs)}:${entity.key}:travel-destination`
  ) % candidates.length
  return candidates.at(index)
}

const travelerAction = (
  gs: GameState,
  entity: NonPlayerCreature,
  assignment: NpcAssignment,
  context: AiPlanningContext
): Action => {
  const destination = travelDestination(gs, entity, assignment)
  if (destination === undefined || destination.at.z !== entity.at.z) {
    return noop()
  }
  if (!isRoadOrShoulder(context.navigation, entity.at, true)) return noop()

  if (
    deterministicIndex(
      gs,
      entity,
      `traveler-noop:${assignment.role}`,
      TRAVELER_MOVE_PERIOD
    ) === 0
  ) return noop()

  const currentDistance = manhattanDistance(entity.at, destination.at)
  const roadSteps = adjacentSteps(entity.at).filter(({ position }) =>
    isRoadOrShoulder(context.navigation, position)
  )
  const bestDistance = roadSteps.reduce(
    (best, { position }) =>
      Math.min(best, manhattanDistance(position, destination.at)),
    currentDistance
  )
  const towardDestination = roadSteps.filter(({ position }) =>
    manhattanDistance(position, destination.at) === bestDistance
    && bestDistance < currentDistance
  )

  return actionForStep(
    chooseDeterministicStep(
      gs,
      entity,
      `traveler-step:${assignment.role}:${destination.id}`,
      towardDestination
    )
  )
}

const residentRoles = new Set<NpcRole>(["resident", "host", "civic"])
const travelerRoles = new Set<NpcRole>(["traveler", "patrol"])

const assignedCampgroundAction = (
  gs: GameState,
  entity: NonPlayerCreature,
  context: AiPlanningContext
): Action => {
  // Dungeon tunnel hippies and every other non-surface creature stay inert.
  if (entity.at.z !== 0) return noop()

  const assignment = context.assignments.get(entity.key)
  if (assignment === undefined) return noop()
  if (residentRoles.has(assignment.role)) {
    return residentAction(gs, entity, assignment, context)
  }
  if (travelerRoles.has(assignment.role)) {
    return travelerAction(gs, entity, assignment, context)
  }
  return noop()
}

export const planOneAi = (
  gs: GameState,
  entity: Entity,
  navigationWorld: World = gs.world
): Option.Option<PlannedAction> => {
  if (!isNonPlayerCreature(entity)) return Option.none()
  const context = makePlanningContext(gs, navigationWorld)
  return Option.some({
    action: assignedCampgroundAction(gs, entity, context),
    entity
  })
}

const eAi = (
  gs: GameState,
  context: AiPlanningContext
) =>
(entity: NonPlayerCreature) =>
  succeed({
    action: assignedCampgroundAction(gs, entity, context),
    entity
  })

const planAllAi = (
  gs: GameState,
  context: AiPlanningContext
) =>
(world: HashMap<string, NonPlayerCreature>) =>
  world.pipe(map((entity) => eAi(gs, context)(entity)), values)

export const allAiPlan = (
  gs: GameState,
  planningWorld: World = gs.world
): Effect<Array<PlannedAction>> => {
  const context = makePlanningContext(gs, planningWorld)
  return pipe(
    succeed(planningWorld),
    tap(() => log("planning ai for world")),
    andThen(nonPlayerCreaturesFrom),
    tap(() => log("narrowed to non-player creatures")),
    andThen(planAllAi(gs, context)),
    tap(() => log("setup planned all ai")),
    andThen((plannedEffects) => all(plannedEffects, { concurrency: 1 })),
    tap(() => log("executed planning all ai")),
    withLogSpan(`planning`)
  )
}
