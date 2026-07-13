import { isCreatureTag } from "@flaghack/domain/creatureCapabilities"
import { HashMap } from "effect"
import {
  type CampgroundAddress,
  type CampgroundCampDefinition,
  campgroundCamps,
  type CampgroundLandmarkDefinition,
  campgroundLandmarks,
  type CampgroundRoadDefinition,
  campgroundRoads
} from "./campground.js"
import type { TPos } from "./position.js"
import type { Entity, World } from "./world.js"

export interface CampgroundCatalog {
  readonly camps: ReadonlyArray<CampgroundCampDefinition>
  readonly landmarks: ReadonlyArray<CampgroundLandmarkDefinition>
  readonly roads: ReadonlyArray<CampgroundRoadDefinition>
}

export const defaultCampgroundCatalog: CampgroundCatalog = {
  camps: campgroundCamps,
  landmarks: campgroundLandmarks,
  roads: campgroundRoads
}

export type CampgroundPlaceKey = `camp:${string}` | `landmark:${string}`

interface CampgroundPlaceBase {
  readonly at: TPos
  readonly catalogOrder: number
  readonly discoveryKey: CampgroundPlaceKey
  readonly entityKeys: ReadonlyArray<string>
  readonly id: string
  readonly name: string
}

export interface DiscoverableCampRecord extends CampgroundPlaceBase {
  readonly _tag: "camp"
  readonly address: CampgroundAddress
  readonly addressLabel: string
  readonly definition: CampgroundCampDefinition
}

export interface DiscoverableLandmarkRecord extends CampgroundPlaceBase {
  readonly _tag: "landmark"
  readonly addressLabel: string
  readonly definition: CampgroundLandmarkDefinition
}

export type DiscoverableCampgroundPlace =
  | DiscoverableCampRecord
  | DiscoverableLandmarkRecord

export interface CampgroundProximity<T> {
  readonly distance: number
  readonly record: T
}

export interface CampgroundAddressMatch {
  readonly address: CampgroundAddress
  readonly addressLabel: string
  readonly camp: DiscoverableCampRecord
  readonly distance: number
}

export interface CampgroundRoute {
  readonly destination: DiscoverableCampgroundPlace
  readonly directions: string
  readonly nextStep: TPos | undefined
  readonly path: ReadonlyArray<TPos> | undefined
}

const DEFAULT_CURRENT_CAMP_RADIUS = 12
const ROAD_STEP_COST = 10
const OFF_ROAD_STEP_COST = 40
const DIAGONAL_COST_NUMERATOR = 14
const CARDINAL_COST_NUMERATOR = 10

const positionKey = ({ x, y, z }: TPos): string => `${x},${y},${z}`

const samePosition = (left: TPos, right: TPos): boolean =>
  left.x === right.x && left.y === right.y && left.z === right.z

const manhattanDistance = (left: TPos, right: TPos): number =>
  Math.abs(left.x - right.x)
  + Math.abs(left.y - right.y)
  + Math.abs(left.z - right.z)

const normalizeLabel = (label: string): string =>
  label.trim().toLocaleLowerCase().replaceAll(/\s+/g, " ")

const signMatches = (entity: Entity, labels: ReadonlyArray<string>) =>
  entity._tag === "sign"
  && labels.some((label) =>
    normalizeLabel(entity.name) === normalizeLabel(label)
  )

const signMatchesCamp = (
  entity: Entity,
  definition: CampgroundCampDefinition
): boolean => {
  if (entity._tag !== "sign") return false
  const signLabel = normalizeLabel(entity.name)
  const campName = normalizeLabel(definition.name)
  return signLabel === campName || signLabel.startsWith(`${campName} — `)
}

const entitiesOnLevel = (world: World, z: number): ReadonlyArray<Entity> =>
  Array.from(world.pipe(HashMap.values)).filter((entity) =>
    entity.in === "world" && entity.at.z === z
  )

const representativeEntity = (
  entities: ReadonlyArray<Entity>
): Entity | undefined => {
  if (entities.length === 0) return undefined

  const center = entities.reduce(
    (total, entity) => ({
      x: total.x + entity.at.x / entities.length,
      y: total.y + entity.at.y / entities.length,
      z: entity.at.z
    }),
    { x: 0, y: 0, z: entities[0]?.at.z ?? 0 }
  )

  return [...entities].sort((left, right) => {
    const distanceComparison = manhattanDistance(left.at, center)
      - manhattanDistance(right.at, center)
    return distanceComparison !== 0
      ? distanceComparison
      : left.key.localeCompare(right.key)
  }).at(0)
}

const makeEntityKeys = (
  entities: ReadonlyArray<Entity>
): ReadonlyArray<string> =>
  [...new Set(entities.map(({ key }) => key))].sort((left, right) =>
    left.localeCompare(right)
  )

export const campPlaceKey = (id: string): CampgroundPlaceKey =>
  `camp:${id}`

export const landmarkPlaceKey = (id: string): CampgroundPlaceKey =>
  `landmark:${id}`

export const campgroundPlaceKey = (
  place: Pick<DiscoverableCampgroundPlace, "_tag" | "id">
): CampgroundPlaceKey =>
  place._tag === "camp"
    ? campPlaceKey(place.id)
    : landmarkPlaceKey(place.id)

export const discoverCampgroundCamps = (
  world: World,
  catalog: CampgroundCatalog = defaultCampgroundCatalog,
  z = 0
): ReadonlyArray<DiscoverableCampRecord> => {
  const entities = entitiesOnLevel(world, z)

  return catalog.camps.flatMap((definition, catalogOrder) => {
    const matches = entities.filter((entity) =>
      signMatchesCamp(entity, definition)
    )
    const representative = representativeEntity(matches)
    if (representative === undefined) return []

    return [{
      _tag: "camp" as const,
      address: definition.address,
      addressLabel: formatCatalogAddress(definition.address, catalog),
      at: representative.at,
      catalogOrder,
      definition,
      discoveryKey: campPlaceKey(definition.id),
      entityKeys: makeEntityKeys(matches),
      id: definition.id,
      name: definition.name
    }]
  })
}

const formatCatalogAddress = (
  address: CampgroundAddress,
  catalog: CampgroundCatalog
): string => {
  const road = catalog.roads.find(({ id }) => id === address.roadId)
  return road === undefined
    ? address.marker
    : `${address.marker}, ${road.name}`
}

const landmarkMatches = (
  definition: CampgroundLandmarkDefinition,
  entity: Entity
): boolean => {
  if (
    signMatches(entity, [
      definition.name,
      definition.signText,
      definition.addressLabel
    ])
  ) return true

  switch (definition.id) {
    case "arrival-plaza":
      return entity._tag === "camp-prop" && entity.kind === "arrival-gate"
    case "directory":
      return entity._tag === "camp-prop" && entity.kind === "directory"
    case "water-station":
      return entity._tag === "camp-prop" && entity.kind === "water-station"
    case "central-effigy":
      return entity._tag === "effigy"
    case "temple":
      return entity._tag === "temple"
  }
}

export const discoverCampgroundLandmarks = (
  world: World,
  catalog: CampgroundCatalog = defaultCampgroundCatalog,
  z = 0
): ReadonlyArray<DiscoverableLandmarkRecord> => {
  const entities = entitiesOnLevel(world, z)

  return catalog.landmarks.flatMap((definition, catalogOrder) => {
    const matches = entities.filter((entity) =>
      landmarkMatches(definition, entity)
    )
    const representative = representativeEntity(matches)
    if (representative === undefined) return []

    return [{
      _tag: "landmark" as const,
      addressLabel: definition.addressLabel,
      at: representative.at,
      catalogOrder,
      definition,
      discoveryKey: landmarkPlaceKey(definition.id),
      entityKeys: makeEntityKeys(matches),
      id: definition.id,
      name: definition.name
    }]
  })
}

const comparePlaces = (
  left: DiscoverableCampgroundPlace,
  right: DiscoverableCampgroundPlace
): number => {
  if (left._tag !== right._tag) return left._tag === "camp" ? -1 : 1
  const orderComparison = left.catalogOrder - right.catalogOrder
  return orderComparison !== 0
    ? orderComparison
    : left.discoveryKey.localeCompare(right.discoveryKey)
}

export const stableCampgroundPlaces = <
  T extends DiscoverableCampgroundPlace
>(
  places: ReadonlyArray<T>
): ReadonlyArray<T> => [...places].sort(comparePlaces)

export const discoverCampgroundPlaces = (
  world: World,
  catalog: CampgroundCatalog = defaultCampgroundCatalog,
  z = 0
): ReadonlyArray<DiscoverableCampgroundPlace> =>
  stableCampgroundPlaces([
    ...discoverCampgroundCamps(world, catalog, z),
    ...discoverCampgroundLandmarks(world, catalog, z)
  ])

const proximityToCamp = (
  camps: ReadonlyArray<DiscoverableCampRecord>,
  at: TPos
): CampgroundProximity<DiscoverableCampRecord> | undefined =>
  camps.filter((camp) => camp.at.z === at.z).map((record) => ({
    distance: manhattanDistance(at, record.at),
    record
  })).sort((left, right) => {
    const distanceComparison = left.distance - right.distance
    return distanceComparison !== 0
      ? distanceComparison
      : comparePlaces(left.record, right.record)
  }).at(0)

export const nearestCampgroundCamp = (
  world: World,
  at: TPos,
  catalog: CampgroundCatalog = defaultCampgroundCatalog
): CampgroundProximity<DiscoverableCampRecord> | undefined =>
  proximityToCamp(discoverCampgroundCamps(world, catalog, at.z), at)

export const currentCampgroundCamp = (
  world: World,
  at: TPos,
  maximumDistance = DEFAULT_CURRENT_CAMP_RADIUS,
  catalog: CampgroundCatalog = defaultCampgroundCatalog
): CampgroundProximity<DiscoverableCampRecord> | undefined => {
  const nearest = nearestCampgroundCamp(world, at, catalog)
  return nearest !== undefined && nearest.distance <= maximumDistance
    ? nearest
    : undefined
}

const addressMatch = (
  proximity: CampgroundProximity<DiscoverableCampRecord> | undefined
): CampgroundAddressMatch | undefined =>
  proximity === undefined
    ? undefined
    : {
      address: proximity.record.address,
      addressLabel: proximity.record.addressLabel,
      camp: proximity.record,
      distance: proximity.distance
    }

export const nearestCampgroundAddress = (
  world: World,
  at: TPos,
  catalog: CampgroundCatalog = defaultCampgroundCatalog
): CampgroundAddressMatch | undefined =>
  addressMatch(nearestCampgroundCamp(world, at, catalog))

export const currentCampgroundAddress = (
  world: World,
  at: TPos,
  maximumDistance = DEFAULT_CURRENT_CAMP_RADIUS,
  catalog: CampgroundCatalog = defaultCampgroundCatalog
): CampgroundAddressMatch | undefined =>
  addressMatch(currentCampgroundCamp(world, at, maximumDistance, catalog))

const keySet = (keys: Iterable<string>): ReadonlySet<string> =>
  new Set(keys)

export const filterHiddenCampgroundPlaces = <
  T extends DiscoverableCampgroundPlace
>(
  places: ReadonlyArray<T>,
  hiddenPlaceKeys: Iterable<string>
): ReadonlyArray<T> => {
  const hidden = keySet(hiddenPlaceKeys)
  return stableCampgroundPlaces(
    places.filter(({ discoveryKey }) => !hidden.has(discoveryKey))
  )
}

export const filterDiscoveredCampgroundPlaces = <
  T extends DiscoverableCampgroundPlace
>(
  places: ReadonlyArray<T>,
  discoveredPlaceKeys: Iterable<string>,
  hiddenPlaceKeys: Iterable<string> = []
): ReadonlyArray<T> => {
  const discovered = keySet(discoveredPlaceKeys)
  return filterHiddenCampgroundPlaces(
    places.filter(({ discoveryKey }) => discovered.has(discoveryKey)),
    hiddenPlaceKeys
  )
}

export const filterUndiscoveredCampgroundPlaces = <
  T extends DiscoverableCampgroundPlace
>(
  places: ReadonlyArray<T>,
  discoveredPlaceKeys: Iterable<string>,
  hiddenPlaceKeys: Iterable<string> = []
): ReadonlyArray<T> => {
  const discovered = keySet(discoveredPlaceKeys)
  return filterHiddenCampgroundPlaces(
    places.filter(({ discoveryKey }) => !discovered.has(discoveryKey)),
    hiddenPlaceKeys
  )
}

interface NavigationCell {
  readonly entities: ReadonlyArray<Entity>
  readonly hasTunnel: boolean
  readonly passable: boolean
  readonly pos: TPos
}

const terrainIsPassable = (entity: Entity): boolean => {
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
      return entity.kind === "arrival-gate"
        || entity.kind === "stage"
        || entity.kind === "directory"
        || entity.kind === "lantern"
    default:
      return false
  }
}

const entityBlocksMovement = (entity: Entity): boolean => {
  if (isCreatureTag(entity._tag)) return true
  switch (entity._tag) {
    case "wall":
    case "tent-wall":
    case "tent-post":
      return true
    case "door":
      return !entity.open
    case "camp-prop":
      return !terrainIsPassable(entity)
    default:
      return false
  }
}

const makeNavigationGrid = (
  world: World,
  start: TPos
): ReadonlyMap<string, NavigationCell> => {
  const grouped = new Map<string, Array<Entity>>()
  for (const entity of world.pipe(HashMap.values)) {
    if (entity.in !== "world" || entity.at.z !== start.z) continue
    const key = positionKey(entity.at)
    grouped.set(key, [...(grouped.get(key) ?? []), entity])
  }

  const startKey = positionKey(start)
  return new Map(
    Array.from(grouped, ([key, entities]) => {
      const passableTerrain = entities.some(terrainIsPassable)
      const blocked = key !== startKey
        && entities.some(entityBlocksMovement)
      return [key, {
        entities,
        hasTunnel: entities.some(({ _tag }) => _tag === "tunnel"),
        passable: passableTerrain && !blocked,
        pos: entities[0]?.at ?? start
      }] as const
    })
  )
}

const navigationDeltas = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 1, y: -1 },
  { x: 1, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 }
] as const

const isAdjacentStep = (from: TPos, to: TPos): boolean =>
  from.z === to.z
  && Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y)) === 1

export const isLegalCampgroundStep = (
  world: World,
  from: TPos,
  to: TPos
): boolean => {
  if (!isAdjacentStep(from, to)) return false
  const requiredPositions = [
    to,
    ...(from.x === to.x || from.y === to.y
      ? []
      : [
        { x: from.x, y: to.y, z: from.z },
        { x: to.x, y: from.y, z: from.z }
      ])
  ]
  const requiredKeys = new Set(requiredPositions.map(positionKey))
  const entitiesByPosition = new Map<string, Array<Entity>>()
  for (const entity of world.pipe(HashMap.values)) {
    if (entity.in !== "world") continue
    const key = positionKey(entity.at)
    if (!requiredKeys.has(key)) continue
    const entities = entitiesByPosition.get(key)
    if (entities === undefined) entitiesByPosition.set(key, [entity])
    else entities.push(entity)
  }

  return requiredPositions.every((position) => {
    const entities = entitiesByPosition.get(positionKey(position)) ?? []
    return entities.some(terrainIsPassable)
      && !entities.some(entityBlocksMovement)
  })
}

interface PathNode {
  readonly estimatedTotal: number
  readonly key: string
  readonly pathCost: number
}

const comparePathNodes = (left: PathNode, right: PathNode): number => {
  const estimateComparison = left.estimatedTotal - right.estimatedTotal
  if (estimateComparison !== 0) return estimateComparison
  const pathComparison = left.pathCost - right.pathCost
  return pathComparison !== 0
    ? pathComparison
    : left.key.localeCompare(right.key)
}

class MinHeap {
  readonly #values: Array<PathNode> = []

  get size(): number {
    return this.#values.length
  }

  push(value: PathNode): void {
    this.#values.push(value)
    let index = this.#values.length - 1
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2)
      const parent = this.#values[parentIndex]
      if (parent === undefined || comparePathNodes(parent, value) <= 0) {
        break
      }
      this.#values[index] = parent
      index = parentIndex
    }
    this.#values[index] = value
  }

  pop(): PathNode | undefined {
    const first = this.#values[0]
    const last = this.#values.pop()
    if (
      first === undefined || last === undefined
      || this.#values.length === 0
    ) {
      return first
    }

    let index = 0
    while (true) {
      const leftIndex = index * 2 + 1
      const rightIndex = leftIndex + 1
      const left = this.#values[leftIndex]
      const right = this.#values[rightIndex]
      if (left === undefined) break
      const childIndex = right !== undefined
          && comparePathNodes(right, left) < 0
        ? rightIndex
        : leftIndex
      const child = this.#values[childIndex]
      if (child === undefined || comparePathNodes(last, child) <= 0) break
      this.#values[index] = child
      index = childIndex
    }
    this.#values[index] = last
    return first
  }
}

const minimumRemainingCost = (from: TPos, to: TPos): number => {
  const dx = Math.abs(from.x - to.x)
  const dy = Math.abs(from.y - to.y)
  const diagonalSteps = Math.min(dx, dy)
  const cardinalSteps = Math.max(dx, dy) - diagonalSteps
  return diagonalSteps * DIAGONAL_COST_NUMERATOR
    + cardinalSteps * CARDINAL_COST_NUMERATOR
}

const movementCost = (
  from: TPos,
  cell: NavigationCell
): number => {
  const terrainCost = cell.hasTunnel ? ROAD_STEP_COST : OFF_ROAD_STEP_COST
  const multiplier = from.x !== cell.pos.x && from.y !== cell.pos.y
    ? DIAGONAL_COST_NUMERATOR
    : CARDINAL_COST_NUMERATOR
  return terrainCost * multiplier / CARDINAL_COST_NUMERATOR
}

const diagonalSidesArePassable = (
  cells: ReadonlyMap<string, NavigationCell>,
  from: TPos,
  to: TPos
): boolean => {
  if (from.x === to.x || from.y === to.y) return true
  return [
    { x: from.x, y: to.y, z: from.z },
    { x: to.x, y: from.y, z: from.z }
  ].every((side) => cells.get(positionKey(side))?.passable ?? false)
}

const reconstructPath = (
  cells: ReadonlyMap<string, NavigationCell>,
  cameFrom: ReadonlyMap<string, string>,
  start: TPos,
  destination: TPos
): ReadonlyArray<TPos> | undefined => {
  const startKey = positionKey(start)
  let currentKey = positionKey(destination)
  const reversed: Array<TPos> = [destination]
  const seen = new Set<string>()

  while (currentKey !== startKey) {
    if (seen.has(currentKey)) return undefined
    seen.add(currentKey)
    const previousKey = cameFrom.get(currentKey)
    if (previousKey === undefined) return undefined
    currentKey = previousKey
    reversed.push(
      currentKey === startKey
        ? start
        : cells.get(currentKey)?.pos ?? start
    )
  }

  return reversed.reverse()
}

export const roadWeightedCampgroundPath = (
  world: World,
  start: TPos,
  destination: TPos
): ReadonlyArray<TPos> | undefined => {
  if (start.z !== destination.z) return undefined
  if (samePosition(start, destination)) return [start]

  const cells = makeNavigationGrid(world, start)
  const destinationCell = cells.get(positionKey(destination))
  if (destinationCell === undefined || !destinationCell.passable) {
    return undefined
  }

  const startKey = positionKey(start)
  const destinationKey = positionKey(destination)
  const frontier = new MinHeap()
  const pathCosts = new Map<string, number>([[startKey, 0]])
  const cameFrom = new Map<string, string>()
  frontier.push({
    estimatedTotal: minimumRemainingCost(start, destination),
    key: startKey,
    pathCost: 0
  })

  while (frontier.size > 0) {
    const active = frontier.pop()
    if (active === undefined) break
    if (active.pathCost !== pathCosts.get(active.key)) continue
    if (active.key === destinationKey) {
      return reconstructPath(cells, cameFrom, start, destination)
    }

    const activePosition = active.key === startKey
      ? start
      : cells.get(active.key)?.pos
    if (activePosition === undefined) continue

    for (const delta of navigationDeltas) {
      const neighborPosition: TPos = {
        x: activePosition.x + delta.x,
        y: activePosition.y + delta.y,
        z: activePosition.z
      }
      const neighborKey = positionKey(neighborPosition)
      const neighbor = cells.get(neighborKey)
      if (
        neighbor === undefined
        || !neighbor.passable
        || !diagonalSidesArePassable(
          cells,
          activePosition,
          neighborPosition
        )
      ) continue

      const candidateCost = active.pathCost
        + movementCost(activePosition, neighbor)
      const knownCost = pathCosts.get(neighborKey)
      if (knownCost !== undefined && candidateCost >= knownCost) continue

      cameFrom.set(neighborKey, active.key)
      pathCosts.set(neighborKey, candidateCost)
      frontier.push({
        estimatedTotal: candidateCost
          + minimumRemainingCost(neighbor.pos, destination),
        key: neighborKey,
        pathCost: candidateCost
      })
    }
  }

  return undefined
}

export const nextRoadWeightedCampgroundStep = (
  world: World,
  start: TPos,
  destination: TPos
): TPos | undefined =>
  roadWeightedCampgroundPath(world, start, destination)?.at(1)

export const campgroundRoadStepShare = (
  world: World,
  path: ReadonlyArray<TPos> | undefined
): number => {
  const start = path?.at(0)
  if (path === undefined || start === undefined || path.length < 2) {
    return 0
  }
  const cells = makeNavigationGrid(world, start)
  const steps = path.slice(1)
  const roadSteps =
    steps.filter((step) =>
      cells.get(positionKey(step))?.hasTunnel ?? false
    ).length
  return roadSteps / steps.length
}

const headingName = (from: TPos, to: TPos): string => {
  const horizontal = to.x > from.x ? "east" : to.x < from.x ? "west" : ""
  const vertical = to.y > from.y ? "south" : to.y < from.y ? "north" : ""
  return `${vertical}${horizontal}`
}

const roadForDestination = (
  destination: DiscoverableCampgroundPlace,
  catalog: CampgroundCatalog
): CampgroundRoadDefinition | undefined =>
  destination._tag === "camp"
    ? catalog.roads.find(({ id }) => id === destination.address.roadId)
    : undefined

const roadSignOnPath = (
  world: World,
  path: ReadonlyArray<TPos>,
  catalog: CampgroundCatalog
): CampgroundRoadDefinition | undefined => {
  const pathIndexes = new Map(
    path.map((position, index) => [positionKey(position), index] as const)
  )
  return Array.from(world.pipe(HashMap.values)).filter((entity) =>
    entity.in === "world"
    && entity._tag === "sign"
    && pathIndexes.has(positionKey(entity.at))
  ).flatMap((signEntity) =>
    catalog.roads.flatMap((road) =>
      signMatches(signEntity, [road.name, road.signLabel])
        ? [{
          index: pathIndexes.get(positionKey(signEntity.at)) ?? Infinity,
          road
        }]
        : []
    )
  ).sort((left, right) =>
    left.index - right.index || left.road.id.localeCompare(right.road.id)
  ).at(0)?.road
}

const pathStartsOnRoad = (
  world: World,
  path: ReadonlyArray<TPos>
): boolean => {
  const start = path.at(0)
  return start !== undefined
    && Array.from(world.pipe(HashMap.values)).some((entity) =>
      entity.in === "world"
      && entity._tag === "tunnel"
      && samePosition(entity.at, start)
    )
}

export const formatCampgroundDirections = (
  world: World,
  path: ReadonlyArray<TPos> | undefined,
  destination: DiscoverableCampgroundPlace,
  catalog: CampgroundCatalog = defaultCampgroundCatalog
): string => {
  if (path === undefined || path.length === 0) {
    return `No legal route to ${destination.name}.`
  }
  if (path.length === 1) return `You are at ${destination.name}.`

  const start = path[0]
  const next = path[1]
  if (start === undefined || next === undefined) {
    return `No legal route to ${destination.name}.`
  }

  const heading = headingName(start, next)
  const signedRoad = roadSignOnPath(world, path, catalog)
  const destinationRoad = roadForDestination(destination, catalog)
  const road = signedRoad ?? destinationRoad
  const addressCue = destination._tag === "camp"
    ? destination.address.marker
    : destination.addressLabel

  if (road !== undefined) {
    const verb = pathStartsOnRoad(world, path) ? "follow" : "join"
    return `Head ${heading}, ${verb} ${road.name} toward ${addressCue}, and continue to ${destination.name}.`
  }
  return `Head ${heading} toward ${addressCue}, and continue to ${destination.name}.`
}

export const routeToCampgroundPlace = (
  world: World,
  start: TPos,
  destination: DiscoverableCampgroundPlace,
  catalog: CampgroundCatalog = defaultCampgroundCatalog
): CampgroundRoute => {
  const path = roadWeightedCampgroundPath(world, start, destination.at)
  return {
    destination,
    directions: formatCampgroundDirections(
      world,
      path,
      destination,
      catalog
    ),
    nextStep: path?.at(1),
    path
  }
}
