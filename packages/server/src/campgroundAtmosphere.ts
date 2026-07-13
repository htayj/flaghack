import type { GameState as GameStateSchema } from "@flaghack/domain/schemas"
import { HashMap, Option } from "effect"
import {
  deterministicCampgroundChoice,
  getCampgroundCamp,
  getCampgroundLandmark
} from "./campground.js"
import {
  type CampgroundPublicEventContent,
  campgroundPublicEvents
} from "./campgroundDialogue.js"
import {
  markCampgroundDiscovery,
  normalizeCampgroundState
} from "./campgroundState.js"
import { appendGameplayEvent } from "./gameplayEvents.js"
import { isCampgroundShelterPosition } from "./world.js"

type GameState = typeof GameStateSchema.Type
type CampgroundState = NonNullable<GameState["campground"]>
type CampPlacement = NonNullable<CampgroundState["campPlacements"]>[number]
type LandmarkPlacement = NonNullable<
  CampgroundState["landmarkPlacements"]
>[number]

const DISCOVERY_RADIUS = 3
const CAMP_AMBIENT_RADIUS = 12
const LANDMARK_AMBIENT_RADIUS = 10
const EVENT_AMBIENT_RADIUS = 14
const AMBIENT_DELAY_MIN = 12
const AMBIENT_DELAY_MAX = 24
const RAIN_AMBIENT_DELAY_MIN = 6
const RAIN_AMBIENT_DELAY_MAX = 12
const EVENT_LEAD_MIN = 8
const EVENT_LEAD_MAX = 16
const EVENT_DURATION_MIN = 24
const EVENT_DURATION_MAX = 40
const EVENT_COOLDOWN_MIN = 36
const EVENT_COOLDOWN_MAX = 60
const EVENT_RETRY_MIN = 16
const EVENT_RETRY_MAX = 28

export const campgroundRoadAmbient = [
  "You hear bicycle tires whispering along the campground road.",
  "A few voices pass by, comparing camp markers and road names.",
  "Somewhere along the road, a bell rings twice and fades."
] as const

export const campgroundOpenPlayaAmbient = [
  "Wind pushes a thin veil of dust across the open playa.",
  "Distant camp sounds mingle until no single song is recognizable.",
  "A loose scrap of shade cloth snaps far out on the playa."
] as const

export const campgroundHeavyRainOutdoorAmbient = [
  "Rain sheets across the campground road and blurs the signs ahead.",
  "Runoff threads through the mud around your feet.",
  "The rain hammers hard enough to swallow most distant voices.",
  "Mud sucks at your feet while water streams toward the road."
] as const

export const campgroundHeavyRainShelterAmbient = [
  "Rain hammers on the canvas overhead.",
  "Runoff spills from the edge of the shelter in a steady curtain.",
  "The canvas snaps in the wind while rain drums above you.",
  "Beyond the shelter, the road is a blur of rain and churning mud."
] as const

interface SurfaceZone {
  readonly id: string
  readonly lines: ReadonlyArray<string>
}

interface PublicEventStep {
  readonly message?: string
  readonly state: GameState
}

interface DiscoveryCandidate {
  readonly distance: number
  readonly id: string
  readonly message: string
  readonly order: number
}

const positionDistance = (
  left: { readonly x: number; readonly y: number; readonly z: number },
  right: { readonly x: number; readonly y: number; readonly z: number }
): number =>
  left.z === right.z
    ? Math.abs(left.x - right.x) + Math.abs(left.y - right.y)
    : Number.POSITIVE_INFINITY

const playerFrom = (state: GameState) => {
  const player = Option.getOrUndefined(
    state.world.pipe(HashMap.get("player"))
  )
  return player?._tag === "player" && player.in === "world"
    ? player
    : undefined
}

const deterministicIntInclusive = (
  minimum: number,
  maximum: number,
  seed: number,
  identity: string
): number => {
  const values = Array.from(
    { length: maximum - minimum + 1 },
    (_, index) => minimum + index
  )
  return deterministicCampgroundChoice(values, seed, identity) ?? minimum
}

const campgroundSeed = (state: GameState): number =>
  state.campground?.seed ?? 777

const scheduledTurn = (
  state: GameState,
  turn: number,
  minimum: number,
  maximum: number,
  identity: string
): number =>
  turn + deterministicIntInclusive(
    minimum,
    maximum,
    campgroundSeed(state),
    `${identity}:${turn}`
  )

const updateCampground = (
  state: GameState,
  campground: CampgroundState
): GameState => ({ ...state, campground })

const eventContentFor = (
  kind: string | undefined,
  hostCampId: string | undefined
): CampgroundPublicEventContent | undefined =>
  campgroundPublicEvents.find((content) =>
    content.id === kind && content.hostCampId === hostCampId
  )

const eligibleEventContents = (
  campground: CampgroundState
): ReadonlyArray<CampgroundPublicEventContent> => {
  const discovered = new Set(campground.discoveredIds ?? [])
  const placed = new Set(
    (campground.campPlacements ?? []).map(({ id }) => id)
  )
  return campgroundPublicEvents.filter(({ hostCampId }) =>
    discovered.has(hostCampId) && placed.has(hostCampId)
  )
}

const chooseNextEvent = (
  state: GameState,
  turn: number
): CampgroundPublicEventContent | undefined => {
  const campground = state.campground
  if (campground === undefined) return undefined
  const eligible = eligibleEventContents(campground)
  const previousKind = campground.publicEvent?.kind
  const choices = eligible.length > 1
    ? eligible.filter(({ id }) => id !== previousKind)
    : eligible
  return deterministicCampgroundChoice(
    choices.length === 0 ? eligible : choices,
    campgroundSeed(state),
    `surface-event:${turn}`
  )
}

const scheduleNextEvent = (
  state: GameState,
  turn: number
): GameState => {
  const campground = state.campground
  if (campground === undefined) return state
  const content = chooseNextEvent(state, turn)

  if (content === undefined) {
    return updateCampground(state, {
      ...campground,
      publicEvent: {
        phase: "cooldown",
        nextTurn: scheduledTurn(
          state,
          turn,
          EVENT_RETRY_MIN,
          EVENT_RETRY_MAX,
          "surface-event-retry"
        ),
        ...(campground.publicEvent?.hostCampId === undefined
          ? {}
          : { hostCampId: campground.publicEvent.hostCampId }),
        ...(campground.publicEvent?.kind === undefined
          ? {}
          : { kind: campground.publicEvent.kind })
      }
    })
  }

  return updateCampground(state, {
    ...campground,
    publicEvent: {
      hostCampId: content.hostCampId,
      kind: content.id,
      phase: "scheduled",
      startTurn: scheduledTurn(
        state,
        turn,
        EVENT_LEAD_MIN,
        EVENT_LEAD_MAX,
        `surface-event-lead:${content.id}`
      )
    }
  })
}

const advancePublicEvent = (
  state: GameState,
  turn: number
): PublicEventStep => {
  const campground = state.campground
  if (campground === undefined) return { state }
  const event = campground.publicEvent ?? { phase: "cooldown" as const }

  switch (event.phase) {
    case "cooldown": {
      if (event.nextTurn !== undefined && turn < event.nextTurn) {
        return { state }
      }
      return { state: scheduleNextEvent(state, turn) }
    }
    case "scheduled": {
      if (event.startTurn !== undefined && turn < event.startTurn) {
        return { state }
      }
      const content = eventContentFor(event.kind, event.hostCampId)
      const eligible = eligibleEventContents(campground)
      if (
        content === undefined
        || !eligible.some(({ id }) => id === content.id)
      ) {
        return { state: scheduleNextEvent(state, turn) }
      }
      const activeState = updateCampground(state, {
        ...campground,
        publicEvent: {
          endTurn: scheduledTurn(
            state,
            turn,
            EVENT_DURATION_MIN,
            EVENT_DURATION_MAX,
            `surface-event-duration:${content.id}`
          ),
          hostCampId: content.hostCampId,
          kind: content.id,
          phase: "active",
          startTurn: turn
        }
      })
      return { message: content.announcement, state: activeState }
    }
    case "active": {
      const content = eventContentFor(event.kind, event.hostCampId)
      if (
        content === undefined
        || !eligibleEventContents(campground).some(({ id }) =>
          id === content.id
        )
      ) {
        return { state: scheduleNextEvent(state, turn) }
      }
      if (event.endTurn === undefined || turn < event.endTurn) {
        return { state }
      }
      const coolingState = updateCampground(state, {
        ...campground,
        publicEvent: {
          ...(event.hostCampId === undefined
            ? {}
            : { hostCampId: event.hostCampId }),
          ...(event.kind === undefined ? {} : { kind: event.kind }),
          nextTurn: scheduledTurn(
            state,
            turn,
            EVENT_COOLDOWN_MIN,
            EVENT_COOLDOWN_MAX,
            `surface-event-cooldown:${event.kind ?? "unknown"}`
          ),
          phase: "cooldown"
        }
      })
      return {
        message: content.endingAnnouncement,
        state: coolingState
      }
    }
  }
}

const nearestPositionDistance = (
  player: {
    readonly at: {
      readonly x: number
      readonly y: number
      readonly z: number
    }
  },
  positions: ReadonlyArray<{
    readonly x: number
    readonly y: number
    readonly z: number
  }>
): number =>
  Math.min(
    ...positions.map((position) => positionDistance(player.at, position))
  )

const discoveryCandidates = (
  state: GameState
): ReadonlyArray<DiscoveryCandidate> => {
  const player = playerFrom(state)
  const campground = state.campground
  if (player === undefined || campground === undefined) return []
  const discovered = new Set(campground.discoveredIds ?? [])
  const landmarkCandidates = (campground.landmarkPlacements ?? []).map(
    (placement, order): DiscoveryCandidate => ({
      distance: nearestPositionDistance(player, [
        placement.at,
        ...(placement.travelAt === undefined ? [] : [placement.travelAt])
      ]),
      id: placement.id,
      message:
        `You discover ${placement.name} — ${placement.address.label}.`,
      order
    })
  )
  const campOffset = landmarkCandidates.length
  const campCandidates = (campground.campPlacements ?? []).map(
    (placement, order): DiscoveryCandidate => ({
      distance: nearestPositionDistance(player, [
        placement.entranceAt,
        placement.signAt
      ]),
      id: placement.id,
      message:
        `You discover ${placement.name} — ${placement.address.label}.`,
      order: campOffset + order
    })
  )

  return [...landmarkCandidates, ...campCandidates].filter((candidate) =>
    candidate.distance <= DISCOVERY_RADIUS && !discovered.has(candidate.id)
  ).sort((left, right) =>
    left.distance - right.distance
    || left.order - right.order
    || left.id.localeCompare(right.id)
  )
}

const nearestCampPlacement = (
  campground: CampgroundState,
  player: NonNullable<ReturnType<typeof playerFrom>>
):
  | { readonly distance: number; readonly placement: CampPlacement }
  | undefined =>
  (campground.campPlacements ?? []).map((placement) => ({
    distance: nearestPositionDistance(player, [
      placement.entranceAt,
      placement.signAt
    ]),
    placement
  })).filter(({ distance }) => distance <= CAMP_AMBIENT_RADIUS).sort(
    (left, right) =>
      left.distance - right.distance
      || left.placement.id.localeCompare(right.placement.id)
  ).at(0)

const landmarkPlacement = (
  campground: CampgroundState,
  player: NonNullable<ReturnType<typeof playerFrom>>,
  id: string
): LandmarkPlacement | undefined =>
  (campground.landmarkPlacements ?? []).filter((placement) =>
    placement.id === id
    && nearestPositionDistance(player, [
        placement.at,
        ...(placement.travelAt === undefined ? [] : [placement.travelAt])
      ]) <= LANDMARK_AMBIENT_RADIUS
  ).at(0)

const activeEventZone = (
  campground: CampgroundState,
  player: NonNullable<ReturnType<typeof playerFrom>>
): SurfaceZone | undefined => {
  const scheduler = campground.publicEvent
  if (scheduler?.phase !== "active") return undefined
  const content = eventContentFor(scheduler.kind, scheduler.hostCampId)
  const placement = (campground.campPlacements ?? []).find(({ id }) =>
    id === scheduler.hostCampId
  )
  if (
    content === undefined || placement === undefined
    || !(campground.discoveredIds ?? []).includes(content.hostCampId)
    || nearestPositionDistance(player, [
        placement.entranceAt,
        placement.signAt
      ]) > EVENT_AMBIENT_RADIUS
  ) return undefined
  return {
    id: `event:${content.id}:${content.hostCampId}`,
    lines: content.ambient
  }
}

const catalogLandmarkZone = (
  id: "arrival-plaza" | "central-effigy" | "temple"
): SurfaceZone | undefined => {
  const definition = getCampgroundLandmark(id)
  return definition === undefined
    ? undefined
    : { id: `landmark:${id}`, lines: definition.ambient }
}

const playerIsOnRoad = (
  state: GameState,
  player: NonNullable<ReturnType<typeof playerFrom>>
): boolean =>
  Array.from(state.world.pipe(HashMap.values)).some((entity) =>
    entity._tag === "tunnel"
    && entity.in === "world"
    && positionDistance(entity.at, player.at) === 0
  )

const baseSurfaceZone = (state: GameState): SurfaceZone => {
  const player = playerFrom(state)
  const campground = state.campground
  if (player === undefined || campground === undefined) {
    return { id: "open-playa", lines: campgroundOpenPlayaAmbient }
  }

  const eventZone = activeEventZone(campground, player)
  if (eventZone !== undefined) return eventZone
  if (landmarkPlacement(campground, player, "temple") !== undefined) {
    return catalogLandmarkZone("temple")
      ?? { id: "open-playa", lines: campgroundOpenPlayaAmbient }
  }
  if (
    landmarkPlacement(campground, player, "central-effigy") !== undefined
  ) {
    return catalogLandmarkZone("central-effigy")
      ?? { id: "open-playa", lines: campgroundOpenPlayaAmbient }
  }
  const camp = nearestCampPlacement(campground, player)
  if (camp !== undefined) {
    const definition = getCampgroundCamp(camp.placement.id)
    if (definition !== undefined) {
      return { id: `camp:${definition.id}`, lines: definition.ambient }
    }
  }
  if (
    landmarkPlacement(campground, player, "arrival-plaza") !== undefined
  ) {
    return catalogLandmarkZone("arrival-plaza")
      ?? { id: "open-playa", lines: campgroundOpenPlayaAmbient }
  }
  return playerIsOnRoad(state, player)
    ? { id: "road", lines: campgroundRoadAmbient }
    : { id: "open-playa", lines: campgroundOpenPlayaAmbient }
}

const playerIsSheltered = (
  state: GameState,
  player: NonNullable<ReturnType<typeof playerFrom>>
): boolean =>
  isCampgroundShelterPosition(state.world, player.at)
  || Array.from(state.world.pipe(HashMap.values)).some((entity) =>
    entity.in === "world"
    && positionDistance(entity.at, player.at) === 0
    && entity._tag === "camp-prop"
    && entity.kind === "arrival-gate"
  )

const surfaceZone = (state: GameState): SurfaceZone => {
  const base = baseSurfaceZone(state)
  const player = playerFrom(state)
  if (
    state.campground?.weather?.condition !== "heavy-rain"
    || player === undefined
  ) return base

  const sheltered = playerIsSheltered(state, player)
  return {
    id: `rain:${sheltered ? "sheltered" : "outdoor"}:${base.id}`,
    lines: sheltered
      ? campgroundHeavyRainShelterAmbient
      : campgroundHeavyRainOutdoorAmbient
  }
}

const ambientDelayRange = (
  state: GameState
): readonly [minimum: number, maximum: number] =>
  state.campground?.weather?.condition === "heavy-rain"
    ? [RAIN_AMBIENT_DELAY_MIN, RAIN_AMBIENT_DELAY_MAX]
    : [AMBIENT_DELAY_MIN, AMBIENT_DELAY_MAX]

const ambientLine = (
  state: GameState,
  zone: SurfaceZone,
  turn: number
): string => {
  const ambience = state.campground?.surfaceAmbience
  const previous = ambience?.zoneId === zone.id
      && ambience.lastMessageTurn !== undefined
    ? deterministicCampgroundChoice(
      zone.lines,
      campgroundSeed(state),
      `${zone.id}:ambient:${ambience.lastMessageTurn}`
    )
    : undefined
  const choices = previous === undefined || zone.lines.length < 2
    ? zone.lines
    : zone.lines.filter((line) => line !== previous)
  return deterministicCampgroundChoice(
    choices,
    campgroundSeed(state),
    `${zone.id}:ambient:${turn}`
  ) ?? zone.lines[0] ?? "The campground is briefly quiet."
}

const advanceAmbient = (state: GameState, turn: number): GameState => {
  const campground = state.campground
  if (campground === undefined) return state
  const ambience = campground.surfaceAmbience ?? {}
  const [minimumDelay, maximumDelay] = ambientDelayRange(state)
  if (ambience.nextTurn === undefined) {
    return updateCampground(state, {
      ...campground,
      surfaceAmbience: {
        ...ambience,
        nextTurn: scheduledTurn(
          state,
          turn,
          minimumDelay,
          maximumDelay,
          "surface-ambient-first"
        )
      }
    })
  }
  if (turn < ambience.nextTurn) return state

  const zone = surfaceZone(state)
  const message = ambientLine(state, zone, turn)
  const scheduled = updateCampground(state, {
    ...campground,
    surfaceAmbience: {
      lastMessageTurn: turn,
      nextTurn: scheduledTurn(
        state,
        turn,
        minimumDelay,
        maximumDelay,
        `surface-ambient:${zone.id}`
      ),
      zoneId: zone.id
    }
  })
  return appendGameplayEvent(scheduled, message, {
    interruptsTravel: false
  })
}

/**
 * Marks the next surface atmosphere turn as occupied by explicit dialogue.
 * Due announcements and discoveries remain pending instead of being lost.
 */
export const suppressCampgroundAtmosphere = (
  state: GameState,
  untilTurn = (state.turn ?? 0) + 1
): GameState => {
  const normalized = normalizeCampgroundState(state)
  const campground = normalized.campground
  if (campground === undefined) return normalized
  const ambience = campground.surfaceAmbience ?? {}
  return updateCampground(normalized, {
    ...campground,
    surfaceAmbience: {
      ...ambience,
      lastMessageTurn: Math.max(
        ambience.lastMessageTurn ?? Number.MIN_SAFE_INTEGER,
        untilTurn
      )
    }
  })
}

/** Advances surface scheduling and emits no more than one gameplay event. */
export const advanceCampgroundAtmosphere = (
  state: GameState,
  turn: number
): GameState => {
  const normalized = normalizeCampgroundState(state)
  const campground = normalized.campground
  const player = playerFrom(normalized)
  if (
    campground === undefined || player === undefined || player.at.z !== 0
  ) return normalized
  if ((campground.surfaceAmbience?.lastMessageTurn ?? -1) >= turn) {
    return normalized
  }

  const eventStep = advancePublicEvent(normalized, turn)
  if (eventStep.message !== undefined) {
    return appendGameplayEvent(eventStep.state, eventStep.message)
  }

  const discovery = discoveryCandidates(eventStep.state).at(0)
  if (discovery !== undefined) {
    return appendGameplayEvent(
      markCampgroundDiscovery(eventStep.state, discovery.id),
      discovery.message
    )
  }

  return advanceAmbient(eventStep.state, turn)
}
