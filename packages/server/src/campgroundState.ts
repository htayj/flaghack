import type {
  CampgroundState as CampgroundStateSchema,
  CampgroundView as CampgroundViewSchema,
  GameState as GameStateSchema
} from "@flaghack/domain/schemas"
import { HashMap } from "effect"
import {
  campgroundCamps,
  campgroundLandmarks,
  campgroundRoads
} from "./campground.js"
import {
  type DiscoverableCampRecord,
  type DiscoverableLandmarkRecord,
  discoverCampgroundCamps,
  discoverCampgroundLandmarks
} from "./campgroundNavigation.js"
import {
  CAMPGROUND_BORROWED_TOOL_KEY,
  CAMPGROUND_MISSING_FLAG_KEY
} from "./campgroundQuestContent.js"
import { appendGameplayEvent } from "./gameplayEvents.js"
import { isCampPropPassable, makeStairsUp } from "./terrain.js"
import type { Entity, World } from "./world.js"

export type CampgroundState = typeof CampgroundStateSchema.Type
export type CampgroundView = typeof CampgroundViewSchema.Type
export type GameState = typeof GameStateSchema.Type

export const CAMPGROUND_STATE_VERSION = 1
export const CAMPGROUND_CONTENT_VERSION = "campground-v1"
export const DEFAULT_CAMPGROUND_SEED = 777
export const DEFAULT_CAMPGROUND_WEATHER = {
  condition: "heavy-rain"
} as const
export const CAMPGROUND_WAKE_UP_MESSAGE =
  "You wake naked and face down in a puddle of mud just off the road. Rain hammers down around you, and you cannot remember how you got here."
export const CAMPGROUND_RETURN_STAIRS_POSITION = {
  x: 1,
  y: 1,
  z: 1
} as const

const RETURN_STAIRS_KEY = "campground-return-stairs-1"
const CURRENT_LANDMARK_RADIUS = 12

type CampPlacement = NonNullable<CampgroundState["campPlacements"]>[number]
type LandmarkPlacement = NonNullable<
  CampgroundState["landmarkPlacements"]
>[number]
type NpcAssignment = NonNullable<
  CampgroundState["npcAssignments"]
>[number]

const worldEntities = (world: World): ReadonlyArray<Entity> =>
  Array.from(world.pipe(HashMap.values)).filter(({ in: container }) =>
    container === "world"
  )

const positionKey = (position: Entity["at"]): string =>
  `${position.x},${position.y},${position.z}`

const positionDistance = (
  left: Entity["at"],
  right: Entity["at"]
): number =>
  Math.abs(left.x - right.x)
  + Math.abs(left.y - right.y)
  + Math.abs(left.z - right.z)

const comparePositions = (left: Entity, right: Entity): number =>
  left.at.z - right.at.z
  || left.at.y - right.at.y
  || left.at.x - right.at.x
  || left.key.localeCompare(right.key)

const terrainIsStaticallyPassable = (entity: Entity): boolean => {
  switch (entity._tag) {
    case "floor":
    case "mud":
    case "tunnel":
    case "tent":
    case "sign":
    case "effigy":
    case "temple":
    case "stairs-down":
    case "stairs-up":
      return true
    case "door":
      return entity.open
    case "camp-prop":
      return isCampPropPassable(entity.kind)
    default:
      return false
  }
}

const terrainIsStaticBlocker = (entity: Entity): boolean => {
  switch (entity._tag) {
    case "wall":
    case "tent-wall":
    case "tent-post":
      return true
    case "door":
      return !entity.open
    case "camp-prop":
      return !isCampPropPassable(entity.kind)
    default:
      return false
  }
}

const staticallyPassablePositions = (
  world: World
): ReadonlyArray<Entity> => {
  const entities = worldEntities(world)
  const blockedKeys = new Set(
    entities.filter(terrainIsStaticBlocker).map((entity) =>
      positionKey(entity.at)
    )
  )
  const unique = new Map<string, Entity>()
  for (const entity of entities.filter(terrainIsStaticallyPassable)) {
    const key = positionKey(entity.at)
    if (!blockedKeys.has(key) && !unique.has(key)) unique.set(key, entity)
  }
  return [...unique.values()].sort(comparePositions)
}

const nearestEntity = (
  candidates: ReadonlyArray<Entity>,
  target: Entity["at"]
): Entity | undefined =>
  candidates.filter(({ at }) => at.z === target.z).sort((left, right) =>
    positionDistance(left.at, target) - positionDistance(right.at, target)
    || comparePositions(left, right)
  ).at(0)

const campEntranceFor = (
  world: World,
  camp: DiscoverableCampRecord
): Entity["at"] => {
  const roads = worldEntities(world).filter((entity) =>
    entity._tag === "tunnel" && entity.at.z === camp.at.z
  )
  return nearestEntity(roads, camp.at)?.at ?? camp.at
}

const travelPositionFor = (
  passablePositions: ReadonlyArray<Entity>,
  landmark: DiscoverableLandmarkRecord
): Entity["at"] | undefined =>
  nearestEntity(passablePositions, landmark.at)?.at

const domainCampAddress = (
  camp: DiscoverableCampRecord
): CampPlacement["address"] => ({
  districtId: camp.address.district,
  label: camp.addressLabel,
  marker: camp.address.marker,
  roadId: camp.address.roadId
})

const domainLandmarkKind = (
  landmark: DiscoverableLandmarkRecord
): string => {
  switch (landmark.id) {
    case "arrival-plaza":
      return "civic"
    case "directory":
      return "directory"
    case "water-station":
      return "water-station"
    case "central-effigy":
      return "effigy"
    case "temple":
      return "temple"
    default:
      return landmark.definition.placement
  }
}

export const deriveCampgroundCampPlacements = (
  world: World
): ReadonlyArray<CampPlacement> => {
  const entities = worldEntities(world)
  const knownCamps = discoverCampgroundCamps(world)
  const knownSignKeys = new Set(
    knownCamps.flatMap(({ entityKeys }) => entityKeys)
  )
  const knownPlacements = knownCamps.map((camp) => ({
    address: domainCampAddress(camp),
    entranceAt: campEntranceFor(world, camp),
    id: camp.id,
    kind: camp.definition.kind,
    name: camp.name,
    signAt: camp.at,
    ...(camp.entityKeys[0] === undefined
      ? {}
      : { signKey: camp.entityKeys[0] })
  }))
  const coolers = entities.filter(({ _tag }) => _tag === "cooler")
  const roads = entities.filter(({ _tag }) => _tag === "tunnel")
  const legacyPlacements: ReadonlyArray<CampPlacement> = entities.filter(
    (entity) =>
      entity._tag === "sign"
      && entity.at.z === 0
      && !knownSignKeys.has(entity.key)
      && coolers.some((cooler) =>
        cooler.at.z === entity.at.z
        && positionDistance(cooler.at, entity.at) <= 4
      )
  ).sort((left, right) => left.key.localeCompare(right.key)).map((
    sign
  ) => ({
    address: { label: "Unmapped camp" },
    entranceAt: nearestEntity(roads, sign.at)?.at ?? sign.at,
    id: `legacy-${sign.key}`,
    kind: "legacy",
    name: sign._tag === "sign" ? sign.name : "Legacy camp",
    signAt: sign.at,
    signKey: sign.key
  }))

  return [...knownPlacements, ...legacyPlacements]
}

export const deriveCampgroundLandmarkPlacements = (
  world: World
): ReadonlyArray<LandmarkPlacement> => {
  const passablePositions = staticallyPassablePositions(world)
  return discoverCampgroundLandmarks(world).map((landmark) => {
    const travelAt = travelPositionFor(passablePositions, landmark)
    return {
      address: { label: landmark.addressLabel },
      at: landmark.at,
      id: landmark.id,
      kind: domainLandmarkKind(landmark),
      name: landmark.name,
      ...(landmark.entityKeys[0] === undefined
        ? {}
        : { entityKey: landmark.entityKeys[0] }),
      ...(travelAt === undefined ? {} : { travelAt })
    }
  })
}

const nearestCampPlacement = (
  camps: ReadonlyArray<CampPlacement>,
  entity: Entity,
  maximumDistance: number
): CampPlacement | undefined =>
  camps.filter((camp) => camp.signAt.z === entity.at.z).map((camp) => ({
    camp,
    distance: positionDistance(camp.signAt, entity.at)
  })).filter(({ distance }) => distance <= maximumDistance).sort(
    (left, right) =>
      left.distance - right.distance
      || left.camp.id.localeCompare(right.camp.id)
  ).at(0)?.camp

export const deriveCampgroundNpcAssignments = (
  world: World
): ReadonlyArray<NpcAssignment> => {
  const camps = deriveCampgroundCampPlacements(world)
  const landmarks = discoverCampgroundLandmarks(world)
  const arrival = landmarks.find(({ id }) => id === "arrival-plaza")
  const npcs = worldEntities(world).filter((entity) =>
    entity.at.z === 0
    && (entity._tag === "hippie" || entity._tag === "ranger")
  ).sort((left, right) => left.key.localeCompare(right.key))
  const assignments = new Map<string, NpcAssignment>()
  const assignNearest = (
    target: Entity["at"],
    assignment: Omit<NpcAssignment, "homeAt" | "npcKey">,
    predicate: (npc: Entity) => boolean = () => true,
    maximumDistance = Number.POSITIVE_INFINITY
  ): Entity | undefined => {
    const npc = npcs.filter((candidate) =>
      !assignments.has(candidate.key)
      && predicate(candidate)
      && positionDistance(candidate.at, target) <= maximumDistance
    ).sort((left, right) =>
      positionDistance(left.at, target)
        - positionDistance(right.at, target)
      || left.key.localeCompare(right.key)
    ).at(0)
    if (npc !== undefined) {
      assignments.set(npc.key, {
        ...assignment,
        homeAt: npc.at,
        npcKey: npc.key
      })
    }
    return npc
  }

  if (arrival !== undefined) {
    assignNearest(
      arrival.at,
      { landmarkId: arrival.id, role: "civic" },
      (npc) => npc._tag === "ranger",
      CURRENT_LANDMARK_RADIUS
    )
  }

  for (
    const definition of campgroundCamps.filter(({ kind }) =>
      kind === "flagship"
    )
  ) {
    const camp = camps.find(({ id }) => id === definition.id)
    if (camp !== undefined) {
      assignNearest(
        camp.signAt,
        { campId: camp.id, role: "host" },
        () => true,
        CURRENT_LANDMARK_RADIUS
      )
    }
  }

  for (const landmarkId of ["central-effigy", "temple"] as const) {
    const landmark = landmarks.find(({ id }) => id === landmarkId)
    if (landmark !== undefined) {
      const ranger = assignNearest(
        landmark.at,
        { landmarkId, role: "civic" },
        (npc) => npc._tag === "ranger"
      )
      if (ranger === undefined) {
        assignNearest(landmark.at, { landmarkId, role: "civic" })
      }
    }
  }

  for (const npc of npcs) {
    if (assignments.has(npc.key)) continue
    if (npc._tag === "hippie" && npc.name === "traveler") {
      assignments.set(npc.key, {
        homeAt: npc.at,
        npcKey: npc.key,
        role: "traveler"
      })
      continue
    }

    const camp = nearestCampPlacement(camps, npc, CURRENT_LANDMARK_RADIUS)
    assignments.set(
      npc.key,
      camp === undefined
        ? {
          homeAt: npc.at,
          npcKey: npc.key,
          role: npc._tag === "ranger" ? "patrol" : "traveler"
        }
        : {
          campId: camp.id,
          homeAt: npc.at,
          npcKey: npc.key,
          role: "resident"
        }
    )
  }

  return [...assignments.values()].sort((left, right) =>
    left.npcKey.localeCompare(right.npcKey)
  )
}

const nextAvailableKey = (world: World, baseKey: string): string => {
  if (!HashMap.has(world, baseKey)) return baseKey
  let suffix = 1
  while (HashMap.has(world, `${baseKey}-${suffix}`)) suffix += 1
  return `${baseKey}-${suffix}`
}

const repairMissingReturnStairs = (state: GameState): GameState => {
  const player = HashMap.get(state.world, "player")
  if (player._tag === "None" || player.value._tag !== "player") {
    return state
  }
  const hasFirstDungeon = player.value.at.z === 1
  if (!hasFirstDungeon) return state

  const entities = worldEntities(state.world)
  const hasReturnStairs = entities.some((entity) =>
    entity._tag === "stairs-up" && entity.at.z === 1
  )
  if (hasReturnStairs) return state

  const key = nextAvailableKey(state.world, RETURN_STAIRS_KEY)
  const stairs: Entity = makeStairsUp(
    key,
    CAMPGROUND_RETURN_STAIRS_POSITION.x,
    CAMPGROUND_RETURN_STAIRS_POSITION.y,
    CAMPGROUND_RETURN_STAIRS_POSITION.z
  )
  return {
    ...state,
    world: state.world.pipe(HashMap.set<string, Entity>(key, stairs))
  }
}

const hasRuntimeDefaults = (
  campground: CampgroundState | undefined
): campground is CampgroundState & {
  readonly campPlacements: NonNullable<CampgroundState["campPlacements"]>
  readonly contentVersion: string
  readonly discoveredIds: NonNullable<CampgroundState["discoveredIds"]>
  readonly greetedNpcKeys: NonNullable<CampgroundState["greetedNpcKeys"]>
  readonly landmarkPlacements: NonNullable<
    CampgroundState["landmarkPlacements"]
  >
  readonly missingFlagPhase: NonNullable<
    CampgroundState["missingFlagPhase"]
  >
  readonly npcAssignments: NonNullable<CampgroundState["npcAssignments"]>
  readonly publicEvent: NonNullable<CampgroundState["publicEvent"]>
  readonly seed: number
  readonly surfaceAmbience: NonNullable<CampgroundState["surfaceAmbience"]>
  readonly toolFavor: NonNullable<CampgroundState["toolFavor"]>
  readonly waterFavor: NonNullable<CampgroundState["waterFavor"]>
  readonly weather: NonNullable<CampgroundState["weather"]>
  readonly welcomeFavor: NonNullable<CampgroundState["welcomeFavor"]>
} =>
  campground !== undefined
  && campground.campPlacements !== undefined
  && campground.contentVersion !== undefined
  && campground.discoveredIds !== undefined
  && campground.greetedNpcKeys !== undefined
  && campground.landmarkPlacements !== undefined
  && campground.missingFlagPhase !== undefined
  && campground.npcAssignments !== undefined
  && campground.publicEvent !== undefined
  && campground.seed !== undefined
  && campground.surfaceAmbience !== undefined
  && campground.toolFavor !== undefined
  && campground.waterFavor !== undefined
  && campground.weather !== undefined
  && campground.welcomeFavor !== undefined

const defaultDiscoveredIds = (
  landmarkPlacements: ReadonlyArray<LandmarkPlacement>
): ReadonlyArray<string> =>
  landmarkPlacements.some(({ id }) => id === "arrival-plaza")
    ? ["arrival-plaza"]
    : []

const defaultCampgroundState = (
  world: World
): CampgroundState => {
  const campPlacements = deriveCampgroundCampPlacements(world)
  const landmarkPlacements = deriveCampgroundLandmarkPlacements(world)
  const npcAssignments = deriveCampgroundNpcAssignments(world)
  const greeter = npcAssignments.find((assignment) =>
    assignment.landmarkId === "arrival-plaza"
  )
  return {
    campPlacements,
    contentVersion: CAMPGROUND_CONTENT_VERSION,
    discoveredIds: defaultDiscoveredIds(landmarkPlacements),
    greetedNpcKeys: [],
    landmarkPlacements,
    ...(HashMap.has(world, CAMPGROUND_MISSING_FLAG_KEY)
      ? { missingFlagKey: CAMPGROUND_MISSING_FLAG_KEY }
      : {}),
    ...(greeter === undefined
      ? {}
      : { missingFlagOwnerNpcKey: greeter.npcKey }),
    missingFlagPhase: "not-started",
    npcAssignments,
    publicEvent: { phase: "cooldown" },
    seed: DEFAULT_CAMPGROUND_SEED,
    surfaceAmbience: {},
    toolFavor: {
      phase: "unavailable",
      ...(HashMap.has(world, CAMPGROUND_BORROWED_TOOL_KEY)
        ? { requiredItemKey: CAMPGROUND_BORROWED_TOOL_KEY }
        : {})
    },
    version: CAMPGROUND_STATE_VERSION,
    waterFavor: { phase: "unavailable" },
    weather: DEFAULT_CAMPGROUND_WEATHER,
    welcomeFavor: { phase: "unavailable" }
  }
}

export const normalizeCampgroundState = (state: GameState): GameState => {
  const repaired = repairMissingReturnStairs(state)
  if (hasRuntimeDefaults(repaired.campground)) return repaired

  const defaults = defaultCampgroundState(repaired.world)
  const existing = repaired.campground
  return {
    ...repaired,
    campground: existing === undefined
      ? defaults
      : {
        ...(existing.activeTravel === undefined
          ? {}
          : { activeTravel: existing.activeTravel }),
        campPlacements: existing.campPlacements ?? defaults.campPlacements,
        contentVersion: existing.contentVersion ?? defaults.contentVersion,
        discoveredIds: existing.discoveredIds ?? defaults.discoveredIds,
        greetedNpcKeys: existing.greetedNpcKeys ?? defaults.greetedNpcKeys,
        landmarkPlacements: existing.landmarkPlacements
          ?? defaults.landmarkPlacements,
        missingFlagPhase: existing.missingFlagPhase
          ?? defaults.missingFlagPhase,
        npcAssignments: existing.npcAssignments ?? defaults.npcAssignments,
        publicEvent: existing.publicEvent ?? defaults.publicEvent,
        seed: existing.seed ?? defaults.seed,
        surfaceAmbience: existing.surfaceAmbience
          ?? defaults.surfaceAmbience,
        toolFavor: existing.toolFavor ?? defaults.toolFavor,
        version: existing.version,
        waterFavor: existing.waterFavor ?? defaults.waterFavor,
        weather: existing.weather ?? defaults.weather,
        welcomeFavor: existing.welcomeFavor ?? defaults.welcomeFavor,
        ...(existing.missingFlagKey === undefined
            && defaults.missingFlagKey === undefined
          ? {}
          : {
            missingFlagKey: existing.missingFlagKey
              ?? defaults.missingFlagKey
          }),
        ...(existing.missingFlagOwnerNpcKey === undefined
            && defaults.missingFlagOwnerNpcKey === undefined
          ? {}
          : {
            missingFlagOwnerNpcKey: existing.missingFlagOwnerNpcKey
              ?? defaults.missingFlagOwnerNpcKey
          })
      }
  }
}

/** Adds the one-time fresh-run narration after setup has completed. */
export const appendCampgroundWakeUpNarration = (
  state: GameState
): GameState => {
  if (
    state.campground?.weather?.condition !== "heavy-rain"
    || state.gameplayEvents?.some(({ kind }) =>
      kind === "arrival-narration"
    )
  ) return state

  return appendGameplayEvent(state, CAMPGROUND_WAKE_UP_MESSAGE, {
    interruptsTravel: false,
    kind: "arrival-narration"
  })
}

/**
 * Removes only retained fresh-run prose before a save is exposed to a newly
 * connected client. The monotonic event cursor deliberately stays unchanged.
 */
export const prepareRestoredCampgroundState = (
  state: GameState
): GameState => {
  const normalized = normalizeCampgroundState(state)
  const gameplayEvents = normalized.gameplayEvents?.filter(({ kind }) =>
    kind !== "arrival-narration"
  )
  if (gameplayEvents?.length === normalized.gameplayEvents?.length) {
    return normalized
  }
  return {
    ...normalized,
    gameplayEvents
  }
}

const discoveryOrder = new Map<string, number>([
  ...campgroundLandmarks.map(({ id }, index) => [id, index] as const),
  ...campgroundCamps.map(({ id }, index) =>
    [id, campgroundLandmarks.length + index] as const
  )
])

const stableDiscoveryIds = (
  ids: Iterable<string>
): ReadonlyArray<string> =>
  [...new Set(ids)].sort((left, right) =>
    (discoveryOrder.get(left) ?? Number.MAX_SAFE_INTEGER)
      - (discoveryOrder.get(right) ?? Number.MAX_SAFE_INTEGER)
    || left.localeCompare(right)
  )

const stableNpcKeys = (keys: Iterable<string>): ReadonlyArray<string> =>
  [...new Set(keys)].sort((left, right) => left.localeCompare(right))

export const markCampgroundDiscovery = (
  state: GameState,
  id: string
): GameState => {
  const normalized = normalizeCampgroundState(state)
  const campground = normalized.campground
  if (campground === undefined) return normalized
  return {
    ...normalized,
    campground: {
      ...campground,
      discoveredIds: stableDiscoveryIds([
        ...(campground.discoveredIds ?? []),
        id
      ])
    }
  }
}

export const markCampgroundGreeting = (
  state: GameState,
  npcKey: string
): GameState => {
  const normalized = normalizeCampgroundState(state)
  const campground = normalized.campground
  if (campground === undefined) return normalized
  return {
    ...normalized,
    campground: {
      ...campground,
      greetedNpcKeys: stableNpcKeys([
        ...(campground.greetedNpcKeys ?? []),
        npcKey
      ])
    }
  }
}

const playerFrom = (world: World): Entity | undefined =>
  worldEntities(world).find(({ _tag }) => _tag === "player")

const currentLandmarkAddress = (
  player: Entity,
  placements: ReadonlyArray<LandmarkPlacement>
): string | undefined =>
  placements.map((placement) => ({
    distance: positionDistance(
      player.at,
      placement.travelAt ?? placement.at
    ),
    placement
  })).filter(({ distance, placement }) =>
    placement.at.z === player.at.z && distance <= CURRENT_LANDMARK_RADIUS
  ).sort((left, right) =>
    left.distance - right.distance
    || left.placement.id.localeCompare(right.placement.id)
  ).at(0)?.placement.address.label

const currentAddressFor = (
  state: GameState,
  campground: CampgroundState
): string | undefined => {
  const player = playerFrom(state.world)
  if (player === undefined || player.at.z !== 0) return undefined
  const savedCampAddress = (campground.campPlacements ?? []).map(
    (placement) => ({
      distance: positionDistance(player.at, placement.entranceAt),
      placement
    })
  ).filter(({ distance, placement }) =>
    placement.entranceAt.z === player.at.z
    && distance <= CURRENT_LANDMARK_RADIUS
  ).sort((left, right) =>
    left.distance - right.distance
    || left.placement.id.localeCompare(right.placement.id)
  ).at(0)?.placement.address.label

  const landmarkAddress = currentLandmarkAddress(
    player,
    campground.landmarkPlacements ?? []
  )
  if (savedCampAddress !== undefined || landmarkAddress !== undefined) {
    return savedCampAddress ?? landmarkAddress
  }

  const playerIsOnRoad = worldEntities(state.world).some((entity) =>
    entity._tag === "tunnel"
    && entity.at.z === player.at.z
    && positionDistance(entity.at, player.at) === 0
  )
  if (!playerIsOnRoad) return undefined

  const center = (campground.landmarkPlacements ?? []).find(({ id }) =>
    id === "central-effigy"
  )?.at
  if (center === undefined) return "Campground road"
  const horizontalDistance = Math.abs(player.at.x - center.x)
  const verticalDistance = Math.abs(player.at.y - center.y)
  const district = horizontalDistance > verticalDistance
    ? player.at.x < center.x ? "west" : "east"
    : player.at.y < center.y
    ? "north"
    : "south"
  return campgroundRoads.find((road) => road.district === district)?.name
    ?? "Campground road"
}

const discoveredLandmarkViews = (
  campground: CampgroundState,
  player: Entity | undefined
): CampgroundView["discoveredLandmarks"] => {
  const discovered = new Set(campground.discoveredIds ?? [])
  const campViews = (campground.campPlacements ?? []).filter(({ id }) =>
    discovered.has(id)
  ).map((placement) => ({
    address: placement.address.label,
    at: placement.entranceAt,
    id: placement.id,
    kind: placement.kind,
    name: placement.name,
    travelAvailable: player?.at.z === placement.entranceAt.z
  }))
  const landmarkViews = (campground.landmarkPlacements ?? []).filter((
    { id }
  ) => discovered.has(id)).map((placement) => ({
    address: placement.address.label,
    at: placement.travelAt ?? placement.at,
    id: placement.id,
    kind: placement.kind,
    name: placement.name,
    travelAvailable: player?.at.z === placement.at.z
      && placement.travelAt !== undefined
  }))

  const order = new Map(
    stableDiscoveryIds([...discovered]).map((id, index) => [id, index])
  )
  return [...campViews, ...landmarkViews].sort((left, right) =>
    (order.get(left.id) ?? Number.MAX_SAFE_INTEGER)
      - (order.get(right.id) ?? Number.MAX_SAFE_INTEGER)
    || left.id.localeCompare(right.id)
  )
}

const activeEventForView = (
  campground: CampgroundState
): CampgroundView["activeEvent"] => {
  const event = campground.publicEvent
  const hostCampId = event?.hostCampId
  if (
    event?.phase !== "active"
    || event.kind === undefined
    || hostCampId === undefined
    || !(campground.discoveredIds ?? []).includes(hostCampId)
  ) return undefined

  const host = (campground.campPlacements ?? []).find(({ id }) =>
    id === hostCampId
  )
  if (host === undefined) return undefined
  return {
    hostCampId,
    kind: event.kind,
    landmarkId: hostCampId,
    name: `${event.kind} at ${host.name}`,
    ...(event.endTurn === undefined ? {} : { endTurn: event.endTurn })
  }
}

export const campgroundViewForState = (
  state: GameState
): CampgroundView => {
  const normalized = normalizeCampgroundState(state)
  const campground = normalized.campground
  if (campground === undefined) return { discoveredLandmarks: [] }
  const player = playerFrom(normalized.world)
  const currentAddress = currentAddressFor(normalized, campground)
  const activeEvent = activeEventForView(campground)

  return {
    discoveredLandmarks: discoveredLandmarkViews(
      campground,
      player
    ),
    ...(currentAddress === undefined ? {} : { currentAddress }),
    ...(activeEvent === undefined ? {} : { activeEvent }),
    ...(campground.weather === undefined || player?.at.z !== 0
      ? {}
      : { weather: campground.weather })
  }
}
