import { HashMap, Option } from "effect"
import type { Player } from "./creatures.js"
import type { TKey } from "./entity.js"
import {
  CAMPGROUND_HEIGHT,
  CAMPGROUND_WIDTH,
  type Entity,
  type World
} from "./world.js"

export const SERVER_VIEWPORT_WIDTH = 80
export const SERVER_VIEWPORT_HEIGHT = 20
export const CAMPGROUND_ACTIVE_MARGIN = 5
export const MOVEMENT_TARGET_MARGIN = 1

export type ActiveRegionBounds = {
  readonly left: number
  readonly rightExclusive: number
  readonly top: number
  readonly bottomExclusive: number
  readonly z: number
}

export type CampgroundActiveRegion = {
  readonly viewport: ActiveRegionBounds
  readonly actorBounds: ActiveRegionBounds
  readonly collisionBounds: ActiveRegionBounds
  readonly actorWorld: World
  readonly collisionWorld: World
}

export type CampgroundStaticMetadata = {
  readonly maxX: number
  readonly maxY: number
}

export const campgroundStaticMetadata = (): CampgroundStaticMetadata => ({
  maxX: CAMPGROUND_WIDTH - 1,
  maxY: CAMPGROUND_HEIGHT - 1
})

const clamp = (value: number, low: number, high: number): number =>
  Math.min(Math.max(value, low), high)

const isWorldEntityOnLevel = (z: number) => (entity: Entity): boolean =>
  entity.in === "world" && entity.at.z === z

const hasCampgroundExtents = (
  entities: Iterable<Entity>,
  z: number,
  metadata: CampgroundStaticMetadata
): boolean => {
  let hasOrigin = false
  let hasFarCorner = false

  for (const entity of entities) {
    if (!isWorldEntityOnLevel(z)(entity)) continue

    if (entity.at.x === 0 && entity.at.y === 0) {
      hasOrigin = true
    }
    if (entity.at.x === metadata.maxX && entity.at.y === metadata.maxY) {
      hasFarCorner = true
    }
    if (hasOrigin && hasFarCorner) return true
  }

  return false
}

const expandBounds = (
  bounds: ActiveRegionBounds,
  margin: number
): ActiveRegionBounds => ({
  bottomExclusive: bounds.bottomExclusive + margin,
  left: bounds.left - margin,
  rightExclusive: bounds.rightExclusive + margin,
  top: bounds.top - margin,
  z: bounds.z
})

export const entityWithinBounds =
  (bounds: ActiveRegionBounds) => (entity: Entity): boolean =>
    entity.in === "world"
    && entity.at.z === bounds.z
    && entity.at.x >= bounds.left
    && entity.at.x < bounds.rightExclusive
    && entity.at.y >= bounds.top
    && entity.at.y < bounds.bottomExclusive

export const filterWorldToBounds = (
  world: World,
  bounds: ActiveRegionBounds
): World => world.pipe(HashMap.filter(entityWithinBounds(bounds)))

export const syncEntityIntoBoundedWorld = (
  boundedWorld: World,
  bounds: ActiveRegionBounds,
  entityKey: TKey,
  fullWorld: World
): World => {
  const entity = fullWorld.pipe(HashMap.get(entityKey))
  if (Option.isSome(entity) && entityWithinBounds(bounds)(entity.value)) {
    return boundedWorld.pipe(HashMap.set(entityKey, entity.value))
  }
  return boundedWorld.pipe(HashMap.remove(entityKey))
}

export const campgroundActiveRegionForWorld = (
  world: World,
  player: Player,
  metadata: CampgroundStaticMetadata = campgroundStaticMetadata()
): CampgroundActiveRegion | undefined => {
  if (player.in !== "world") return undefined

  const worldEntities = Array.from(world.pipe(HashMap.values))
  if (!hasCampgroundExtents(worldEntities, player.at.z, metadata)) {
    return undefined
  }

  const left = clamp(
    player.at.x - Math.floor(SERVER_VIEWPORT_WIDTH / 2),
    0,
    Math.max(0, metadata.maxX - SERVER_VIEWPORT_WIDTH + 1)
  )
  const top = clamp(
    player.at.y - Math.floor(SERVER_VIEWPORT_HEIGHT / 2),
    0,
    Math.max(0, metadata.maxY - SERVER_VIEWPORT_HEIGHT + 1)
  )
  const normalizedViewport: ActiveRegionBounds = {
    bottomExclusive: top + SERVER_VIEWPORT_HEIGHT,
    left,
    rightExclusive: left + SERVER_VIEWPORT_WIDTH,
    top,
    z: player.at.z
  }
  const actorBounds = expandBounds(
    normalizedViewport,
    CAMPGROUND_ACTIVE_MARGIN
  )
  const collisionBounds = expandBounds(actorBounds, MOVEMENT_TARGET_MARGIN)
  const actorEntries: Array<readonly [string, Entity]> = []
  const collisionEntries: Array<readonly [string, Entity]> = []

  for (const entity of worldEntities) {
    if (entityWithinBounds(collisionBounds)(entity)) {
      collisionEntries.push([entity.key, entity] as const)
      if (entityWithinBounds(actorBounds)(entity)) {
        actorEntries.push([entity.key, entity] as const)
      }
    }
  }

  return {
    actorBounds,
    actorWorld: HashMap.fromIterable(actorEntries),
    collisionBounds,
    collisionWorld: HashMap.fromIterable(collisionEntries),
    viewport: normalizedViewport
  }
}
