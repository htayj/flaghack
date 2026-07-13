import type {
  Direction as DirectionSchema,
  GameState as GameStateSchema
} from "@flaghack/domain/schemas"
import { HashMap, Option } from "effect"
import { suppressCampgroundAtmosphere } from "./campgroundAtmosphere.js"
import {
  type CampgroundDialogueContext,
  campHostDialogue,
  greeterDialogue,
  repeatCampgroundDialogue,
  residentDialogue,
  templeCaretakerDialogue
} from "./campgroundDialogue.js"
import {
  type DiscoverableCampgroundPlace,
  discoverCampgroundPlaces,
  isLegalCampgroundStep,
  roadWeightedCampgroundPath
} from "./campgroundNavigation.js"
import { progressCampgroundConversation } from "./campgroundProgress.js"
import {
  campgroundViewForState,
  markCampgroundGreeting,
  normalizeCampgroundState
} from "./campgroundState.js"
import { appendGameplayEvent } from "./gameplayEvents.js"
import type { TPos } from "./position.js"
import type { Entity, World } from "./world.js"

type Direction = typeof DirectionSchema.Type
type GameState = typeof GameStateSchema.Type
type CampgroundRuntimeState = NonNullable<GameState["campground"]>
type NpcAssignment = NonNullable<
  CampgroundRuntimeState["npcAssignments"]
>[number]

const TALK_EMPTY_MESSAGE = "Nobody is there to talk to."
const TALK_AMBIGUOUS_MESSAGE = "Choose one person to talk to."
const TALK_LEVEL_MESSAGE = "Talking is only available in the campground."
const TRAVEL_UNKNOWN_MESSAGE =
  "That campground destination is not available."
const TRAVEL_BLOCKED_MESSAGE = "Travel is blocked."

const directionVectors: Readonly<Record<Direction, TPos>> = {
  E: { x: 1, y: 0, z: 0 },
  N: { x: 0, y: -1, z: 0 },
  NE: { x: 1, y: -1, z: 0 },
  NW: { x: -1, y: -1, z: 0 },
  S: { x: 0, y: 1, z: 0 },
  SE: { x: 1, y: 1, z: 0 },
  SW: { x: -1, y: 1, z: 0 },
  W: { x: -1, y: 0, z: 0 }
}

const shiftPosition = (position: TPos, direction: Direction): TPos => {
  const vector = directionVectors[direction]
  return {
    x: position.x + vector.x,
    y: position.y + vector.y,
    z: position.z
  }
}

const samePosition = (left: TPos, right: TPos): boolean =>
  left.x === right.x && left.y === right.y && left.z === right.z

const authoritativePlayer = (
  state: GameState,
  plannedActor: Entity
): Entity | undefined =>
  Option.getOrUndefined(HashMap.get(state.world, plannedActor.key))
      ?._tag === "player"
    ? Option.getOrUndefined(HashMap.get(state.world, plannedActor.key))
    : undefined

const creaturesAt = (
  state: GameState,
  position: TPos,
  exceptKey: string
): ReadonlyArray<Entity> =>
  Array.from(state.world.pipe(HashMap.values)).filter((entity) =>
    entity.in === "world"
    && entity.key !== exceptKey
    && entity.at.z === position.z
    && samePosition(entity.at, position)
    && (
      entity._tag === "player"
      || entity._tag === "ranger"
      || entity._tag === "hippie"
      || entity._tag === "wook"
      || entity._tag === "acidcop"
      || entity._tag === "lesser_egregore"
      || entity._tag === "greater_egregore"
      || entity._tag === "collective_egregore"
    )
  ).sort((left, right) => left.key.localeCompare(right.key))

const assignmentFor = (
  campground: CampgroundRuntimeState,
  npcKey: string
): NpcAssignment | undefined =>
  campground.npcAssignments?.find((assignment) =>
    assignment.npcKey === npcKey
  )

const isGreeterAssignment = (
  assignment: NpcAssignment | undefined
): boolean =>
  assignment?.role === "civic"
  && assignment.landmarkId === "arrival-plaza"

const withInteractionMessage = (
  state: GameState,
  message: string
): GameState =>
  suppressCampgroundAtmosphere(
    appendGameplayEvent(state, message)
  )

const dialogueContext = (
  state: GameState,
  npc: Entity,
  repeat: boolean,
  places: ReadonlyArray<DiscoverableCampgroundPlace>
): CampgroundDialogueContext => {
  const campground = state.campground
  const discovered = new Set(campground?.discoveredIds ?? [])
  return {
    discoveredPlaceKeys: places.filter(({ id }) => discovered.has(id)).map(
      ({ discoveryKey }) => discoveryKey
    ),
    ...(campground?.missingFlagPhase === undefined
      ? {}
      : { missingFlagPhase: campground.missingFlagPhase }),
    places,
    repeat,
    seed: campground?.seed ?? 777,
    speakerKey: npc.key,
    turn: state.turn ?? 0
  }
}

const dialogueForNpc = (
  state: GameState,
  _actor: Entity,
  npc: Entity,
  assignment: NpcAssignment | undefined,
  wasGreeted: boolean
): string => {
  const campground = state.campground
  if (campground === undefined) return "They have nothing to say."
  const places = discoverCampgroundPlaces(state.world)
  const camp = assignment?.campId === undefined
    ? undefined
    : places.find((place) =>
      place._tag === "camp" && place.id === assignment.campId
    )
  const campDefinition = camp?._tag === "camp"
    ? camp.definition
    : undefined
  const context = dialogueContext(state, npc, wasGreeted, places)

  if (isGreeterAssignment(assignment)) {
    return greeterDialogue(context).message
  }
  if (assignment?.landmarkId === "temple") {
    return templeCaretakerDialogue(context).message
  }
  if (assignment?.role === "host" && campDefinition !== undefined) {
    return campHostDialogue(campDefinition, context).message
  }
  if (assignment?.role === "resident" && campDefinition !== undefined) {
    return residentDialogue(campDefinition, context).message
  }
  if (npc._tag === "ranger") {
    return repeatCampgroundDialogue("ranger", context).message
  }
  return repeatCampgroundDialogue("resident", context, campDefinition)
    .message
}

export const talkCampgroundAction = (
  state: GameState,
  plannedActor: Entity,
  direction: Direction
): GameState => {
  const actor = authoritativePlayer(state, plannedActor)
  if (actor === undefined) return state

  const normalized = normalizeCampgroundState(state)
  const currentActor = authoritativePlayer(normalized, actor) ?? actor
  if (currentActor.at.z !== 0) {
    return withInteractionMessage(normalized, TALK_LEVEL_MESSAGE)
  }

  const targetPosition = shiftPosition(currentActor.at, direction)
  const targets = creaturesAt(normalized, targetPosition, currentActor.key)
  if (targets.length === 0) {
    return withInteractionMessage(normalized, TALK_EMPTY_MESSAGE)
  }
  if (targets.length !== 1) {
    return withInteractionMessage(normalized, TALK_AMBIGUOUS_MESSAGE)
  }

  const npc = targets[0]
  const campground = normalized.campground
  if (npc === undefined || campground === undefined) {
    return withInteractionMessage(normalized, TALK_EMPTY_MESSAGE)
  }
  const assignment = assignmentFor(campground, npc.key)
  const wasGreeted = (campground.greetedNpcKeys ?? []).includes(npc.key)
  const progress = progressCampgroundConversation(
    normalized,
    currentActor,
    npc,
    assignment
  )
  const progressed = progress.state
  const message = progress.message ?? dialogueForNpc(
    progressed,
    currentActor,
    npc,
    assignment,
    wasGreeted
  )
  return withInteractionMessage(
    markCampgroundGreeting(progressed, npc.key),
    message
  )
}

const discoveredTravelDestination = (
  state: GameState,
  landmarkId: string
): { readonly at: TPos; readonly name: string } | undefined => {
  const campground = state.campground
  if (
    campground === undefined
    || !(campground.discoveredIds ?? []).includes(landmarkId)
  ) return undefined
  const view = campgroundViewForState(state).discoveredLandmarks.find(
    ({ id }) => id === landmarkId
  )
  return view === undefined || !view.travelAvailable
    ? undefined
    : { at: view.at, name: view.name }
}

const clearActiveTravel = (state: GameState): GameState => {
  const campground = state.campground
  if (campground?.activeTravel === undefined) return state
  const { activeTravel: _activeTravel, ...rest } = campground
  return { ...state, campground: rest }
}

const cachedNextTravelStep = (
  state: GameState,
  current: TPos,
  destinationId: string
):
  | { readonly nextIndex: number; readonly path: ReadonlyArray<TPos> }
  | undefined =>
{
  const active = state.campground?.activeTravel
  if (
    active === undefined
    || active.destinationId !== destinationId
    || !samePosition(active.path[active.nextIndex - 1] ?? current, current)
    || active.path[active.nextIndex] === undefined
  ) return undefined
  return { nextIndex: active.nextIndex, path: active.path }
}

const withActiveTravel = (
  state: GameState,
  destinationId: string,
  path: ReadonlyArray<TPos>,
  nextIndex: number
): GameState => {
  const campground = state.campground
  if (campground === undefined) return state
  return {
    ...state,
    campground: {
      ...campground,
      activeTravel: { destinationId, nextIndex, path }
    }
  }
}

export const travelStepCampgroundAction = (
  state: GameState,
  plannedActor: Entity,
  landmarkId: string,
  validationWorld: World = state.world
): GameState => {
  const actor = authoritativePlayer(state, plannedActor)
  if (actor === undefined) return state
  const normalized = normalizeCampgroundState(state)
  const currentActor = authoritativePlayer(normalized, actor) ?? actor
  if (currentActor.at.z !== 0) {
    return withInteractionMessage(
      clearActiveTravel(normalized),
      TRAVEL_UNKNOWN_MESSAGE
    )
  }

  const destination = discoveredTravelDestination(normalized, landmarkId)
  if (destination === undefined) {
    return withInteractionMessage(
      clearActiveTravel(normalized),
      TRAVEL_UNKNOWN_MESSAGE
    )
  }
  if (samePosition(currentActor.at, destination.at)) {
    return withInteractionMessage(
      clearActiveTravel(normalized),
      `You have arrived at ${destination.name}.`
    )
  }

  const cached = cachedNextTravelStep(
    normalized,
    currentActor.at,
    landmarkId
  )
  let path = cached?.path
  let nextIndex = cached?.nextIndex ?? 1
  let nextStep = path?.at(nextIndex)
  if (
    nextStep === undefined
    || !isLegalCampgroundStep(validationWorld, currentActor.at, nextStep)
  ) {
    path = roadWeightedCampgroundPath(
      normalized.world,
      currentActor.at,
      destination.at
    )
    nextIndex = 1
    nextStep = path?.at(nextIndex)
  }
  if (
    nextStep === undefined
    || !isLegalCampgroundStep(validationWorld, currentActor.at, nextStep)
  ) {
    return withInteractionMessage(
      clearActiveTravel(normalized),
      TRAVEL_BLOCKED_MESSAGE
    )
  }

  const movedActor: Entity = { ...currentActor, at: nextStep }
  const moved: GameState = {
    ...normalized,
    world: normalized.world.pipe(
      HashMap.set<string, Entity>(currentActor.key, movedActor)
    )
  }
  const followingIndex = nextIndex + 1
  return samePosition(nextStep, destination.at)
      || path === undefined
      || followingIndex >= path.length
    ? clearActiveTravel(moved)
    : withActiveTravel(moved, landmarkId, path, followingIndex)
}
