import { HashMap, Option } from "effect"
import type { Player } from "./creatures.js"
import type { TKey } from "./entity.js"
import type { Item } from "./items.js"
import {
  CAMPGROUND_HEIGHT,
  CAMPGROUND_WIDTH,
  type Entity,
  isCreature,
  isItem,
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
  readonly viewportWorld: World
  readonly actorWorld: World
  readonly collisionWorld: World
  readonly offscreenCreatures: ReadonlyArray<Entity>
  readonly playerInventory: HashMap.HashMap<TKey, Item>
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

type CachedCampgroundActiveRegion = {
  readonly maxX: number
  readonly maxY: number
  readonly playerIn: string
  readonly playerKey: TKey
  readonly playerX: number
  readonly playerY: number
  readonly playerZ: number
  readonly region: CampgroundActiveRegion | undefined
}

const campgroundActiveRegionCache = new WeakMap<
  World,
  CachedCampgroundActiveRegion
>()

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
  const viewportEntries: Array<readonly [string, Entity]> = []
  const actorEntries: Array<readonly [string, Entity]> = []
  const collisionEntries: Array<readonly [string, Entity]> = []
  const offscreenCreatures: Array<Entity> = []
  const playerInventoryEntries: Array<readonly [TKey, Item]> = []
  const withinViewport = entityWithinBounds(normalizedViewport)
  const withinActorBounds = entityWithinBounds(actorBounds)
  const withinCollisionBounds = entityWithinBounds(collisionBounds)
  let hasOrigin = false
  let hasFarCorner = false

  for (const [worldKey, entity] of world.pipe(HashMap.entries)) {
    if (isItem(entity) && entity.in === player.key) {
      playerInventoryEntries.push([worldKey, entity] as const)
    }

    if (entity.in === "world" && entity.at.z === player.at.z) {
      if (entity.at.x === 0 && entity.at.y === 0) hasOrigin = true
      if (
        entity.at.x === metadata.maxX && entity.at.y === metadata.maxY
      ) hasFarCorner = true
    }

    if (withinCollisionBounds(entity)) {
      collisionEntries.push([entity.key, entity] as const)
      if (withinActorBounds(entity)) {
        actorEntries.push([entity.key, entity] as const)
        if (withinViewport(entity)) {
          viewportEntries.push([entity.key, entity] as const)
        }
      }
    } else if (
      entity.in === "world"
      && entity.at.z === collisionBounds.z
      && entity._tag !== "player"
      && isCreature(entity)
    ) {
      offscreenCreatures.push(entity)
    }
  }

  if (!hasOrigin || !hasFarCorner) return undefined

  return {
    actorBounds,
    actorWorld: HashMap.fromIterable(actorEntries),
    collisionBounds,
    collisionWorld: HashMap.fromIterable(collisionEntries),
    offscreenCreatures: offscreenCreatures.sort((left, right) =>
      left.key.localeCompare(right.key)
    ),
    playerInventory: HashMap.fromIterable(playerInventoryEntries),
    viewport: normalizedViewport,
    viewportWorld: HashMap.fromIterable(viewportEntries)
  }
}

/**
 * Reuses the bounded projections while an immutable world and its player are
 * unchanged. Persistent HashMap updates produce a new identity, so a cached
 * region cannot outlive a world mutation.
 */
export const cachedCampgroundActiveRegionForWorld = (
  world: World,
  player: Player,
  metadata: CampgroundStaticMetadata = campgroundStaticMetadata()
): CampgroundActiveRegion | undefined => {
  const cached = campgroundActiveRegionCache.get(world)
  if (
    cached !== undefined
    && cached.maxX === metadata.maxX
    && cached.maxY === metadata.maxY
    && cached.playerIn === player.in
    && cached.playerKey === player.key
    && cached.playerX === player.at.x
    && cached.playerY === player.at.y
    && cached.playerZ === player.at.z
  ) return cached.region

  const region = campgroundActiveRegionForWorld(world, player, metadata)
  campgroundActiveRegionCache.set(world, {
    maxX: metadata.maxX,
    maxY: metadata.maxY,
    playerIn: player.in,
    playerKey: player.key,
    playerX: player.at.x,
    playerY: player.at.y,
    playerZ: player.at.z,
    region
  })
  return region
}
