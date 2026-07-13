import { isCreatureTag } from "@flaghack/domain/creatureCapabilities"
import {
  DrinkItemTags,
  EEntity,
  FoodItemTags
} from "@flaghack/domain/schemas"
import type {
  DirectionalVariant as DirectionalVariantSchema,
  Entity as EntitySchema,
  Player as PlayerSchema,
  World as WorldSchema
} from "@flaghack/domain/schemas"
import { Data, Effect, HashMap, Option, Random } from "effect"
import { range } from "effect/Array"
import { filter } from "effect/HashMap"
import { Set } from "immutable"
import {
  type CampgroundCampDefinition,
  campgroundCamps,
  type CampgroundCoolerLootProfile,
  campgroundRoads,
  formatCampgroundAddress,
  getCampgroundLandmark
} from "./campground.js"
import {
  CAMPGROUND_BORROWED_TOOL_KEY,
  CAMPGROUND_MISSING_FLAG_KEY
} from "./campgroundQuestContent.js"
import {
  campgroundHumanDisplayNames,
  type Creature,
  hippie,
  makeAcidcop,
  makeHippie,
  player,
  ranger
} from "./creatures.js"
import { movePosition } from "./entity.js"
import {
  beer,
  cheese,
  type Cooler,
  cooler,
  hotdog,
  type Item,
  makeGroundFlag,
  makeGroundHammer,
  makeWaterBottle,
  salsa,
  waterbottle
} from "./items.js"
import {
  CounterKeyGeneratorLive,
  type KeyGenerator
} from "./keyGenerator.js"
// import { log } from "./log.js"
import { collideP, shift } from "./position.js"
import type { TPos } from "./position.js"
import {
  campProp,
  type CampPropKind,
  door,
  effigy,
  floor,
  isCampPropPassable,
  makeFloor,
  makeMud,
  makeTunnel,
  sign,
  stairsDown,
  stairsUp,
  temple,
  tent,
  tentDoor,
  tentPost,
  tentWall,
  testWalls,
  tunnel,
  wall
} from "./terrain.js"
import { dijkstraPath } from "./worldUtil.js"

export type Entity = typeof EntitySchema.Type
type Player = typeof PlayerSchema.Type
export type World = typeof WorldSchema.Type

export class LevelGenerationError
  extends Data.TaggedError("LevelGenerationError")<{
    readonly reason: string
  }>
{}

const levelGenerationError = (reason: string) =>
  new LevelGenerationError({ reason })

export const initWorld: Array<Entity> = [
  player(3, 3, 0),
  ...testWalls,
  makeGroundFlag("init-flag-0", { x: 4, y: 4, z: 0 }),
  makeGroundFlag("init-flag-1", { x: 52, y: 7, z: 0 }),
  makeGroundFlag("init-flag-2", { x: 52, y: 9, z: 0 }),
  makeGroundFlag("init-flag-3", { x: 58, y: 9, z: 0 }),
  makeHippie("init-hippie-0", 50, 3, 0),
  makeAcidcop("init-acidcop-0", 53, 4, 0),
  makeWaterBottle("init-water-0", 0, 0, 0, "player"),
  makeWaterBottle("init-water-1", 4, 4, 0, "world")
]

export const isContainedIn = <T extends Entity, C extends Entity>(
  contained: T,
  container: C
) => container.key === contained.in

const foodItemTags = new globalThis.Set<Entity["_tag"]>(FoodItemTags)
const drinkItemTags = new globalThis.Set<Entity["_tag"]>(DrinkItemTags)
const itemTags = new globalThis.Set<Entity["_tag"]>([
  "flag",
  ...DrinkItemTags,
  ...FoodItemTags,
  "hammer",
  "nails",
  "cooler"
])
const terrainTags = new globalThis.Set<Entity["_tag"]>([
  "wall",
  "door",
  "tent-wall",
  "tent-post",
  "floor",
  "mud",
  "tunnel",
  "tent",
  "sign",
  "effigy",
  "temple",
  "stairs-down",
  "stairs-up",
  "camp-prop"
])

export const isCreature = (e: Entity): e is Creature =>
  isCreatureTag(e._tag)
export const isTerrain = (e: Entity): boolean => terrainTags.has(e._tag)
export const isImpassable = (e: Entity) =>
  e._tag === "wall"
  || e._tag === "tent-wall"
  || e._tag === "tent-post"
  || (e._tag === "door" && !e.open)
  || (e._tag === "camp-prop" && !isCampPropPassable(e.kind))
export const isPassableTerrain = (e: Entity) =>
  isTerrain(e) && !isImpassable(e)
export const isPlayer = (e: Entity): e is Player => e._tag === "player"
export const isHippie = (e: Entity) => e._tag === "hippie"
export const isItem = (e: Entity): e is Item => itemTags.has(e._tag)
export const isFoodItem = (e: Entity): e is Item =>
  isItem(e) && foodItemTags.has(e._tag)
export const isDrinkItem = (e: Entity): e is Item =>
  isItem(e) && drinkItemTags.has(e._tag)
export const isContainer = (e: Entity): e is Cooler => e._tag === "cooler"
// export const creaturesFrom = <T extends World>(
//   w: T
// ): HashMap.HashMap<string, Creature> => w.pipe(filter(isCreature))
export const notPlayerFrom = <T extends World>(w: T) =>
  w.pipe(filter((o) => !isPlayer(o)))
export const isAt = (p: TPos) => <T extends Entity>(e: T) =>
  e.in === "world" && collideP(p)(e.at)
export const isCampgroundShelterPosition = (
  world: World,
  position: TPos
): boolean => {
  let templeCenter: TPos | undefined
  for (const entity of world.pipe(HashMap.values)) {
    if (
      entity.in === "world"
      && entity._tag === "tent"
      && collideP(position)(entity.at)
    ) return true
    if (entity.in === "world" && entity._tag === "temple") {
      templeCenter = entity.at
    }
  }
  return templeCenter !== undefined
    && templeCenter.z === position.z
    && Math.abs(templeCenter.x - position.x) < 6
    && Math.abs(templeCenter.y - position.y) < 4
}
export const itemsAt = (world: World) => (pos: TPos) =>
  world.pipe(filter(isItem), filter(isAt(pos)))
export const containersAt = (world: World) => (pos: TPos) =>
  world.pipe(filter(isContainer), filter(isAt(pos)))

export const actPosition =
  (w: World) => <T extends Entity>(e: Option.Option<T>, by: TPos) => {
    return Option.match({
      onNone: () => e,
      onSome: (e: T) => {
        const newPosition = shift(e.at, by)
        const eCollides = collideP(newPosition)
        let hasPassableTerrain = false
        let hasBlockingEntity = false

        for (const candidate of w.pipe(HashMap.values)) {
          if (!eCollides(candidate.at)) continue

          if (isPassableTerrain(candidate)) {
            hasPassableTerrain = true
          }
          if (
            isCreature(candidate)
            || (isTerrain(candidate) && isImpassable(candidate))
          ) {
            hasBlockingEntity = true
            break
          }
        }

        if (hasPassableTerrain && !hasBlockingEntity) {
          return Option.some(movePosition(e, by))
        }
        return Option.some(e)
      }
    })(e)
  }

const SCREEN_WIDTH = 78
const SCREEN_HEIGHT = 20
export const FIRST_DUNGEON_LEVEL = 1
const FIRST_DUNGEON_HIPPIE_COUNT = 3
const BSP_MAX_PART_HEIGHT = 10
const BSP_MAX_PART_WIDTH = 10
const BSP_MIN_PART_SPAN = 4
const BSP_SPLIT_ASPECT_RATIO = 1.5
const makeAllWalls = (
  width: number,
  height: number,
  dlvl: number
): Effect.Effect<Array<Entity>, never, KeyGenerator> => {
  const wallCoordinates = range(0, height - 1).flatMap((y) =>
    range(0, width).map((x) => [x, y] as const)
  )

  return Effect.forEach(
    wallCoordinates,
    ([x, y]) => wall(x, y, dlvl),
    { concurrency: 1 }
  )
}
const randomIntInclusive = (
  min: number,
  max: number,
  description: string
): Effect.Effect<number, LevelGenerationError> => {
  const low = Math.ceil(min)
  const high = Math.floor(max)

  return low > high
    ? Effect.fail(
      levelGenerationError(
        `${description} has invalid random range ${low}..${high}`
      )
    )
    : Random.nextIntBetween(low, high + 1)
}
const randomRoomBoundary = (
  min: number,
  max: number,
  description: string
): Effect.Effect<number, LevelGenerationError> =>
  randomIntInclusive(min, max, description)

const chooseBspSplitOrientation = (
  width: number,
  height: number
): Effect.Effect<boolean> => {
  const canSplitVertically = width > BSP_MAX_PART_WIDTH
  const canSplitHorizontally = height > BSP_MAX_PART_HEIGHT

  if (!canSplitHorizontally) return Effect.succeed(true)
  if (!canSplitVertically) return Effect.succeed(false)
  if (width >= height * BSP_SPLIT_ASPECT_RATIO) return Effect.succeed(true)
  if (height >= width * BSP_SPLIT_ASPECT_RATIO) {
    return Effect.succeed(false)
  }
  return Random.nextBoolean
}

const filterSplit = <T>(
  arr: Array<T>,
  fn: (a: T) => boolean
): [Array<T>, Array<T>] => [arr.filter(fn), arr.filter((a) => !fn(a))]
const getRequiredAt = <T>(
  values: ReadonlyArray<T>,
  index: number,
  description: string
): Effect.Effect<T, LevelGenerationError> => {
  const value = values.at(index)

  return value === undefined
    ? Effect.fail(
      levelGenerationError(`${description} missing item at index ${index}`)
    )
    : Effect.succeed(value)
}

// const getRoomStats = (chunk: Array<Entity>) => {

// }
const getSpatialInfo = (
  level: Array<Entity>
): [
  number,
  number,
  number,
  number,
  number,
  number,
  Array<number>,
  Array<number>
] => {
  const xs = level.map((e) => e.at.x)
  const ys = level.map((e) => e.at.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const width = maxX - minX
  const height = maxY - minY
  return [width, height, minX, minY, maxX, maxY, xs, ys]
}
const tunnelingDist = (e: Entity) => (e._tag === "wall" ? 1 : 0.001)
type PassageCoordinate = TPos

const samePassageCoordinate = (
  left: PassageCoordinate,
  right: PassageCoordinate
): boolean =>
  left.x === right.x && left.y === right.y && left.z === right.z

const passageCoordinateKey = ({ x, y, z }: PassageCoordinate): string =>
  `${x},${y},${z}`

const isPassageTerrain = (entity: Entity): boolean =>
  entity._tag === "floor" || entity._tag === "tunnel"
  || entity._tag === "door"

const hasPassageAt = (
  coordinate: PassageCoordinate,
  world: ReadonlyArray<Entity>,
  passageCoordinates: ReadonlySet<string>
): boolean =>
  passageCoordinates.has(passageCoordinateKey(coordinate))
  || world.some((entity) =>
    entity.in === "world"
    && samePassageCoordinate(entity.at, coordinate)
    && isPassageTerrain(entity)
  )

const doorVariantForPassage = (
  coordinate: PassageCoordinate,
  world: ReadonlyArray<Entity>,
  passageCoordinates: ReadonlySet<string>
): typeof DirectionalVariantSchema.Type => {
  const horizontal = hasPassageAt(
    { x: coordinate.x - 1, y: coordinate.y, z: coordinate.z },
    world,
    passageCoordinates
  ) || hasPassageAt(
    { x: coordinate.x + 1, y: coordinate.y, z: coordinate.z },
    world,
    passageCoordinates
  )
  const vertical = hasPassageAt(
    { x: coordinate.x, y: coordinate.y - 1, z: coordinate.z },
    world,
    passageCoordinates
  ) || hasPassageAt(
    { x: coordinate.x, y: coordinate.y + 1, z: coordinate.z },
    world,
    passageCoordinates
  )

  if (horizontal) return "vertical"
  if (vertical) return "horizontal"
  return "none"
}

const inclusiveIntegerRange = (
  start: number,
  end: number
): ReadonlyArray<number> =>
  start > end
    ? []
    : Array.from(
      { length: end - start + 1 },
      (_, offset) => start + offset
    )

const makePassagesWithDoor = (
  coordinates: ReadonlyArray<PassageCoordinate>,
  world: ReadonlyArray<Entity>,
  fallbackDoorVariant?: typeof DirectionalVariantSchema.Type
): Effect.Effect<Array<Entity>, never, KeyGenerator> => {
  const passageCoordinateKeys = new globalThis.Set(
    coordinates.map(passageCoordinateKey)
  )
  const validDoorCoordinates = coordinates.filter((coordinate) => {
    const hasHorizontalPassage = hasPassageAt(
      { ...coordinate, x: coordinate.x - 1 },
      world,
      passageCoordinateKeys
    ) && hasPassageAt(
      { ...coordinate, x: coordinate.x + 1 },
      world,
      passageCoordinateKeys
    )
    const hasVerticalPassage = hasPassageAt(
      { ...coordinate, y: coordinate.y - 1 },
      world,
      passageCoordinateKeys
    ) && hasPassageAt(
      { ...coordinate, y: coordinate.y + 1 },
      world,
      passageCoordinateKeys
    )

    return hasHorizontalPassage || hasVerticalPassage
  })
  const doorCoordinate = validDoorCoordinates.at(
    Math.floor(validDoorCoordinates.length / 2)
  )

  return Effect.forEach(
    coordinates,
    (coordinate): Effect.Effect<Entity, never, KeyGenerator> =>
      doorCoordinate !== undefined
        && samePassageCoordinate(coordinate, doorCoordinate)
        ? door(
          coordinate.x,
          coordinate.y,
          coordinate.z,
          false,
          fallbackDoorVariant
            ?? doorVariantForPassage(
              coordinate,
              world,
              passageCoordinateKeys
            )
        )
        : tunnel(coordinate.x, coordinate.y, coordinate.z),
    { concurrency: 1 }
  )
}

const replaceTilesWithPassages = (
  a: Array<Entity>,
  b: Array<Entity>,
  passages: Array<Entity>
): Array<Entity> =>
  a.concat(b).filter((e) =>
    !passages.some((t) =>
      t.at.x === e.at.x && t.at.y === e.at.y && t.at.z === e.at.z
    )
  ).concat(passages)
const _linkLeaves = (
  a: Array<Entity>,
  b: Array<Entity>
): Effect.Effect<Array<Entity>, LevelGenerationError, KeyGenerator> =>
  Effect.gen(function*() {
    // console.log("linking")
    const floorsA = a.filter(EEntity.$is("floor"))
    const floorsB = b.filter(EEntity.$is("floor"))
    const [, , minXA, minYA, maxXA, maxYA, xsA, ysA] = getSpatialInfo(
      floorsA
    )
    const [, , minXB, minYB, maxXB, maxYB, xsB, ysB] = getSpatialInfo(
      floorsB
    )
    const z = (yield* getRequiredAt(floorsB, 0, "right leaf floor")).at.z

    // fixme replace all the rest of this with a pathfinding to link random points on edges....
    const yIntersectValues = Set(ysB).intersect(Set(ysA)).filter((y) =>
      floorsA.some((f) => f.at.y === y && maxXA === f.at.x)
      && floorsB.some((f) => f.at.y === y && minXB === f.at.x)
    ).toArray()
    if (yIntersectValues.length > 0) {
      // console.log(
      //   "able to link on y intersection",
      //   JSON.stringify(yIntersectValues)
      // )
      const i = yield* randomIntInclusive(
        0,
        yIntersectValues.length - 1,
        "y intersection"
      )
      const linkLineY = yield* getRequiredAt(
        yIntersectValues,
        i,
        "y intersection"
      )

      const passageCoordinates = (minXA < minXB
        ? inclusiveIntegerRange(maxXA + 1, minXB - 1)
        : inclusiveIntegerRange(maxXB + 1, minXA - 1)).map((x) => ({
          x,
          y: linkLineY,
          z
        }))
      const passages = yield* makePassagesWithDoor(
        passageCoordinates,
        a.concat(b),
        "vertical"
      )
      // console.log(
      //   "linking along: ",
      //   JSON.stringify(passages.map((t) => t.at))
      // )
      return replaceTilesWithPassages(a, b, passages)
    }
    const xIntersectValues = Set(xsB).intersect(Set(xsA)).filter((x) =>
      floorsA.some((f) => f.at.x === x && maxYA === f.at.y)
      && floorsB.some((f) => f.at.x === x && minYB === f.at.y)
    ).toArray()
    if (xIntersectValues.length > 0) {
      // console.log(
      //   "able to link on x intersection: ",
      //   JSON.stringify(xIntersectValues)
      // )
      const i = yield* randomIntInclusive(
        0,
        xIntersectValues.length - 1,
        "x intersection"
      )
      const linkLineX = yield* getRequiredAt(
        xIntersectValues,
        i,
        "x intersection"
      )

      const passageCoordinates = (minYA < minYB
        ? inclusiveIntegerRange(maxYA + 1, minYB - 1)
        : inclusiveIntegerRange(maxYB + 1, minYA - 1)).map((y) => ({
          x: linkLineX,
          y,
          z
        }))
      const passages = yield* makePassagesWithDoor(
        passageCoordinates,
        a.concat(b),
        "horizontal"
      )
      // console.log(
      //   "linking along: ",
      //   JSON.stringify(passages.map((t) => t.at))
      // )
      return replaceTilesWithPassages(a, b, passages)
    }
    const ia = yield* randomIntInclusive(
      0,
      floorsA.length - 1,
      "left leaf floor"
    )
    const ib = yield* randomIntInclusive(
      0,
      floorsB.length - 1,
      "right leaf floor"
    )
    const fa = yield* getRequiredAt(floorsA, ia, "left leaf floor")
    const fb = yield* getRequiredAt(floorsB, ib, "right leaf floor")
    const world = HashMap.fromIterable(a.concat(b).map((e) => [e.key, e]))

    const tunnelSources = dijkstraPath(
      fa.at,
      fb.at,
      tunnelingDist,
      world,
      true
    ).filter(
      (e) => e?._tag === "wall"
    )
    const passages = yield* makePassagesWithDoor(
      tunnelSources.map(({ at }) => at),
      a.concat(b)
    )
    // console.log("passages", passages)
    return replaceTilesWithPassages(a, b, passages)
  })

const determineWallVariant = (
  entity: Entity,
  wallCoordinates: ReadonlySet<string>
): typeof DirectionalVariantSchema.Type => {
  const { x, y, z } = entity.at
  const hasWall = (offsetX: number, offsetY: number) =>
    wallCoordinates.has(
      passageCoordinateKey({ x: x + offsetX, y: y + offsetY, z })
    )
  const n = hasWall(0, -1)
  const w = hasWall(-1, 0)
  const e = hasWall(1, 0)
  const s = hasWall(0, 1)
  const ne = hasWall(1, -1)
  const nw = hasWall(-1, -1)
  const se = hasWall(1, 1)
  const sw = hasWall(-1, 1)
  if (n && w && s && e && se && sw && nw && ne) return "none"

  if (n && (!nw || !ne)) {
    if (w && (!nw || !sw)) {
      if (e && (!ne && !se)) {
        if (s && !ne) {
          return "cross"
        } else {
          return "t-up"
        }
      } else {
        if (s && !sw) {
          return "t-left"
        } else {
          return "bottomRight"
        }
      }
    } else {
      if (e && (!ne || !se)) {
        if (s && !se) {
          return "t-right"
        } else {
          return "bottomLeft"
        }
      } else {
        if (s) {
          return "vertical"
        } else {
          return "vertical"
        }
      }
    }
  } else if (s) {
    if (w && !sw) {
      if (e && !ne) {
        return "t-down"
      } else {
        return "topRight"
      }
    } else {
      if (e && !se) {
        return "topLeft"
      } else if ((e || w) && ((!ne && !nw) || (!se && !sw))) {
        return "horizontal"
      } else if (e && ((!ne && !n) || (!se && !s))) {
        return "horizontal"
      } else if (w && ((!nw && !n) || (!sw && !s))) {
        return "horizontal"
      } else {
        return "vertical"
      }
    }
  } else if (w || e) {
    return "horizontal"
  } else return "none"
}

const finalizeWallVariants = (
  level: ReadonlyArray<Entity>
): Array<Entity> => {
  const completeLevel = [...level]
  const wallCoordinates = new globalThis.Set(
    completeLevel
      .filter((entity) => entity.in === "world" && entity._tag === "wall")
      .map((entity) => passageCoordinateKey(entity.at))
  )

  return completeLevel.map((entity) =>
    entity._tag === "wall"
      ? {
        ...entity,
        variant: determineWallVariant(entity, wallCoordinates)
      }
      : entity
  )
}

const _carveRoom = (
  level: Array<Entity>,
  width: number,
  height: number,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number
): Effect.Effect<Array<Entity>, LevelGenerationError, KeyGenerator> =>
  Effect.gen(function*() {
    const top = yield* randomRoomBoundary(
      minY + 1,
      maxY - (height / 2) - 1,
      "room top"
    )
    const bottom = yield* randomRoomBoundary(
      minY + (height / 2) + 1,
      maxY - 1,
      "room bottom"
    )
    const left = yield* randomRoomBoundary(
      minX + 1,
      maxX - (width / 2) - 1,
      "room left"
    )
    const right = yield* randomRoomBoundary(
      minX + (width / 2) + 1,
      maxX - 1,
      "room right"
    )
    // console.log(
    //   "carving room :: x: [%o => %o], y: [%o => %o]",
    //   left,
    //   right,
    //   top,
    //   bottom
    // )
    const deleteWallp = (e: Entity) =>
      e.at.x <= right && e.at.x >= left && e.at.y <= bottom
      && e.at.y >= top
    const withRoom = yield* Effect.forEach(
      level,
      (e) =>
        deleteWallp(e) ? floor(e.at.x, e.at.y, e.at.z) : Effect.succeed(e),
      { concurrency: 1 }
    )
    return withRoom
  })
const _BSPGenLevel = (
  level: Array<Entity>
): Effect.Effect<Array<Entity>, LevelGenerationError, KeyGenerator> =>
  Effect.gen(function*() {
    const xs = level.map((e) => e.at.x)
    const ys = level.map((e) => e.at.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    // console.log(
    //   "in part x: [%o => %o], y: [%o => %o]",
    //   minX,
    //   maxX,
    //   minY,
    //   maxY
    // )
    const width = maxX - minX
    const height = maxY - minY
    const canSplitVertically = width > BSP_MAX_PART_WIDTH
    const canSplitHorizontally = height > BSP_MAX_PART_HEIGHT
    if (!canSplitVertically && !canSplitHorizontally) {
      const res = yield* _carveRoom(
        level,
        width,
        height,
        minX,
        maxX,
        minY,
        maxY
      )
      // console.log(
      //   "made room:\n",
      //   simpleDraw(HashMap.fromIterable(res[0].map((e) => [e.key, e])))
      // )
      return res
    }
    const splitVertically = yield* chooseBspSplitOrientation(width, height)
    const sliceAt = yield* randomIntInclusive(
      (splitVertically ? minX : minY) + BSP_MIN_PART_SPAN + 1,
      (splitVertically ? maxX : maxY) - BSP_MIN_PART_SPAN,
      "BSP slice"
    )
    // console.log("sliceat: ", sliceAt)
    const [sideA, sideB] = filterSplit(
      level,
      (e) => (splitVertically ? e.at.x : e.at.y) < sliceAt
    )
    const doneA = yield* _BSPGenLevel(sideA)
    const doneB = yield* _BSPGenLevel(sideB)

    return yield* _linkLeaves(doneA, doneB)
  })

export const CAMPGROUND_WIDTH = 360
export const CAMPGROUND_HEIGHT = 160
const CAMPGROUND_RESERVED_CORRIDOR_START_X = 96
const CAMPGROUND_RESERVED_CORRIDOR_Y = 120
const CAMPGROUND_RESERVED_CORRIDOR_LENGTH = 84

export type GridPosition = {
  readonly x: number
  readonly y: number
}

export const campgroundWakeUpCoordinate: GridPosition = {
  x: CAMPGROUND_RESERVED_CORRIDOR_START_X - 1,
  y: CAMPGROUND_RESERVED_CORRIDOR_Y
}

const campgroundMudPuddle: ReadonlyArray<GridPosition> = [
  campgroundWakeUpCoordinate,
  {
    x: CAMPGROUND_RESERVED_CORRIDOR_START_X - 2,
    y: CAMPGROUND_RESERVED_CORRIDOR_Y
  },
  {
    x: CAMPGROUND_RESERVED_CORRIDOR_START_X - 3,
    y: CAMPGROUND_RESERVED_CORRIDOR_Y
  },
  {
    x: CAMPGROUND_RESERVED_CORRIDOR_START_X - 4,
    y: CAMPGROUND_RESERVED_CORRIDOR_Y
  },
  {
    x: CAMPGROUND_RESERVED_CORRIDOR_START_X - 1,
    y: CAMPGROUND_RESERVED_CORRIDOR_Y - 1
  },
  {
    x: CAMPGROUND_RESERVED_CORRIDOR_START_X - 2,
    y: CAMPGROUND_RESERVED_CORRIDOR_Y - 1
  },
  {
    x: CAMPGROUND_RESERVED_CORRIDOR_START_X - 3,
    y: CAMPGROUND_RESERVED_CORRIDOR_Y - 2
  },
  {
    x: CAMPGROUND_RESERVED_CORRIDOR_START_X - 2,
    y: CAMPGROUND_RESERVED_CORRIDOR_Y + 1
  },
  {
    x: CAMPGROUND_RESERVED_CORRIDOR_START_X - 1,
    y: CAMPGROUND_RESERVED_CORRIDOR_Y + 1
  }
]

export const campgroundMudPuddleCoordinates = (): Array<GridPosition> =>
  campgroundMudPuddle.map(({ x, y }) => ({ x, y }))

type CampgroundGeometry = {
  readonly centerX: number
  readonly centerY: number
  readonly outerLeft: number
  readonly outerRight: number
  readonly outerTop: number
  readonly outerBottom: number
  readonly middleLeft: number
  readonly middleRight: number
  readonly middleTop: number
  readonly middleBottom: number
  readonly innerLeft: number
  readonly innerRight: number
  readonly innerTop: number
  readonly innerBottom: number
  readonly templeCenterX: number
  readonly templeCenterY: number
  readonly templeLeft: number
  readonly templeRight: number
  readonly templeTop: number
  readonly templeBottom: number
}

export type TentOrientation = "horizontal" | "vertical"
export type TentDoorSide = "north" | "south" | "east" | "west"
export type TentStructureKind = "personal" | "carport" | "popup"
export type TentStructureSpec =
  | {
    readonly kind: "personal"
    readonly origin: GridPosition
    readonly interiorSpaces: 1 | 2
    readonly orientation?: TentOrientation
    readonly doorSide?: TentDoorSide
  }
  | {
    readonly kind: "carport"
    readonly origin: GridPosition
    readonly orientation: TentOrientation
    readonly length: number
    readonly interiorSpan: number
  }
  | {
    readonly kind: "popup"
    readonly origin: GridPosition
    readonly width: number
    readonly height: number
    readonly postSpacing?: number
  }

export type TentStructureTiles = {
  readonly roofCoordinates: ReadonlyArray<GridPosition>
  readonly wallCoordinates: ReadonlyArray<GridPosition>
  readonly postCoordinates: ReadonlyArray<GridPosition>
  readonly doorCoordinates: ReadonlyArray<GridPosition>
  readonly floorCoordinates: ReadonlyArray<GridPosition>
}

type ThemeCampBand = "north" | "south" | "west" | "east"
type ThemeCampRoadRing = "outer" | "middle" | "inner"

type ThemeCampLayout = {
  readonly definition: CampgroundCampDefinition
  readonly band: ThemeCampBand
  readonly roadRing: ThemeCampRoadRing
  readonly roadPosition: GridPosition
  readonly entranceCoordinates: ReadonlyArray<GridPosition>
  readonly name: string
  readonly signPosition: GridPosition
  readonly structures: ReadonlyArray<TentStructureSpec>
}

const gridKey = ({ x, y }: GridPosition): string => `${x},${y}`

const uniqueGridPositions = (
  coordinates: ReadonlyArray<GridPosition>
): Array<GridPosition> =>
  Array.from(
    new globalThis.Map(
      coordinates.map((coordinate) =>
        [gridKey(coordinate), coordinate] as const
      )
    ).values()
  )

const sameGridPosition = (a: GridPosition, b: GridPosition): boolean =>
  a.x === b.x && a.y === b.y

const horizontalLineCoordinates = (
  left: number,
  right: number,
  y: number
): Array<GridPosition> =>
  range(Math.min(left, right), Math.max(left, right)).map((x) => ({
    x,
    y
  }))

const verticalLineCoordinates = (
  x: number,
  top: number,
  bottom: number
): Array<GridPosition> =>
  range(Math.min(top, bottom), Math.max(top, bottom)).map((y) => ({
    x,
    y
  }))

const rectangleCoordinates = (
  left: number,
  right: number,
  top: number,
  bottom: number
): Array<GridPosition> =>
  range(Math.min(top, bottom), Math.max(top, bottom)).flatMap((y) =>
    range(Math.min(left, right), Math.max(left, right)).map((x) => ({
      x,
      y
    }))
  )

const rectangularLoopCoordinates = (
  left: number,
  right: number,
  top: number,
  bottom: number
): Array<GridPosition> =>
  uniqueGridPositions(
    horizontalLineCoordinates(left, right, top)
      .concat(horizontalLineCoordinates(left, right, bottom))
      .concat(verticalLineCoordinates(left, top, bottom))
      .concat(verticalLineCoordinates(right, top, bottom))
  )

const clampStructureDimension = (
  value: number,
  minimum: number
): number => Math.max(minimum, Math.floor(value))

const personalTentStructureTiles = (
  spec: Extract<TentStructureSpec, { readonly kind: "personal" }>
): TentStructureTiles => {
  const orientation = spec.orientation ?? "horizontal"
  const interiorWidth = orientation === "horizontal"
    ? spec.interiorSpaces
    : 1
  const interiorHeight = orientation === "vertical"
    ? spec.interiorSpaces
    : 1
  const left = spec.origin.x
  const right = spec.origin.x + interiorWidth + 1
  const top = spec.origin.y
  const bottom = spec.origin.y + interiorHeight + 1
  const doorSide = spec.doorSide ?? "south"
  const doorCoordinate = doorSide === "north"
    ? { x: spec.origin.x + 1, y: top }
    : doorSide === "south"
    ? { x: spec.origin.x + 1, y: bottom }
    : doorSide === "east"
    ? { x: right, y: spec.origin.y + 1 }
    : { x: left, y: spec.origin.y + 1 }
  const roofCoordinates = rectangleCoordinates(
    spec.origin.x + 1,
    spec.origin.x + interiorWidth,
    spec.origin.y + 1,
    spec.origin.y + interiorHeight
  )
  const doorCoordinates = [doorCoordinate]
  const wallCoordinates = rectangularLoopCoordinates(
    left,
    right,
    top,
    bottom
  ).filter((coordinate) => !sameGridPosition(coordinate, doorCoordinate))

  return {
    doorCoordinates,
    floorCoordinates: uniqueGridPositions(
      roofCoordinates.concat(doorCoordinates)
    ),
    postCoordinates: [],
    roofCoordinates,
    wallCoordinates
  }
}

const carportStructureTiles = (
  spec: Extract<TentStructureSpec, { readonly kind: "carport" }>
): TentStructureTiles => {
  const length = clampStructureDimension(spec.length, 3)
  const interiorSpan = clampStructureDimension(spec.interiorSpan, 3)
  const roofCoordinates = spec.orientation === "horizontal"
    ? rectangleCoordinates(
      spec.origin.x,
      spec.origin.x + length - 1,
      spec.origin.y + 1,
      spec.origin.y + interiorSpan
    )
    : rectangleCoordinates(
      spec.origin.x + 1,
      spec.origin.x + interiorSpan,
      spec.origin.y,
      spec.origin.y + length - 1
    )
  const wallCoordinates = spec.orientation === "horizontal"
    ? horizontalLineCoordinates(
      spec.origin.x,
      spec.origin.x + length - 1,
      spec.origin.y
    ).concat(
      horizontalLineCoordinates(
        spec.origin.x,
        spec.origin.x + length - 1,
        spec.origin.y + interiorSpan + 1
      )
    )
    : verticalLineCoordinates(
      spec.origin.x,
      spec.origin.y,
      spec.origin.y + length - 1
    ).concat(
      verticalLineCoordinates(
        spec.origin.x + interiorSpan + 1,
        spec.origin.y,
        spec.origin.y + length - 1
      )
    )

  return {
    doorCoordinates: [],
    floorCoordinates: roofCoordinates,
    postCoordinates: [],
    roofCoordinates,
    wallCoordinates: uniqueGridPositions(wallCoordinates)
  }
}

const popupPostCoordinates = (
  left: number,
  right: number,
  top: number,
  bottom: number,
  spacing: number | undefined
): Array<GridPosition> => {
  const posts: Array<GridPosition> = [
    { x: left, y: top },
    { x: right, y: top },
    { x: left, y: bottom },
    { x: right, y: bottom }
  ]
  if (spacing === undefined || spacing < 2) return posts

  for (let x = left + spacing; x < right; x += spacing) {
    posts.push({ x, y: top }, { x, y: bottom })
  }
  for (let y = top + spacing; y < bottom; y += spacing) {
    posts.push({ x: left, y }, { x: right, y })
  }

  return uniqueGridPositions(posts)
}

const popupStructureTiles = (
  spec: Extract<TentStructureSpec, { readonly kind: "popup" }>
): TentStructureTiles => {
  const width = clampStructureDimension(spec.width, 4)
  const height = clampStructureDimension(spec.height, 4)
  const roofCoordinates = rectangleCoordinates(
    spec.origin.x,
    spec.origin.x + width - 1,
    spec.origin.y,
    spec.origin.y + height - 1
  )
  const postCoordinates = popupPostCoordinates(
    spec.origin.x - 1,
    spec.origin.x + width,
    spec.origin.y - 1,
    spec.origin.y + height,
    spec.postSpacing
  )

  return {
    doorCoordinates: [],
    floorCoordinates: roofCoordinates,
    postCoordinates,
    roofCoordinates,
    wallCoordinates: []
  }
}

export const tentStructureTiles = (
  spec: TentStructureSpec
): TentStructureTiles => {
  switch (spec.kind) {
    case "personal":
      return personalTentStructureTiles(spec)
    case "carport":
      return carportStructureTiles(spec)
    case "popup":
      return popupStructureTiles(spec)
  }
}

export const tentWallVariant = (
  walls: ReadonlyArray<GridPosition>,
  coordinate: GridPosition
): typeof DirectionalVariantSchema.Type => {
  const wallKeys = new globalThis.Set(walls.map(gridKey))
  const north = wallKeys.has(
    gridKey({ x: coordinate.x, y: coordinate.y - 1 })
  )
  const south = wallKeys.has(
    gridKey({ x: coordinate.x, y: coordinate.y + 1 })
  )
  const east = wallKeys.has(
    gridKey({ x: coordinate.x + 1, y: coordinate.y })
  )
  const west = wallKeys.has(
    gridKey({ x: coordinate.x - 1, y: coordinate.y })
  )

  if (north && south && east && west) return "cross"
  if (north && south && east) return "t-right"
  if (north && south && west) return "t-left"
  if (east && west && north) return "t-up"
  if (east && west && south) return "t-down"
  if (south && east) return "topLeft"
  if (south && west) return "topRight"
  if (north && east) return "bottomLeft"
  if (north && west) return "bottomRight"
  if (north || south) return "vertical"
  if (east || west) return "horizontal"
  return "cross"
}

export const campgroundReservedTravelCorridorCoordinates = (): Array<
  GridPosition
> =>
  horizontalLineCoordinates(
    CAMPGROUND_RESERVED_CORRIDOR_START_X,
    CAMPGROUND_RESERVED_CORRIDOR_START_X
      + CAMPGROUND_RESERVED_CORRIDOR_LENGTH,
    CAMPGROUND_RESERVED_CORRIDOR_Y
  )

const makeCampgroundGeometry: Effect.Effect<
  CampgroundGeometry,
  LevelGenerationError
> = Effect.gen(function*() {
  const centerX = yield* randomIntInclusive(
    176,
    184,
    "campground center x"
  )
  const centerY = yield* randomIntInclusive(
    78,
    82,
    "campground center y"
  )
  const middleRadiusX = yield* randomIntInclusive(
    118,
    124,
    "middle road loop width"
  )
  const middleRadiusY = yield* randomIntInclusive(
    46,
    49,
    "middle road loop height"
  )
  const innerRadiusX = yield* randomIntInclusive(
    58,
    62,
    "inner road loop width"
  )
  const innerRadiusY = yield* randomIntInclusive(
    28,
    30,
    "inner road loop height"
  )
  const templeCenterX = centerX + 90
  const templeCenterY = centerY - 36

  return {
    centerX,
    centerY,
    outerLeft: 0,
    outerRight: CAMPGROUND_WIDTH - 1,
    outerTop: 0,
    outerBottom: CAMPGROUND_HEIGHT - 1,
    middleLeft: centerX - middleRadiusX,
    middleRight: centerX + middleRadiusX,
    middleTop: centerY - middleRadiusY,
    middleBottom: centerY + middleRadiusY,
    innerLeft: centerX - innerRadiusX,
    innerRight: centerX + innerRadiusX,
    innerTop: centerY - innerRadiusY,
    innerBottom: centerY + innerRadiusY,
    templeCenterX,
    templeCenterY,
    templeLeft: templeCenterX - 6,
    templeRight: templeCenterX + 6,
    templeTop: templeCenterY - 4,
    templeBottom: templeCenterY + 4
  }
})

const connectedRoadLoopCoordinates = (
  geometry: CampgroundGeometry
): Array<GridPosition> =>
  uniqueGridPositions(
    rectangularLoopCoordinates(
      geometry.outerLeft,
      geometry.outerRight,
      geometry.outerTop,
      geometry.outerBottom
    )
      .concat(
        rectangularLoopCoordinates(
          geometry.middleLeft,
          geometry.middleRight,
          geometry.middleTop,
          geometry.middleBottom
        )
      )
      .concat(
        rectangularLoopCoordinates(
          geometry.innerLeft,
          geometry.innerRight,
          geometry.innerTop,
          geometry.innerBottom
        )
      )
      .concat(
        verticalLineCoordinates(
          geometry.centerX,
          geometry.outerTop,
          geometry.outerBottom
        )
      )
      .concat(
        verticalLineCoordinates(
          geometry.centerX - 80,
          geometry.outerTop,
          geometry.outerBottom
        )
      )
      .concat(
        verticalLineCoordinates(
          geometry.centerX + 80,
          geometry.outerTop,
          geometry.outerBottom
        )
      )
      .concat(
        horizontalLineCoordinates(
          geometry.outerLeft,
          geometry.outerRight,
          geometry.centerY
        )
      )
      .concat(
        horizontalLineCoordinates(
          geometry.outerLeft,
          geometry.outerRight,
          geometry.centerY - 50
        )
      )
      .concat(
        horizontalLineCoordinates(
          geometry.outerLeft,
          geometry.outerRight,
          geometry.centerY + 50
        )
      )
  )

const campgroundObjectiveSpineCoordinates = (
  geometry: CampgroundGeometry
): Array<GridPosition> =>
  uniqueGridPositions(
    campgroundReservedTravelCorridorCoordinates()
      .concat(
        horizontalLineCoordinates(
          CAMPGROUND_RESERVED_CORRIDOR_START_X
            + CAMPGROUND_RESERVED_CORRIDOR_LENGTH,
          geometry.centerX,
          CAMPGROUND_RESERVED_CORRIDOR_Y
        )
      )
      .concat(
        verticalLineCoordinates(
          geometry.centerX,
          geometry.centerY,
          CAMPGROUND_RESERVED_CORRIDOR_Y
        )
      )
      .concat(
        horizontalLineCoordinates(
          geometry.centerX,
          geometry.templeCenterX,
          geometry.centerY
        )
      )
      .concat(
        verticalLineCoordinates(
          geometry.templeCenterX,
          geometry.templeBottom,
          geometry.centerY
        )
      )
  )

const roadJunctionPlazaCoordinates = (
  roadCoordinates: ReadonlyArray<GridPosition>
): Array<GridPosition> => {
  const roadKeys = new globalThis.Set(roadCoordinates.map(gridKey))
  const junctions = roadCoordinates.filter((coordinate) =>
    cardinalGridNeighbors(coordinate).filter((neighbor) =>
      roadKeys.has(gridKey(neighbor))
    ).length >= 3
  )

  return uniqueGridPositions(
    junctions.flatMap(({ x, y }) =>
      rectangleCoordinates(x - 1, x + 1, y - 1, y + 1)
    )
  ).filter(isInCampgroundBounds)
}

const landmarkRoadPlazaCoordinates = (
  geometry: CampgroundGeometry
): Array<GridPosition> =>
  uniqueGridPositions(
    rectangularLoopCoordinates(
      geometry.centerX - 4,
      geometry.centerX + 4,
      geometry.centerY - 3,
      geometry.centerY + 3
    ).concat(
      rectangleCoordinates(
        geometry.templeCenterX - 1,
        geometry.templeCenterX + 1,
        geometry.templeCenterY,
        geometry.templeBottom + 4
      )
    ).concat(
      rectangleCoordinates(
        geometry.templeCenterX - 3,
        geometry.templeCenterX + 3,
        geometry.templeBottom + 1,
        geometry.templeBottom + 3
      )
    )
  ).filter(isInCampgroundBounds)

const campgroundLandmarkProtectedCoordinates = (
  geometry: CampgroundGeometry
): Array<GridPosition> =>
  uniqueGridPositions(
    rectangleCoordinates(
      geometry.centerX - 5,
      geometry.centerX + 5,
      geometry.centerY - 4,
      geometry.centerY + 4
    ).concat(
      rectangleCoordinates(
        geometry.templeLeft - 2,
        geometry.templeRight + 2,
        geometry.templeTop - 2,
        geometry.templeBottom + 5
      )
    )
  ).filter(isInCampgroundBounds)

const arrivalDirectoryCoordinate: GridPosition = {
  x: CAMPGROUND_RESERVED_CORRIDOR_START_X + 4,
  y: CAMPGROUND_RESERVED_CORRIDOR_Y - 3
}
const arrivalDirectorySignCoordinate: GridPosition = {
  x: arrivalDirectoryCoordinate.x,
  y: arrivalDirectoryCoordinate.y - 1
}
const arrivalGateCoordinate: GridPosition = {
  x: CAMPGROUND_RESERVED_CORRIDOR_START_X,
  y: CAMPGROUND_RESERVED_CORRIDOR_Y
}
const arrivalWaterStationCoordinate: GridPosition = {
  x: CAMPGROUND_RESERVED_CORRIDOR_START_X + 9,
  y: CAMPGROUND_RESERVED_CORRIDOR_Y + 2
}
const arrivalWaterLabelCoordinate: GridPosition = {
  x: CAMPGROUND_RESERVED_CORRIDOR_START_X + 4,
  y: CAMPGROUND_RESERVED_CORRIDOR_Y + 4
}
const arrivalGreeterCoordinate: GridPosition = {
  x: CAMPGROUND_RESERVED_CORRIDOR_START_X + 7,
  y: CAMPGROUND_RESERVED_CORRIDOR_Y - 3
}
const arrivalWaterCoordinates: ReadonlyArray<GridPosition> = [
  {
    x: CAMPGROUND_RESERVED_CORRIDOR_START_X + 7,
    y: CAMPGROUND_RESERVED_CORRIDOR_Y + 3
  },
  {
    x: CAMPGROUND_RESERVED_CORRIDOR_START_X + 8,
    y: CAMPGROUND_RESERVED_CORRIDOR_Y + 3
  },
  {
    x: CAMPGROUND_RESERVED_CORRIDOR_START_X + 9,
    y: CAMPGROUND_RESERVED_CORRIDOR_Y + 3
  },
  {
    x: CAMPGROUND_RESERVED_CORRIDOR_START_X + 10,
    y: CAMPGROUND_RESERVED_CORRIDOR_Y + 3
  }
]
const arrivalCanopyCoordinates: ReadonlyArray<GridPosition> =
  uniqueGridPositions(
    rectangleCoordinates(
      arrivalGreeterCoordinate.x - 1,
      arrivalGreeterCoordinate.x + 1,
      arrivalGreeterCoordinate.y,
      arrivalGreeterCoordinate.y + 2
    ).concat(
      rectangleCoordinates(
        arrivalWaterLabelCoordinate.x - 1,
        arrivalWaterCoordinates.at(-1)?.x
          ?? arrivalWaterStationCoordinate.x,
        arrivalWaterStationCoordinate.y,
        arrivalWaterLabelCoordinate.y
      )
    )
  )

const objectiveSpineLanternCoordinates = (
  spineCoordinates: ReadonlyArray<GridPosition>,
  roadKeys: ReadonlySet<string>
): Array<GridPosition> =>
  uniqueGridPositions(
    spineCoordinates.flatMap((coordinate, index) => {
      if (index % 18 !== 9) return []

      const candidates = index % 36 === 9
        ? [
          { x: coordinate.x, y: coordinate.y - 1 },
          { x: coordinate.x, y: coordinate.y + 1 },
          { x: coordinate.x - 1, y: coordinate.y },
          { x: coordinate.x + 1, y: coordinate.y }
        ]
        : [
          { x: coordinate.x + 1, y: coordinate.y },
          { x: coordinate.x - 1, y: coordinate.y },
          { x: coordinate.x, y: coordinate.y + 1 },
          { x: coordinate.x, y: coordinate.y - 1 }
        ]
      const shoulder = candidates.find((candidate) =>
        isInCampgroundBounds(candidate)
        && !roadKeys.has(gridKey(candidate))
      )
      return shoulder === undefined ? [] : [shoulder]
    })
  )

type ThemeCampRoadAnchor = {
  readonly band: ThemeCampBand
  readonly roadRing: ThemeCampRoadRing
  readonly position: GridPosition
}

const centeredStructureOffset = (
  index: number,
  count: number,
  spacing: number
): number => Math.round((index - (count - 1) / 2) * spacing)

const campStructuresForBand = (
  signPosition: GridPosition,
  band: ThemeCampBand,
  definition: CampgroundCampDefinition
): Array<TentStructureSpec> => {
  const { carports, personalTents, popupCanopies } = definition.structure
  const horizontal = band === "north" || band === "south"
  const personalStructures = Array.from(
    { length: personalTents },
    (_, index): TentStructureSpec => {
      const interiorSpaces = (definition.slot + index) % 2 === 0 ? 1 : 2
      const along = centeredStructureOffset(index, personalTents, 6)
      const size = interiorSpaces + 2

      return horizontal
        ? {
          doorSide: band === "north" ? "north" : "south",
          interiorSpaces,
          kind: "personal",
          orientation: "horizontal",
          origin: {
            x: signPosition.x + along - Math.floor(size / 2),
            y: band === "north"
              ? signPosition.y + 3
              : signPosition.y - 3 - size
          }
        }
        : {
          doorSide: band === "west" ? "west" : "east",
          interiorSpaces,
          kind: "personal",
          orientation: "vertical",
          origin: {
            x: band === "west"
              ? signPosition.x + 3
              : signPosition.x - 3 - size,
            y: signPosition.y + along - Math.floor(size / 2)
          }
        }
    }
  )
  const popupWidth = definition.kind === "flagship" ? 9 : 7
  const popupHeight = definition.kind === "flagship" ? 6 : 5
  const primaryShelterGap = 3
  const popupStructures = Array.from(
    { length: popupCanopies },
    (_, index): TentStructureSpec => {
      const along = centeredStructureOffset(index, popupCanopies, 11)

      return {
        height: horizontal ? popupHeight : popupWidth,
        kind: "popup",
        origin: horizontal
          ? {
            x: signPosition.x + along - Math.floor(popupWidth / 2),
            y: band === "north"
              ? signPosition.y + primaryShelterGap
              : signPosition.y - primaryShelterGap - popupHeight + 1
          }
          : {
            x: band === "west"
              ? signPosition.x + primaryShelterGap
              : signPosition.x - primaryShelterGap - popupHeight + 1,
            y: signPosition.y + along - Math.floor(popupWidth / 2)
          },
        postSpacing: 3,
        width: horizontal ? popupWidth : popupHeight
      }
    }
  )
  const carportLength = definition.kind === "flagship" ? 7 : 6
  const carportInteriorSpan = 3
  const carportGap = popupCanopies === 0 ? primaryShelterGap : 12
  const carportStructures = Array.from(
    { length: carports },
    (_, index): TentStructureSpec => {
      const along = centeredStructureOffset(index, carports, 9)

      return {
        interiorSpan: carportInteriorSpan,
        kind: "carport",
        length: carportLength,
        orientation: horizontal ? "horizontal" : "vertical",
        origin: horizontal
          ? {
            x: signPosition.x + along - Math.floor(carportLength / 2),
            y: band === "north"
              ? signPosition.y + carportGap - 1
              : signPosition.y - carportGap - carportInteriorSpan
          }
          : {
            x: band === "west"
              ? signPosition.x + carportGap - 1
              : signPosition.x - carportGap - carportInteriorSpan,
            y: signPosition.y + along - Math.floor(carportLength / 2)
          }
      }
    }
  )

  return [
    ...personalStructures,
    ...popupStructures,
    ...carportStructures
  ]
}

const makeThemeCampLayout = (
  definition: CampgroundCampDefinition,
  anchor: ThemeCampRoadAnchor
): ThemeCampLayout => {
  const inward = anchor.band === "north"
    ? { x: 0, y: 1 }
    : anchor.band === "south"
    ? { x: 0, y: -1 }
    : anchor.band === "west"
    ? { x: 1, y: 0 }
    : { x: -1, y: 0 }
  const signPosition = {
    x: anchor.position.x + inward.x * 3,
    y: anchor.position.y + inward.y * 3
  }

  return {
    band: anchor.band,
    definition,
    entranceCoordinates: [0, 1, 2].map((distance) => ({
      x: anchor.position.x + inward.x * distance,
      y: anchor.position.y + inward.y * distance
    })),
    name: `${definition.name} — ${
      formatCampgroundAddress(definition.address)
    }`,
    roadPosition: anchor.position,
    roadRing: anchor.roadRing,
    signPosition,
    structures: campStructuresForBand(
      signPosition,
      anchor.band,
      definition
    )
  }
}

const themeCampRoadAnchors = (
  geometry: CampgroundGeometry
): ReadonlyArray<ThemeCampRoadAnchor> => [
  {
    band: "north",
    roadRing: "outer",
    position: { x: 30, y: geometry.outerTop }
  },
  {
    band: "north",
    roadRing: "middle",
    position: { x: geometry.middleLeft + 20, y: geometry.middleTop }
  },
  {
    band: "north",
    roadRing: "inner",
    position: { x: geometry.innerLeft + 12, y: geometry.innerTop }
  },
  {
    band: "north",
    roadRing: "outer",
    position: { x: geometry.centerX - 25, y: geometry.outerTop }
  },
  {
    band: "north",
    roadRing: "middle",
    position: { x: geometry.centerX + 20, y: geometry.middleTop }
  },
  {
    band: "north",
    roadRing: "inner",
    position: { x: geometry.innerRight - 12, y: geometry.innerTop }
  },
  {
    band: "north",
    roadRing: "middle",
    position: { x: geometry.middleRight - 20, y: geometry.middleTop }
  },
  {
    band: "north",
    roadRing: "outer",
    position: { x: geometry.outerRight - 30, y: geometry.outerTop }
  },
  {
    band: "south",
    roadRing: "outer",
    position: { x: 30, y: geometry.outerBottom }
  },
  {
    band: "south",
    roadRing: "middle",
    position: { x: geometry.middleLeft + 20, y: geometry.middleBottom }
  },
  {
    band: "south",
    roadRing: "inner",
    position: { x: geometry.innerLeft + 12, y: geometry.innerBottom }
  },
  {
    band: "south",
    roadRing: "outer",
    position: { x: geometry.centerX - 25, y: geometry.outerBottom }
  },
  {
    band: "south",
    roadRing: "middle",
    position: { x: geometry.centerX + 20, y: geometry.middleBottom }
  },
  {
    band: "south",
    roadRing: "inner",
    position: { x: geometry.innerRight - 12, y: geometry.innerBottom }
  },
  {
    band: "south",
    roadRing: "middle",
    position: { x: geometry.middleRight - 20, y: geometry.middleBottom }
  },
  {
    band: "south",
    roadRing: "outer",
    position: { x: geometry.outerRight - 30, y: geometry.outerBottom }
  },
  {
    band: "west",
    roadRing: "outer",
    position: { x: geometry.outerLeft, y: 30 }
  },
  {
    band: "west",
    roadRing: "middle",
    position: { x: geometry.middleLeft, y: geometry.centerY - 18 }
  },
  {
    band: "west",
    roadRing: "inner",
    position: { x: geometry.innerLeft, y: geometry.centerY + 4 }
  },
  {
    band: "west",
    roadRing: "outer",
    position: { x: geometry.outerLeft, y: geometry.outerBottom - 30 }
  },
  {
    band: "east",
    roadRing: "outer",
    position: { x: geometry.outerRight, y: 30 }
  },
  {
    band: "east",
    roadRing: "middle",
    position: { x: geometry.middleRight, y: geometry.centerY - 18 }
  },
  {
    band: "east",
    roadRing: "inner",
    position: { x: geometry.innerRight, y: geometry.centerY + 4 }
  },
  {
    band: "east",
    roadRing: "outer",
    position: { x: geometry.outerRight, y: geometry.outerBottom - 30 }
  }
]

const makeThemeCampLayouts = (
  geometry: CampgroundGeometry
): Effect.Effect<Array<ThemeCampLayout>, LevelGenerationError> =>
  Effect.forEach(campgroundCamps, (definition) =>
    getRequiredAt(
      themeCampRoadAnchors(geometry),
      definition.slot,
      `campground road anchor ${definition.id}`
    ).pipe(
      Effect.map((anchor) => makeThemeCampLayout(definition, anchor))
    ))

type CampPropPlacement = {
  readonly kind: CampPropKind
  readonly position: GridPosition
}

const motifCampPropKinds = (
  definition: CampgroundCampDefinition
): ReadonlyArray<CampPropKind> => {
  switch (definition.structure.motif) {
    case "communal-kitchen":
      return ["table", "table", "water-station"]
    case "repair-yard":
      return ["workbench", "bike-rack", "table"]
    case "dance-dome":
      return ["stage", "speaker", "speaker"]
    case "art-yard":
      return ["artwork", "flagpole", "artwork"]
    case "flag-workshop":
      return ["flagpole", "workbench", "artwork"]
    case "ranger-outpost":
      return ["directory", "bike-rack", "table"]
    case "quiet-garden":
      return ["artwork", "table", "lantern"]
    case "shaded-lounge":
    case "tea-circle":
      return ["table", "lantern", "artwork"]
    case "reading-nook":
      return ["table", "lantern", "artwork"]
    case "shade-court":
      return ["table", "artwork", "lantern"]
    case "tent-cluster":
      return ["lantern", "table", "flagpole"]
  }
}

const campPropCandidateCoordinates = (
  layout: ThemeCampLayout
): ReadonlyArray<GridPosition> => {
  const inward = layout.band === "north"
    ? { x: 0, y: 1 }
    : layout.band === "south"
    ? { x: 0, y: -1 }
    : layout.band === "west"
    ? { x: 1, y: 0 }
    : { x: -1, y: 0 }
  const tangent = layout.band === "north" || layout.band === "south"
    ? { x: 1, y: 0 }
    : { x: 0, y: 1 }

  return [-4, 4, 0, -6, 6].map((offset, index) => ({
    x: layout.signPosition.x + tangent.x * offset
      + inward.x * (index < 2 ? 1 : 2),
    y: layout.signPosition.y + tangent.y * offset
      + inward.y * (index < 2 ? 1 : 2)
  }))
}

const selectPatrolAwningCoordinates = (
  anchors: ReadonlyArray<GridPosition>,
  roadCoordinates: ReadonlyArray<GridPosition>,
  unavailableCoordinates: ReadonlyArray<GridPosition>
): Effect.Effect<Array<GridPosition>, LevelGenerationError> =>
  Effect.gen(function*() {
    const unavailable = new globalThis.Set(
      unavailableCoordinates.map(gridKey)
    )
    const selected: Array<GridPosition> = []

    for (const [index, anchor] of anchors.entries()) {
      const coordinate = roadCoordinates.filter((candidate) =>
        !unavailable.has(gridKey(candidate))
        && campgroundGridDistance(candidate, anchor) <= 12
      ).sort((left, right) =>
        campgroundGridDistance(left, anchor)
          - campgroundGridDistance(right, anchor)
        || left.y - right.y
        || left.x - right.x
      ).at(0)
      if (coordinate === undefined) {
        return yield* Effect.fail(
          levelGenerationError(`campground patrol awning ${index}`)
        )
      }
      selected.push(coordinate)
      unavailable.add(gridKey(coordinate))
    }

    return selected
  })

type OwnedTentStructure = {
  readonly band: ThemeCampBand
  readonly campId: string
  readonly doorApproach?: GridPosition
  readonly id: string
  readonly signPosition: GridPosition
  readonly spec: TentStructureSpec
  readonly tiles: TentStructureTiles
}

type TentBoundaryPlacement = {
  readonly ownerId: string
  readonly position: GridPosition
  readonly variant: typeof DirectionalVariantSchema.Type
}

const ownedTentStructures = (
  layouts: ReadonlyArray<ThemeCampLayout>
): Array<OwnedTentStructure> =>
  layouts.flatMap((layout) =>
    layout.structures.map((spec, index) => ({
      band: layout.band,
      campId: layout.definition.id,
      id: `${layout.definition.id}-${index}`,
      signPosition: layout.signPosition,
      spec,
      tiles: tentStructureTiles(spec)
    }))
  )

const tentStructureFootprintCoordinates = (
  tiles: TentStructureTiles
): Array<GridPosition> =>
  uniqueGridPositions(
    tiles.roofCoordinates
      .concat(tiles.wallCoordinates)
      .concat(tiles.doorCoordinates)
      .concat(tiles.postCoordinates)
  )

const tentStructureClearanceCoordinates = (
  coordinates: ReadonlyArray<GridPosition>
): Array<GridPosition> =>
  uniqueGridPositions(
    coordinates.flatMap((coordinate) => [
      coordinate,
      { x: coordinate.x - 1, y: coordinate.y },
      { x: coordinate.x + 1, y: coordinate.y },
      { x: coordinate.x, y: coordinate.y - 1 },
      { x: coordinate.x, y: coordinate.y + 1 }
    ])
  )

const tentStructurePlacementOffsets = (): ReadonlyArray<{
  readonly inward: number
  readonly tangent: number
}> => {
  const offsets = range(0, 14).flatMap((inward) =>
    range(-20, 20).map((tangent) => ({ inward, tangent }))
  )

  return offsets.sort((left, right) =>
    Math.abs(left.tangent) + left.inward
      - (Math.abs(right.tangent) + right.inward)
    || left.inward - right.inward
    || left.tangent - right.tangent
  )
}

const CAMPGROUND_CAMP_LOT_RADIUS = 32

const tentStructureTranslation = (
  band: ThemeCampBand,
  tangent: number,
  inward: number
): GridPosition =>
  band === "north"
    ? { x: tangent, y: inward }
    : band === "south"
    ? { x: tangent, y: -inward }
    : band === "west"
    ? { x: inward, y: tangent }
    : { x: -inward, y: tangent }

const translateTentStructureSpec = (
  spec: TentStructureSpec,
  offset: GridPosition
): TentStructureSpec => {
  return {
    ...spec,
    origin: {
      x: spec.origin.x + offset.x,
      y: spec.origin.y + offset.y
    }
  }
}

const translateTentStructureTiles = (
  tiles: TentStructureTiles,
  offset: GridPosition
): TentStructureTiles => {
  const translate = (coordinate: GridPosition): GridPosition => ({
    x: coordinate.x + offset.x,
    y: coordinate.y + offset.y
  })

  return {
    doorCoordinates: tiles.doorCoordinates.map(translate),
    floorCoordinates: tiles.floorCoordinates.map(translate),
    postCoordinates: tiles.postCoordinates.map(translate),
    roofCoordinates: tiles.roofCoordinates.map(translate),
    wallCoordinates: tiles.wallCoordinates.map(translate)
  }
}

const personalTentDoorApproachCoordinate = (
  spec: Extract<TentStructureSpec, { readonly kind: "personal" }>,
  tiles: TentStructureTiles
): GridPosition | undefined => {
  const door = tiles.doorCoordinates[0]
  if (door === undefined) return undefined

  switch (spec.doorSide ?? "south") {
    case "north":
      return { x: door.x, y: door.y - 1 }
    case "south":
      return { x: door.x, y: door.y + 1 }
    case "west":
      return { x: door.x - 1, y: door.y }
    case "east":
      return { x: door.x + 1, y: door.y }
  }
}

const resolveTentStructures = (
  layouts: ReadonlyArray<ThemeCampLayout>,
  roadCoordinates: ReadonlyArray<GridPosition>,
  reservedCoordinates: ReadonlyArray<GridPosition>
): Effect.Effect<Array<OwnedTentStructure>, LevelGenerationError> =>
  Effect.gen(function*() {
    const authoredStructures = ownedTentStructures(layouts)
    const placementOrder = authoredStructures.filter(({ spec }) =>
      spec.kind !== "personal"
    ).concat(
      authoredStructures.filter(({ spec }) => spec.kind === "personal")
    )
    const roadKeys = new globalThis.Set(roadCoordinates.map(gridKey))
    const reservedKeys = new globalThis.Set(
      reservedCoordinates.map(gridKey)
    )
    const occupiedStructureKeys = new globalThis.Set<string>()
    const structureClearanceKeys = new globalThis.Set<string>()
    const reservedApproachKeys = new globalThis.Set<string>()
    const resolvedStructures: Array<OwnedTentStructure> = []
    const offsets = tentStructurePlacementOffsets()

    for (const structure of placementOrder) {
      let resolved: OwnedTentStructure | undefined
      let resolvedApproach: GridPosition | undefined
      for (const { inward, tangent } of offsets) {
        const offset = tentStructureTranslation(
          structure.band,
          tangent,
          inward
        )
        const spec = translateTentStructureSpec(
          structure.spec,
          offset
        )
        const tiles = translateTentStructureTiles(structure.tiles, offset)
        const footprint = tentStructureFootprintCoordinates(tiles)
        const approach = spec.kind === "personal"
          ? personalTentDoorApproachCoordinate(spec, tiles)
          : undefined
        if (
          (spec.kind === "personal"
            && (
              approach === undefined
              || !isInCampgroundBounds(approach)
              || reservedKeys.has(gridKey(approach))
              || occupiedStructureKeys.has(gridKey(approach))
              || structureClearanceKeys.has(gridKey(approach))
              || reservedApproachKeys.has(gridKey(approach))
            ))
          || footprint.some((coordinate) =>
            !isInCampgroundBounds(coordinate)
            || campgroundGridDistance(
                coordinate,
                structure.signPosition
              ) > CAMPGROUND_CAMP_LOT_RADIUS
            || roadKeys.has(gridKey(coordinate))
            || reservedKeys.has(gridKey(coordinate))
            || structureClearanceKeys.has(gridKey(coordinate))
            || reservedApproachKeys.has(gridKey(coordinate))
          )
        ) {
          continue
        }

        resolved = approach === undefined
          ? { ...structure, spec, tiles }
          : { ...structure, doorApproach: approach, spec, tiles }
        resolvedApproach = approach
        break
      }

      if (
        resolved === undefined
        || (structure.spec.kind === "personal"
          && resolvedApproach === undefined)
      ) {
        return yield* Effect.fail(
          levelGenerationError(`tent structure ${structure.id}`)
        )
      }

      const footprint = tentStructureFootprintCoordinates(resolved.tiles)
      for (const coordinate of footprint) {
        occupiedStructureKeys.add(gridKey(coordinate))
      }
      for (
        const coordinate of tentStructureClearanceCoordinates(footprint)
      ) {
        structureClearanceKeys.add(gridKey(coordinate))
      }
      if (resolvedApproach !== undefined) {
        reservedApproachKeys.add(gridKey(resolvedApproach))
      }
      resolvedStructures.push(resolved)
    }

    return resolvedStructures
  })

const uniqueTentBoundaryPlacements = (
  placements: ReadonlyArray<TentBoundaryPlacement>
): Array<TentBoundaryPlacement> => {
  const unique = new globalThis.Map<string, TentBoundaryPlacement>()
  for (const placement of placements) {
    const key = gridKey(placement.position)
    if (!unique.has(key)) unique.set(key, placement)
  }
  return Array.from(unique.values())
}

const campWallPlacements = (
  structures: ReadonlyArray<OwnedTentStructure>
): Array<TentBoundaryPlacement> =>
  uniqueTentBoundaryPlacements(
    structures.flatMap(({ id, tiles }) => {
      const boundary = tiles.wallCoordinates.concat(tiles.doorCoordinates)
      return tiles.wallCoordinates.map((position) => ({
        ownerId: id,
        position,
        variant: tentWallVariant(boundary, position)
      }))
    })
  )

const campDoorPlacements = (
  structures: ReadonlyArray<OwnedTentStructure>
): Array<TentBoundaryPlacement> =>
  uniqueTentBoundaryPlacements(
    structures.flatMap(({ id, tiles }) => {
      const boundary = tiles.wallCoordinates.concat(tiles.doorCoordinates)
      return tiles.doorCoordinates.map((position) => ({
        ownerId: id,
        position,
        variant: tentWallVariant(boundary, position)
      }))
    })
  )

const campDoorApproachCoordinates = (
  structures: ReadonlyArray<OwnedTentStructure>
): Array<GridPosition> =>
  structures.flatMap(({ doorApproach }) =>
    doorApproach === undefined ? [] : [doorApproach]
  )

const campRoofCoordinates = (
  structureTiles: ReadonlyArray<TentStructureTiles>
): Array<GridPosition> =>
  uniqueGridPositions(
    structureTiles.flatMap((tiles) => tiles.roofCoordinates)
  )

const campPostCoordinates = (
  structureTiles: ReadonlyArray<TentStructureTiles>
): Array<GridPosition> =>
  uniqueGridPositions(
    structureTiles.flatMap((tiles) => tiles.postCoordinates)
  )

const makeCoolerContents = (
  container: Cooler,
  profile: CampgroundCoolerLootProfile
): Effect.Effect<Array<Entity>, never, KeyGenerator> =>
  Effect.gen(function*() {
    const { x, y, z } = container.at
    const bottles = yield* Effect.forEach(
      Array.from({ length: profile.water }),
      () => waterbottle(x, y, z, container.key),
      { concurrency: 1 }
    )
    const beers = yield* Effect.forEach(
      Array.from({ length: profile.beer }),
      () => beer(x, y, z, container.key),
      { concurrency: 1 }
    )
    const hotdogs = yield* Effect.forEach(
      Array.from({ length: profile.hotdog }),
      () => hotdog(x, y, z, container.key),
      { concurrency: 1 }
    )
    const cheeses = yield* Effect.forEach(
      Array.from({ length: profile.cheese }),
      () => cheese(x, y, z, container.key),
      { concurrency: 1 }
    )
    const salsas = yield* Effect.forEach(
      Array.from({ length: profile.salsa }),
      () => salsa(x, y, z, container.key),
      { concurrency: 1 }
    )

    return [...bottles, ...beers, ...hotdogs, ...cheeses, ...salsas]
  })

const chooseRandomCoordinates = (
  availableCoordinates: ReadonlyArray<GridPosition>,
  count: number,
  description: string
): Effect.Effect<Array<GridPosition>, LevelGenerationError> =>
  Effect.gen(function*() {
    if (!Number.isSafeInteger(count) || count < 0) {
      return yield* Effect.fail(
        levelGenerationError(
          `${description} has invalid selection count ${count}`
        )
      )
    }
    if (count > availableCoordinates.length) {
      return yield* Effect.fail(
        levelGenerationError(
          `${description} needs ${count} coordinates, but only ${availableCoordinates.length} are available`
        )
      )
    }

    const shuffledCoordinates = yield* Random.shuffle(
      availableCoordinates
    )

    return Array.from(shuffledCoordinates).slice(0, count)
  })

const chooseSpreadCoordinates = (
  availableCoordinates: ReadonlyArray<GridPosition>,
  count: number,
  minimumDistance: number,
  description: string
): Effect.Effect<Array<GridPosition>, LevelGenerationError> =>
  Effect.gen(function*() {
    if (!Number.isSafeInteger(count) || count < 0) {
      return yield* Effect.fail(
        levelGenerationError(
          `${description} has invalid selection count ${count}`
        )
      )
    }
    if (count === 0) return []

    const shuffledCoordinates = yield* Random.shuffle(
      availableCoordinates
    )
    const selected: Array<GridPosition> = []

    for (const coordinate of shuffledCoordinates) {
      if (
        selected.every((existing) =>
          campgroundGridDistance(existing, coordinate) >= minimumDistance
        )
      ) {
        selected.push(coordinate)
        if (selected.length === count) return selected
      }
    }

    return yield* Effect.fail(
      levelGenerationError(
        `${description} needs ${count} spaced coordinates, but only ${selected.length} were available`
      )
    )
  })

const weatherSensitiveCampPropKinds = new globalThis.Set<CampPropKind>([
  "speaker",
  "stage",
  "table",
  "water-station",
  "workbench"
])

type CampFeatureLayout = {
  readonly communalShelterCoordinates: ReadonlyArray<GridPosition>
  readonly coolerPosition: GridPosition
  readonly layout: ThemeCampLayout
  readonly propPlacements: ReadonlyArray<CampPropPlacement>
}

const makeCampFeatureLayouts = (
  layouts: ReadonlyArray<ThemeCampLayout>,
  structures: ReadonlyArray<OwnedTentStructure>,
  outdoorUnavailableCoordinates: ReadonlyArray<GridPosition>
): Effect.Effect<Array<CampFeatureLayout>, LevelGenerationError> =>
  Effect.gen(function*() {
    const outdoorUnavailable = new globalThis.Set(
      outdoorUnavailableCoordinates.map(gridKey)
    )
    const usedFeatureKeys = new globalThis.Set<string>()
    const features: Array<CampFeatureLayout> = []

    for (const layout of layouts) {
      const communalShelterCoordinates = uniqueGridPositions(
        structures.filter((structure) =>
          structure.campId === layout.definition.id
          && structure.spec.kind !== "personal"
        ).flatMap(({ tiles }) => tiles.roofCoordinates)
      )
      const communalShelterKeys = new globalThis.Set(
        communalShelterCoordinates.map(gridKey)
      )
      const shelteredCandidates = communalShelterCoordinates.filter(
        (coordinate) =>
          !usedFeatureKeys.has(gridKey(coordinate))
          && cardinalGridNeighbors(coordinate).filter((neighbor) =>
              communalShelterKeys.has(gridKey(neighbor))
            ).length >= 2
      )
      const sortedShelteredCandidates = [...shelteredCandidates].sort(
        (left, right) =>
          campgroundGridDistance(left, layout.signPosition)
            - campgroundGridDistance(right, layout.signPosition)
          || left.y - right.y
          || left.x - right.x
      )
      const nearestShelterDistance =
        sortedShelteredCandidates[0] === undefined
          ? undefined
          : campgroundGridDistance(
            sortedShelteredCandidates[0],
            layout.signPosition
          )
      const nearestShelteredCandidates = sortedShelteredCandidates.filter(
        (coordinate) =>
          campgroundGridDistance(coordinate, layout.signPosition)
            === nearestShelterDistance
      )
      const [coolerPosition] = yield* chooseRandomCoordinates(
        nearestShelteredCandidates,
        1,
        `${layout.definition.id} sheltered cooler`
      )
      if (coolerPosition === undefined) {
        return yield* Effect.fail(
          levelGenerationError(
            `${layout.definition.id} sheltered cooler position`
          )
        )
      }
      usedFeatureKeys.add(gridKey(coolerPosition))

      const propCount = layout.definition.kind === "flagship" ? 3 : 2
      const propKinds = motifCampPropKinds(layout.definition).slice(
        0,
        propCount
      )
      const shelteredKinds = propKinds.filter((kind) =>
        weatherSensitiveCampPropKinds.has(kind)
      )
      const outdoorKinds = propKinds.filter((kind) =>
        !weatherSensitiveCampPropKinds.has(kind)
      )
      const shelteredPositions = yield* chooseSpreadCoordinates(
        shelteredCandidates.filter((coordinate) =>
          !usedFeatureKeys.has(gridKey(coordinate))
          && campgroundGridDistance(coordinate, coolerPosition) >= 2
        ),
        shelteredKinds.length,
        3,
        `${layout.definition.id} sheltered activity props`
      )
      const outdoorCandidates = campPropCandidateCoordinates(layout)
        .filter(
          (coordinate) =>
            isInCampgroundBounds(coordinate)
            && !outdoorUnavailable.has(gridKey(coordinate))
            && !usedFeatureKeys.has(gridKey(coordinate))
        )
      const outdoorPositions = yield* chooseRandomCoordinates(
        outdoorCandidates,
        outdoorKinds.length,
        `${layout.definition.id} outdoor activity props`
      )
      let shelteredPositionIndex = 0
      let outdoorPositionIndex = 0
      const propPlacements = propKinds.flatMap((kind) => {
        const position = weatherSensitiveCampPropKinds.has(kind)
          ? shelteredPositions[shelteredPositionIndex++]
          : outdoorPositions[outdoorPositionIndex++]
        return position === undefined ? [] : [{ kind, position }]
      })

      for (
        const position of [
          coolerPosition,
          ...propPlacements.map((placement) => placement.position)
        ]
      ) {
        usedFeatureKeys.add(gridKey(position))
        outdoorUnavailable.add(gridKey(position))
      }
      features.push({
        communalShelterCoordinates,
        coolerPosition,
        layout,
        propPlacements
      })
    }

    return features
  })

const campgroundHumanDisplayNameAt = (offset: number): string =>
  campgroundHumanDisplayNames.at(
    offset % campgroundHumanDisplayNames.length
  ) ?? "Alex"

const campgroundGridDistance = (
  a: GridPosition,
  b: GridPosition
): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)

const CAMPGROUND_RESIDENT_HIPPIE_COUNT = 56
const CAMPGROUND_TRAVELER_COUNT = 8

const campgroundRoadTravelerCount = (
  layouts: ReadonlyArray<ThemeCampLayout>
): number => {
  const travelerRouteWeight = layouts.reduce(
    (count, layout) => count + layout.definition.npcMix.travelers,
    0
  )

  return Math.min(
    CAMPGROUND_TRAVELER_COUNT / 2,
    Math.max(1, Math.ceil(travelerRouteWeight / 10))
  )
}

const campgroundResidentHippieCounts = (
  layouts: ReadonlyArray<ThemeCampLayout>
): ReadonlyMap<string, number> => {
  const minimumPerCamp = 1
  const remainingBudget = Math.max(
    0,
    CAMPGROUND_RESIDENT_HIPPIE_COUNT
      - layouts.length * minimumPerCamp
  )
  const totalWeight = layouts.reduce(
    (total, layout) => total + layout.definition.npcMix.hippies,
    0
  )
  const weighted = layouts.map((layout) => {
    const exactShare = totalWeight === 0
      ? 0
      : remainingBudget * layout.definition.npcMix.hippies / totalWeight
    const wholeShare = Math.floor(exactShare)
    return {
      count: minimumPerCamp + wholeShare,
      id: layout.definition.id,
      remainder: exactShare - wholeShare,
      slot: layout.definition.slot
    }
  })
  let unassigned = CAMPGROUND_RESIDENT_HIPPIE_COUNT
    - weighted.reduce((total, allocation) => total + allocation.count, 0)

  for (
    const allocation of [...weighted].sort((left, right) =>
      right.remainder - left.remainder
      || left.slot - right.slot
      || left.id.localeCompare(right.id)
    )
  ) {
    if (unassigned <= 0) break
    allocation.count += 1
    unassigned -= 1
  }

  return new globalThis.Map(
    weighted.map(({ count, id }) => [id, count] as const)
  )
}

const cardinalGridNeighbors = (
  coordinate: GridPosition
): ReadonlyArray<GridPosition> => [
  { x: coordinate.x + 1, y: coordinate.y },
  { x: coordinate.x - 1, y: coordinate.y },
  { x: coordinate.x, y: coordinate.y + 1 },
  { x: coordinate.x, y: coordinate.y - 1 }
]

const takeCampgroundNpcCoordinates = (
  available: globalThis.Map<string, GridPosition>,
  candidates: ReadonlyArray<GridPosition>,
  count: number,
  description: string
): Effect.Effect<Array<GridPosition>, LevelGenerationError> =>
  chooseRandomCoordinates(candidates, count, description).pipe(
    Effect.tap((coordinates) =>
      Effect.sync(() => {
        for (const coordinate of coordinates) {
          available.delete(gridKey(coordinate))
        }
      })
    )
  )

const makeCampgroundNpcs = (
  layouts: ReadonlyArray<ThemeCampLayout>,
  availableCoordinates: ReadonlyArray<GridPosition>,
  roadKeys: ReadonlySet<string>,
  residentShelterCoordinatesByCamp: ReadonlyMap<
    string,
    ReadonlyArray<GridPosition>
  >,
  travelerShelterCoordinates: ReadonlyArray<GridPosition>,
  patrolShelterCoordinates: ReadonlyArray<GridPosition>,
  dlvl: number
): Effect.Effect<Array<Entity>, LevelGenerationError, KeyGenerator> =>
  Effect.gen(function*() {
    const available = new globalThis.Map(
      availableCoordinates.map((coordinate) =>
        [gridKey(coordinate), coordinate] as const
      )
    )
    const patrolShelterKeys = new globalThis.Set(
      patrolShelterCoordinates.map(gridKey)
    )
    const nameOffset = yield* randomIntInclusive(
      0,
      campgroundHumanDisplayNames.length - 1,
      "campground human display name offset"
    )
    const residents: Array<Entity> = []
    const residentHippieCounts = campgroundResidentHippieCounts(layouts)
    let namedHumanOffset = 0

    for (const layout of layouts) {
      const hippieResidentCount = residentHippieCounts.get(
        layout.definition.id
      ) ?? 1
      const residentCount = hippieResidentCount
        + layout.definition.npcMix.rangers
      const residentShelterCoordinates =
        residentShelterCoordinatesByCamp.get(
          layout.definition.id
        ) ?? []
      const nearbyCandidates = residentShelterCoordinates.filter(
        (coordinate) => available.has(gridKey(coordinate))
      ).sort((left, right) =>
        campgroundGridDistance(left, layout.signPosition)
          - campgroundGridDistance(right, layout.signPosition)
        || left.y - right.y
        || left.x - right.x
      ).slice(0, Math.max(residentCount * 4, residentCount))
      const residentCoordinates = yield* takeCampgroundNpcCoordinates(
        available,
        nearbyCandidates,
        residentCount,
        `${layout.definition.id} residents`
      )
      const hippieCoordinates = residentCoordinates.slice(
        0,
        hippieResidentCount
      )
      const rangerCoordinates = residentCoordinates.slice(
        hippieResidentCount
      )
      const campHippies = yield* Effect.forEach(
        hippieCoordinates,
        ({ x, y }) => hippie(x, y, dlvl, "hippie"),
        { concurrency: 1 }
      )
      const campRangers = yield* Effect.forEach(
        rangerCoordinates,
        ({ x, y }) => {
          const name = campgroundHumanDisplayNameAt(
            nameOffset + namedHumanOffset
          )
          namedHumanOffset += 1
          return ranger(x, y, dlvl, name)
        },
        { concurrency: 1 }
      )

      for (const resident of campHippies) {
        residents.push(resident)
      }
      for (const resident of campRangers) {
        residents.push(resident)
      }
    }

    const roadTravelerCount = campgroundRoadTravelerCount(layouts)
    const roadTravelerCoordinates = yield* takeCampgroundNpcCoordinates(
      available,
      Array.from(available.values()).filter((coordinate) =>
        roadKeys.has(gridKey(coordinate))
        && !patrolShelterKeys.has(gridKey(coordinate))
      ),
      roadTravelerCount,
      "campground road travelers"
    )
    const shelteredTravelerCoordinates =
      yield* takeCampgroundNpcCoordinates(
        available,
        travelerShelterCoordinates.filter((coordinate) =>
          available.has(gridKey(coordinate))
        ),
        CAMPGROUND_TRAVELER_COUNT - roadTravelerCount,
        "campground sheltered roadside travelers"
      )
    const travelers = yield* Effect.forEach(
      roadTravelerCoordinates.concat(shelteredTravelerCoordinates),
      ({ x, y }) => hippie(x, y, dlvl, "traveler"),
      { concurrency: 1 }
    )
    const shelteredPatrolCoordinates = yield* takeCampgroundNpcCoordinates(
      available,
      patrolShelterCoordinates.filter((coordinate) =>
        available.has(gridKey(coordinate))
      ),
      patrolShelterCoordinates.length,
      "campground sheltered ranger patrols"
    )
    const exposedPatrolCoordinates = yield* takeCampgroundNpcCoordinates(
      available,
      Array.from(available.values()).filter((coordinate) =>
        roadKeys.has(gridKey(coordinate))
        && layouts.every((layout) =>
          campgroundGridDistance(coordinate, layout.signPosition) > 14
        )
      ),
      11 - shelteredPatrolCoordinates.length,
      "campground exposed ranger patrols"
    )
    const patrols = yield* Effect.forEach(
      shelteredPatrolCoordinates.concat(exposedPatrolCoordinates),
      ({ x, y }) => {
        const name = campgroundHumanDisplayNameAt(
          nameOffset + namedHumanOffset
        )
        namedHumanOffset += 1
        return ranger(x, y, dlvl, name)
      },
      { concurrency: 1 }
    )

    return [...residents, ...travelers, ...patrols]
  })

const openAirEffigyCoordinates = (
  geometry: CampgroundGeometry
): Array<GridPosition> => {
  const center = {
    x: geometry.centerX,
    y: geometry.centerY
  }

  return uniqueGridPositions([
    center,
    { x: center.x - 1, y: center.y },
    { x: center.x + 1, y: center.y },
    { x: center.x - 2, y: center.y + 1 },
    { x: center.x + 2, y: center.y + 1 },
    { x: center.x, y: center.y - 1 },
    { x: center.x, y: center.y + 1 }
  ])
}

const templeWallCoordinates = (
  geometry: CampgroundGeometry
): Array<GridPosition> =>
  rectangularLoopCoordinates(
    geometry.templeLeft,
    geometry.templeRight,
    geometry.templeTop,
    geometry.templeBottom
  ).filter(
    ({ x, y }) =>
      !(y === geometry.templeBottom
        && Math.abs(x - geometry.templeCenterX) <= 1)
  )

const templeMarkerCoordinate = (
  geometry: CampgroundGeometry
): GridPosition => ({
  x: geometry.templeCenterX,
  y: geometry.templeCenterY
})

const templeStairsDownCoordinate = (
  geometry: CampgroundGeometry
): GridPosition => ({
  x: geometry.templeCenterX,
  y: geometry.templeCenterY + 2
})

const templeWallVariant = (
  geometry: CampgroundGeometry,
  coordinate: GridPosition
): typeof DirectionalVariantSchema.Type => {
  if (coordinate.x === geometry.templeLeft) {
    if (coordinate.y === geometry.templeTop) return "topLeft"
    if (coordinate.y === geometry.templeBottom) return "bottomLeft"
    return "vertical"
  }
  if (coordinate.x === geometry.templeRight) {
    if (coordinate.y === geometry.templeTop) return "topRight"
    if (coordinate.y === geometry.templeBottom) return "bottomRight"
    return "vertical"
  }
  return "horizontal"
}

const isInCampgroundBounds = ({ x, y }: GridPosition): boolean =>
  x >= 0 && x < CAMPGROUND_WIDTH && y >= 0 && y < CAMPGROUND_HEIGHT

const allCampgroundCoordinates = (): Array<GridPosition> =>
  range(0, CAMPGROUND_HEIGHT - 1).flatMap((y) =>
    range(0, CAMPGROUND_WIDTH - 1).map((x) => ({ x, y }))
  )

const RAIN_RUNOFF_CLUSTER_COUNT = 18
const rainRunoffClusterOffsets: ReadonlyArray<GridPosition> = [
  { x: 0, y: 0 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: -1 },
  { x: 0, y: 1 },
  { x: 1, y: 1 }
]

const rainRunoffClusterCoordinates = (
  center: GridPosition
): Array<GridPosition> =>
  rainRunoffClusterOffsets.map((offset) => ({
    x: center.x + offset.x,
    y: center.y + offset.y
  }))

const makeRainRunoffMudCoordinates = (
  roadCoordinates: ReadonlyArray<GridPosition>,
  unavailableKeys: ReadonlySet<string>
): Effect.Effect<Array<GridPosition>, LevelGenerationError> =>
  Effect.gen(function*() {
    const roadKeys = new globalThis.Set(roadCoordinates.map(gridKey))
    const candidateCenters = uniqueGridPositions(
      roadCoordinates.flatMap(({ x, y }) => [
        { x: x - 2, y },
        { x: x + 2, y },
        { x, y: y - 2 },
        { x, y: y + 2 }
      ])
    ).filter(
      (center) => {
        if (
          campgroundGridDistance(center, campgroundWakeUpCoordinate) < 20
        ) return false

        const cluster = rainRunoffClusterCoordinates(center)
        return cluster.every((coordinate) =>
          isInCampgroundBounds(coordinate)
          && !roadKeys.has(gridKey(coordinate))
          && !unavailableKeys.has(gridKey(coordinate))
        ) && cluster.some((coordinate) =>
          cardinalGridNeighbors(coordinate).some((neighbor) =>
            roadKeys.has(gridKey(neighbor))
          )
        )
      }
    )
    const centers = yield* chooseSpreadCoordinates(
      candidateCenters,
      RAIN_RUNOFF_CLUSTER_COUNT,
      10,
      "campground rain runoff"
    )

    return uniqueGridPositions(
      centers.flatMap(rainRunoffClusterCoordinates)
    )
  })

export const makeCampgroundLevel = (
  dlvl: number
): Effect.Effect<World, LevelGenerationError, KeyGenerator> =>
  Effect.gen(function*() {
    const geometry = yield* makeCampgroundGeometry
    const themeCamps = yield* makeThemeCampLayouts(geometry)
    const objectiveSpineCoordinates = campgroundObjectiveSpineCoordinates(
      geometry
    )
    const wakePuddleKeys = new globalThis.Set(
      campgroundMudPuddleCoordinates().map(gridKey)
    )
    const baseRoadCoordinates = uniqueGridPositions(
      connectedRoadLoopCoordinates(geometry)
        .concat(objectiveSpineCoordinates)
        .concat(
          themeCamps.flatMap((layout) => layout.entranceCoordinates)
        )
    )
    const roadCoordinates = uniqueGridPositions(
      baseRoadCoordinates
        .concat(roadJunctionPlazaCoordinates(baseRoadCoordinates))
        .concat(landmarkRoadPlazaCoordinates(geometry))
    ).filter((coordinate) => !wakePuddleKeys.has(gridKey(coordinate)))
    const roadKeys = new globalThis.Set(roadCoordinates.map(gridKey))
    const roadSignCoordinates = [
      { x: geometry.centerX, y: geometry.innerTop },
      { x: geometry.innerRight, y: geometry.centerY },
      { x: geometry.centerX, y: geometry.innerBottom },
      { x: geometry.innerLeft, y: geometry.centerY }
    ] as const
    const effigyCoordinates = openAirEffigyCoordinates(geometry)
    const templeWalls = templeWallCoordinates(geometry)
    const templeMarker = templeMarkerCoordinate(geometry)
    const templeStairsDown = templeStairsDownCoordinate(
      geometry
    )
    const landmarkProtectedCoordinates =
      campgroundLandmarkProtectedCoordinates(geometry)
    const structureReservedCoordinates = landmarkProtectedCoordinates
      .concat(effigyCoordinates)
      .concat(templeWalls)
      .concat([templeMarker, templeStairsDown])
      .concat(themeCamps.map((layout) => layout.signPosition))
      .concat(
        themeCamps.flatMap((layout) => layout.entranceCoordinates)
      )
      .concat(roadSignCoordinates)
      .concat(campgroundReservedTravelCorridorCoordinates())
      .concat(arrivalCanopyCoordinates)
      .concat([
        arrivalGateCoordinate,
        arrivalDirectoryCoordinate,
        arrivalDirectorySignCoordinate,
        arrivalWaterStationCoordinate,
        arrivalWaterLabelCoordinate,
        arrivalGreeterCoordinate,
        campgroundWakeUpCoordinate
      ])
      .concat(arrivalWaterCoordinates)
      .concat(campgroundMudPuddleCoordinates())
    const structures = yield* resolveTentStructures(
      themeCamps,
      roadCoordinates,
      structureReservedCoordinates
    )
    const structureTiles = structures.map(({ tiles }) => tiles)
    const rawStructureRoofCoordinates = campRoofCoordinates(structureTiles)
    const rawStructureWallPlacements = campWallPlacements(structures)
    const rawStructureWallCoordinates = rawStructureWallPlacements.map(
      ({ position }) => position
    )
    const rawStructureDoorPlacements = campDoorPlacements(structures)
    const rawStructureDoorCoordinates = rawStructureDoorPlacements.map(
      ({ position }) => position
    )
    const structureDoorApproachCoordinates = campDoorApproachCoordinates(
      structures
    )
    const rawStructurePostCoordinates = campPostCoordinates(structureTiles)
    const structureRoofCoordinates = rawStructureRoofCoordinates
    const structureDoorPlacements = rawStructureDoorPlacements
    const structureDoorCoordinates = structureDoorPlacements.map(
      ({ position }) => position
    )
    const structureWallPlacements = rawStructureWallPlacements
    const structureWallCoordinates = structureWallPlacements.map(
      ({ position }) => position
    )
    const structurePostCoordinates = rawStructurePostCoordinates
    const campFeatureLayouts = yield* makeCampFeatureLayouts(
      themeCamps,
      structures,
      roadCoordinates
        .concat(rawStructureRoofCoordinates)
        .concat(rawStructureWallCoordinates)
        .concat(rawStructureDoorCoordinates)
        .concat(structureDoorApproachCoordinates)
        .concat(rawStructurePostCoordinates)
        .concat(effigyCoordinates)
        .concat(templeWalls)
        .concat([templeMarker, templeStairsDown])
        .concat(landmarkProtectedCoordinates)
        .concat(themeCamps.map((layout) => layout.signPosition))
    )
    const campPropPlacements = campFeatureLayouts.flatMap(
      ({ propPlacements }) => propPlacements
    )
    const campCoolerCoordinates = campFeatureLayouts.map(
      ({ coolerPosition }) => coolerPosition
    )
    const campPropKeys = new globalThis.Set(
      campPropPlacements.map(({ position }) => gridKey(position))
    )
    const lanternCoordinates = objectiveSpineLanternCoordinates(
      objectiveSpineCoordinates,
      roadKeys
    ).filter((coordinate) =>
      !campPropKeys.has(gridKey(coordinate))
      && !rawStructureRoofCoordinates.some((structureCoordinate) =>
        sameGridPosition(structureCoordinate, coordinate)
      )
      && !rawStructureWallCoordinates.some((structureCoordinate) =>
        sameGridPosition(structureCoordinate, coordinate)
      )
      && !rawStructureDoorCoordinates.some((structureCoordinate) =>
        sameGridPosition(structureCoordinate, coordinate)
      )
      && !structureDoorApproachCoordinates.some((structureCoordinate) =>
        sameGridPosition(structureCoordinate, coordinate)
      )
      && !rawStructurePostCoordinates.some((structureCoordinate) =>
        sameGridPosition(structureCoordinate, coordinate)
      )
      && !templeWalls.some((wallCoordinate) =>
        sameGridPosition(wallCoordinate, coordinate)
      )
    )
    const arrivalPropPlacements: ReadonlyArray<CampPropPlacement> = [
      { kind: "arrival-gate", position: arrivalGateCoordinate },
      { kind: "directory", position: arrivalDirectoryCoordinate },
      { kind: "water-station", position: arrivalWaterStationCoordinate }
    ]
    const propPlacements: ReadonlyArray<CampPropPlacement> = [
      ...arrivalPropPlacements,
      ...lanternCoordinates.map((position) => ({
        kind: "lantern" as const,
        position
      })),
      ...campPropPlacements
    ]
    const propCoordinates = propPlacements.map(({ position }) => position)
    const patrolAwningAnchors = themeCamps.filter(({ definition }) =>
      definition.kind === "flagship"
    ).map(({ signPosition }) => signPosition).concat([
      effigyCoordinates[0] ?? templeMarker,
      templeMarker
    ])
    const patrolAwningCandidateCoordinates = uniqueGridPositions(
      roadCoordinates.flatMap(cardinalGridNeighbors)
    ).filter((coordinate) =>
      isInCampgroundBounds(coordinate)
      && !roadKeys.has(gridKey(coordinate))
    )
    const roadsideShelterUnavailableCoordinates =
      rawStructureRoofCoordinates
        .concat(rawStructureWallCoordinates)
        .concat(rawStructureDoorCoordinates)
        .concat(structureDoorApproachCoordinates)
        .concat(rawStructurePostCoordinates)
        .concat(effigyCoordinates)
        .concat(templeWalls)
        .concat([templeMarker, templeStairsDown])
        .concat(landmarkProtectedCoordinates)
        .concat(themeCamps.map((layout) => layout.signPosition))
        .concat(campCoolerCoordinates)
        .concat(
          themeCamps.flatMap((layout) => layout.entranceCoordinates)
        )
        .concat(roadSignCoordinates)
        .concat(propCoordinates)
        .concat(campgroundReservedTravelCorridorCoordinates())
        .concat(arrivalCanopyCoordinates)
        .concat([arrivalDirectorySignCoordinate])
        .concat(campgroundMudPuddleCoordinates())
    const patrolAwningCoordinates = yield* selectPatrolAwningCoordinates(
      patrolAwningAnchors,
      patrolAwningCandidateCoordinates,
      roadsideShelterUnavailableCoordinates
    )
    const roadsideShelterUnavailableKeys = new globalThis.Set(
      roadsideShelterUnavailableCoordinates.concat(
        patrolAwningCoordinates
      ).map(gridKey)
    )
    const travelerAwningCoordinates = yield* chooseSpreadCoordinates(
      patrolAwningCandidateCoordinates.filter((coordinate) =>
        !roadsideShelterUnavailableKeys.has(gridKey(coordinate))
        && campgroundGridDistance(
            coordinate,
            campgroundWakeUpCoordinate
          ) >= 20
        && patrolAwningCoordinates.every((patrolAwning) =>
          campgroundGridDistance(coordinate, patrolAwning) >= 12
        )
        && themeCamps.every((layout) =>
          campgroundGridDistance(coordinate, layout.signPosition) > 14
        )
      ),
      CAMPGROUND_TRAVELER_COUNT
        - campgroundRoadTravelerCount(themeCamps),
      30,
      "campground traveler roadside awnings"
    )
    const shelterCoordinates = uniqueGridPositions(
      structureRoofCoordinates
        .concat(arrivalCanopyCoordinates)
        .concat(patrolAwningCoordinates)
        .concat(travelerAwningCoordinates)
    )
    const floorBlockerKeys = new globalThis.Set(
      effigyCoordinates
        .concat(templeWalls)
        .concat([templeMarker, templeStairsDown])
        .concat(structureWallCoordinates)
        .concat(structurePostCoordinates)
        .concat(propCoordinates)
        .map(gridKey)
    )
    const reservedPlayerSpawnCoordinate = campgroundWakeUpCoordinate
    const arrivalMarkerCoordinates = [
      arrivalGateCoordinate,
      arrivalDirectoryCoordinate,
      arrivalDirectorySignCoordinate,
      arrivalWaterStationCoordinate,
      arrivalWaterLabelCoordinate,
      arrivalGreeterCoordinate,
      ...arrivalWaterCoordinates
    ]
    const runoffUnavailableKeys = new globalThis.Set(
      structureRoofCoordinates
        .concat(patrolAwningCoordinates)
        .concat(travelerAwningCoordinates)
        .concat(structureWallCoordinates)
        .concat(structureDoorCoordinates)
        .concat(structureDoorApproachCoordinates)
        .concat(structurePostCoordinates)
        .concat(propCoordinates)
        .concat(campCoolerCoordinates)
        .concat(themeCamps.map((layout) => layout.signPosition))
        .concat(roadSignCoordinates)
        .concat(landmarkProtectedCoordinates)
        .concat(arrivalCanopyCoordinates)
        .concat(arrivalMarkerCoordinates)
        .concat(campgroundMudPuddleCoordinates())
        .concat(
          tentStructureClearanceCoordinates(objectiveSpineCoordinates)
        )
        .map(gridKey)
    )
    const rainRunoffCoordinates = yield* makeRainRunoffMudCoordinates(
      roadCoordinates,
      runoffUnavailableKeys
    )
    const mudCoordinates = uniqueGridPositions(
      campgroundMudPuddleCoordinates().concat(rainRunoffCoordinates)
    )
    const mudKeys = new globalThis.Set(mudCoordinates.map(gridKey))
    const fieldCoordinates = allCampgroundCoordinates().filter(
      (coordinate) => {
        const coordinateKey = gridKey(coordinate)
        return !floorBlockerKeys.has(coordinateKey)
          && !roadKeys.has(coordinateKey)
          && !mudKeys.has(coordinateKey)
      }
    )
    const npcBlockerCoordinates = effigyCoordinates
      .concat(templeWalls)
      .concat([templeMarker, templeStairsDown])
      .concat(landmarkProtectedCoordinates)
      .concat(structureWallCoordinates)
      .concat(structureDoorCoordinates)
      .concat(structureDoorApproachCoordinates)
      .concat(structurePostCoordinates)
      .concat(themeCamps.map((layout) => layout.signPosition))
      .concat(
        themeCamps.flatMap((layout) => layout.entranceCoordinates)
      )
      .concat(roadSignCoordinates)
      .concat(campCoolerCoordinates)
      .concat(propCoordinates)
      .concat(campgroundReservedTravelCorridorCoordinates())
      .concat(arrivalMarkerCoordinates)
      .concat(arrivalCanopyCoordinates)
      .concat(mudCoordinates)
      .concat([reservedPlayerSpawnCoordinate])
    const npcBlockerKeys = new globalThis.Set(
      npcBlockerCoordinates.map(gridKey)
    )
    const npcSpawnCoordinates = uniqueGridPositions(
      fieldCoordinates.concat(roadCoordinates)
    ).filter((coordinate) => !npcBlockerKeys.has(gridKey(coordinate)))

    const campgroundGroundKey = (
      tag: "floor" | "mud" | "tunnel",
      coordinate: GridPosition
    ): string =>
      `campground:${tag}:${dlvl}:${coordinate.x}:${coordinate.y}`
    const fields = fieldCoordinates.map(({ x, y }) =>
      makeFloor(
        campgroundGroundKey("floor", { x, y }),
        x,
        y,
        dlvl
      )
    )
    const roads = roadCoordinates.map(({ x, y }) =>
      makeTunnel(
        campgroundGroundKey("tunnel", { x, y }),
        x,
        y,
        dlvl
      )
    )
    const mudPuddle = mudCoordinates.map(({ x, y }) =>
      makeMud(
        campgroundGroundKey("mud", { x, y }),
        x,
        y,
        dlvl
      )
    )
    const templeWallEntities = yield* Effect.forEach(
      templeWalls,
      ({ x, y }) =>
        wall(x, y, dlvl, templeWallVariant(geometry, { x, y })),
      { concurrency: 1 }
    )
    const tentWalls = yield* Effect.forEach(
      structureWallPlacements,
      ({ position, variant }) =>
        tentWall(position.x, position.y, dlvl, variant),
      { concurrency: 1 }
    )
    const tentDoors = yield* Effect.forEach(
      structureDoorPlacements,
      ({ position, variant }) =>
        tentDoor(position.x, position.y, dlvl, false, variant),
      { concurrency: 1 }
    )
    const tentPosts = yield* Effect.forEach(
      structurePostCoordinates,
      ({ x, y }) => tentPost(x, y, dlvl),
      { concurrency: 1 }
    )
    const tentRoofs = yield* Effect.forEach(
      shelterCoordinates,
      ({ x, y }) => tent(x, y, dlvl),
      { concurrency: 1 }
    )
    const signs = yield* Effect.forEach(
      themeCamps,
      (layout) =>
        sign(
          layout.signPosition.x,
          layout.signPosition.y,
          dlvl,
          layout.name
        ),
      { concurrency: 1 }
    )
    const roadSigns = yield* Effect.forEach(
      campgroundRoads,
      (road, index) => {
        const position = roadSignCoordinates[index]
        return position === undefined
          ? Effect.fail(levelGenerationError(`road sign ${road.id}`))
          : sign(position.x, position.y, dlvl, road.signLabel)
      },
      { concurrency: 1 }
    )
    const directoryLandmark = getCampgroundLandmark("directory")
    const waterLandmark = getCampgroundLandmark("water-station")
    const arrivalSigns = yield* Effect.forEach(
      [
        {
          name: directoryLandmark === undefined
            ? "Campground Directory"
            : `${directoryLandmark.name} — ${directoryLandmark.signText}`,
          position: arrivalDirectorySignCoordinate
        },
        {
          name: waterLandmark === undefined
            ? "Water Station"
            : `${waterLandmark.name} — ${waterLandmark.signText}`,
          position: arrivalWaterLabelCoordinate
        }
      ],
      ({ name, position }) => sign(position.x, position.y, dlvl, name),
      { concurrency: 1 }
    )
    const campgroundProps = yield* Effect.forEach(
      propPlacements,
      ({ kind, position }) => campProp(position.x, position.y, dlvl, kind),
      { concurrency: 1 }
    )
    const effigies = yield* Effect.forEach(
      effigyCoordinates,
      ({ x, y }) => effigy(x, y, dlvl),
      { concurrency: 1 }
    )
    const temples = yield* Effect.forEach(
      [templeMarker],
      ({ x, y }) => temple(x, y, dlvl),
      { concurrency: 1 }
    )
    const downStairs = yield* Effect.forEach(
      [templeStairsDown],
      ({ x, y }) => stairsDown(x, y, dlvl),
      { concurrency: 1 }
    )
    const campCoolers = yield* Effect.forEach(
      campFeatureLayouts,
      ({ coolerPosition, layout }) =>
        cooler(
          coolerPosition.x,
          coolerPosition.y,
          dlvl
        ).pipe(
          Effect.map((container) => ({ container, layout }))
        ),
      { concurrency: 1 }
    )
    const coolerContents = yield* Effect.forEach(
      campCoolers,
      ({ container, layout }) =>
        makeCoolerContents(container, layout.definition.coolerLoot),
      { concurrency: 1 }
    )
    const patchBayCooler = campCoolers.find(({ layout }) =>
      layout.definition.id === "patch-bay"
    )?.container
    if (patchBayCooler === undefined) {
      return yield* Effect.fail(
        levelGenerationError("Patch Bay quest-tool cooler")
      )
    }
    const borrowedTool: Entity = {
      ...makeGroundHammer(
        CAMPGROUND_BORROWED_TOOL_KEY,
        patchBayCooler.at
      ),
      in: patchBayCooler.key
    }
    const arrivalWater = yield* Effect.forEach(
      arrivalWaterCoordinates,
      ({ x, y }) => waterbottle(x, y, dlvl),
      { concurrency: 1 }
    )
    const residentShelterCoordinatesByCamp = new globalThis.Map(
      campFeatureLayouts.map(({ communalShelterCoordinates, layout }) =>
        [
          layout.definition.id,
          communalShelterCoordinates
        ] as const
      )
    )
    const campgroundNpcs = yield* makeCampgroundNpcs(
      themeCamps,
      npcSpawnCoordinates,
      roadKeys,
      residentShelterCoordinatesByCamp,
      travelerAwningCoordinates,
      patrolAwningCoordinates,
      dlvl
    )
    const arrivalGreeter = yield* ranger(
      arrivalGreeterCoordinate.x,
      arrivalGreeterCoordinate.y,
      dlvl,
      "Alex"
    )
    const level: Array<Entity> = [
      ...fields,
      ...roads,
      ...mudPuddle,
      ...templeWallEntities,
      ...tentWalls,
      ...tentDoors,
      ...tentPosts,
      ...tentRoofs,
      ...signs,
      ...roadSigns,
      ...arrivalSigns,
      ...campgroundProps,
      ...effigies,
      ...temples,
      ...downStairs,
      ...campCoolers.map(({ container }) => container),
      ...coolerContents.flat(),
      borrowedTool,
      ...arrivalWater,
      ...campgroundNpcs,
      arrivalGreeter
    ]

    return HashMap.fromIterable(
      level.map((e) => [e.key, e])
    )
  })

type LevelGeneratorKind = "campground" | "dungeon"

const levelRandomSeed = (
  generator: LevelGeneratorKind,
  seed: number,
  dlvl: number
): string =>
  `flag-hack:level-generation:v1:${generator}:seed:${seed}:level:${dlvl}`

export const CampgroundGenLevel = (
  seed: number,
  dlvl: number
): Effect.Effect<World, LevelGenerationError> =>
  !Number.isSafeInteger(seed) || !Number.isSafeInteger(dlvl)
    ? Effect.fail(
      levelGenerationError(
        `campground seed and level must be safe integers; received ${seed}/${dlvl}`
      )
    )
    : makeCampgroundLevel(dlvl).pipe(
      Effect.provide(CounterKeyGeneratorLive),
      Effect.withRandom(
        Random.make(levelRandomSeed("campground", seed, dlvl))
      )
    )

export const firstDungeonArrivalCoordinate: GridPosition = { x: 1, y: 1 }

const firstDungeonMazeDirections: ReadonlyArray<GridPosition> = [
  { x: 2, y: 0 },
  { x: -2, y: 0 },
  { x: 0, y: 2 },
  { x: 0, y: -2 }
]

const isFirstDungeonMazeCell = ({ x, y }: GridPosition): boolean =>
  x > 0
  && x < SCREEN_WIDTH
  && y > 0
  && y < SCREEN_HEIGHT - 1
  && x % 2 === 1
  && y % 2 === 1

const firstDungeonCorridorCoordinates: Effect.Effect<
  Array<GridPosition>,
  LevelGenerationError
> = Effect.gen(function*() {
  const visited = new globalThis.Set<string>([
    gridKey(firstDungeonArrivalCoordinate)
  ])
  const corridors = new globalThis.Map<string, GridPosition>([[
    gridKey(firstDungeonArrivalCoordinate),
    firstDungeonArrivalCoordinate
  ]])
  const stack: Array<GridPosition> = [firstDungeonArrivalCoordinate]

  while (stack.length > 0) {
    const current = stack.at(-1)
    if (current === undefined) break

    const unvisitedNeighbors = firstDungeonMazeDirections
      .map(({ x, y }) => ({ x: current.x + x, y: current.y + y }))
      .filter((coordinate) =>
        isFirstDungeonMazeCell(coordinate)
        && !visited.has(gridKey(coordinate))
      )

    if (unvisitedNeighbors.length === 0) {
      stack.pop()
      continue
    }

    const neighborIndex = yield* randomIntInclusive(
      0,
      unvisitedNeighbors.length - 1,
      "first dungeon maze neighbor"
    )
    const next = yield* getRequiredAt(
      unvisitedNeighbors,
      neighborIndex,
      "first dungeon maze neighbor"
    )
    const connector = {
      x: (current.x + next.x) / 2,
      y: (current.y + next.y) / 2
    }

    visited.add(gridKey(next))
    corridors.set(gridKey(connector), connector)
    corridors.set(gridKey(next), next)
    stack.push(next)
  }

  return Array.from(corridors.values())
})

const cardinalCorridorNeighborCount = (
  coordinate: GridPosition,
  corridorKeys: ReadonlySet<string>
): number =>
  [
    { x: coordinate.x - 1, y: coordinate.y },
    { x: coordinate.x + 1, y: coordinate.y },
    { x: coordinate.x, y: coordinate.y - 1 },
    { x: coordinate.x, y: coordinate.y + 1 }
  ].filter((neighbor) => corridorKeys.has(gridKey(neighbor))).length

const corridorDistancesFrom = (
  start: GridPosition,
  corridorKeys: ReadonlySet<string>
): ReadonlyMap<string, number> => {
  const distances = new globalThis.Map<string, number>([
    [gridKey(start), 0]
  ])
  const pending: Array<GridPosition> = [start]

  for (let index = 0; index < pending.length; index += 1) {
    const current = pending[index]
    if (current === undefined) continue
    const currentDistance = distances.get(gridKey(current))
    if (currentDistance === undefined) continue

    for (const neighbor of cardinalGridNeighbors(current)) {
      const neighborKey = gridKey(neighbor)
      if (!corridorKeys.has(neighborKey) || distances.has(neighborKey)) {
        continue
      }

      distances.set(neighborKey, currentDistance + 1)
      pending.push(neighbor)
    }
  }

  return distances
}

const compareCoordinatesByDistance = (
  distances: ReadonlyMap<string, number>,
  left: GridPosition,
  right: GridPosition
): number =>
  (distances.get(gridKey(left)) ?? -1)
    - (distances.get(gridKey(right)) ?? -1)
  || left.y - right.y
  || left.x - right.x

const distanceBands = (
  coordinates: ReadonlyArray<GridPosition>,
  count: number
): ReadonlyArray<ReadonlyArray<GridPosition>> =>
  Array.from({ length: count }, (_, index) =>
    coordinates.slice(
      Math.floor((index * coordinates.length) / count),
      Math.floor(((index + 1) * coordinates.length) / count)
    ))

const makeFirstDungeonLevel = (
  dlvl: number
): Effect.Effect<World, LevelGenerationError, KeyGenerator> =>
  Effect.gen(function*() {
    const corridorCoordinates = yield* firstDungeonCorridorCoordinates
    const corridorKeys = new globalThis.Set(
      corridorCoordinates.map(gridKey)
    )
    const walls = yield* makeAllWalls(SCREEN_WIDTH, SCREEN_HEIGHT, dlvl)
    const carvedTerrain = yield* Effect.forEach(
      walls,
      (entity) =>
        corridorKeys.has(gridKey(entity.at))
          ? tunnel(entity.at.x, entity.at.y, dlvl)
          : Effect.succeed(entity),
      { concurrency: 1 }
    )
    const terrain = finalizeWallVariants(carvedTerrain)
    const deadEnds = corridorCoordinates.filter((coordinate) =>
      !sameGridPosition(coordinate, firstDungeonArrivalCoordinate)
      && cardinalCorridorNeighborCount(coordinate, corridorKeys) === 1
    )
    const corridorDistances = corridorDistancesFrom(
      firstDungeonArrivalCoordinate,
      corridorKeys
    )
    const flagCoordinate = [...deadEnds].sort((left, right) =>
      compareCoordinatesByDistance(corridorDistances, right, left)
    ).at(0)
    if (flagCoordinate === undefined) {
      return yield* Effect.fail(
        levelGenerationError("first dungeon missing-flag dead end")
      )
    }
    const maximumCorridorDistance = Math.max(
      ...corridorDistances.values()
    )
    const minimumHippieDistance = Math.ceil(maximumCorridorDistance / 4)
    const hippieCandidates = deadEnds.filter((coordinate) =>
      !sameGridPosition(coordinate, flagCoordinate)
      && (corridorDistances.get(gridKey(coordinate)) ?? -1)
        >= minimumHippieDistance
    ).sort((left, right) =>
      compareCoordinatesByDistance(corridorDistances, left, right)
    )
    if (hippieCandidates.length < FIRST_DUNGEON_HIPPIE_COUNT) {
      return yield* Effect.fail(
        levelGenerationError(
          `first dungeon needs ${FIRST_DUNGEON_HIPPIE_COUNT} distant hippie`
            + ` dead ends, but only ${hippieCandidates.length} are available`
        )
      )
    }
    const hippieCoordinates = yield* Effect.forEach(
      distanceBands(hippieCandidates, FIRST_DUNGEON_HIPPIE_COUNT),
      (band, bandIndex) =>
        Effect.gen(function*() {
          const coordinateIndex = yield* randomIntInclusive(
            0,
            band.length - 1,
            `first dungeon hippie distance band ${bandIndex}`
          )
          return yield* getRequiredAt(
            band,
            coordinateIndex,
            `first dungeon hippie distance band ${bandIndex}`
          )
        }),
      { concurrency: 1 }
    )
    const hippies = yield* Effect.forEach(
      hippieCoordinates,
      ({ x, y }) => hippie(x, y, dlvl, "hippie"),
      { concurrency: 1 }
    )
    const returnStairs = yield* stairsUp(
      firstDungeonArrivalCoordinate.x,
      firstDungeonArrivalCoordinate.y,
      dlvl
    )
    const missingFlag = makeGroundFlag(CAMPGROUND_MISSING_FLAG_KEY, {
      ...flagCoordinate,
      z: dlvl
    })
    const level = [...terrain, returnStairs, missingFlag, ...hippies]

    return HashMap.fromIterable(
      level.map((entity) => [entity.key, entity])
    )
  })

export const makeBspLevel = (
  dlvl: number
): Effect.Effect<World, LevelGenerationError, KeyGenerator> =>
  Effect.gen(function*() {
    if (dlvl === FIRST_DUNGEON_LEVEL) {
      return yield* makeFirstDungeonLevel(dlvl)
    }

    const walls = yield* makeAllWalls(SCREEN_WIDTH, SCREEN_HEIGHT, dlvl)
    const level = finalizeWallVariants(yield* _BSPGenLevel(walls))

    return HashMap.fromIterable(
      level.map((e) => [e.key, e])
    )
  })

export const BSPGenLevel = (
  seed: number,
  dlvl: number
): Effect.Effect<World, LevelGenerationError> =>
  makeBspLevel(dlvl).pipe(
    Effect.provide(CounterKeyGeneratorLive),
    Effect.withRandom(
      Random.make(levelRandomSeed("dungeon", seed, dlvl))
    )
  )
// const genFeatures = (world: World) => {
// }
// export const genLevel = (seed: number, dlvl: number) => {
//   const map = BSPGenLevel(seed, dlvl)
//   const withFeatures = genFeatures(map)
// }
