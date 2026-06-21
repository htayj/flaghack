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
  makeWaterBottle,
  salsa
} from "./items.js"
import {
  CounterKeyGeneratorLive,
  type KeyGenerator
} from "./keyGenerator.js"
// import { log } from "./log.js"
import { collideP, shift } from "./position.js"
import type { TPos } from "./position.js"
import {
  effigy,
  floor,
  sign,
  temple,
  tent,
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

const creatureTags = new globalThis.Set<Entity["_tag"]>([
  "player",
  "ranger",
  "hippie",
  "wook",
  "acidcop",
  "lesser_egregore",
  "greater_egregore",
  "collective_egregore"
])
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
  "floor",
  "tunnel",
  "tent",
  "sign",
  "effigy",
  "temple"
])

export const isCreature = (e: Entity): e is Creature =>
  creatureTags.has(e._tag)
export const isTerrain = (e: Entity): boolean => terrainTags.has(e._tag)
export const isImpassable = (e: Entity) => e._tag === "wall"
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
// const MIN_ROOM_SIZE = []
const BSP_MAX_PART_HEIGHT = 10
const BSP_MAX_PART_WIDTH = 10
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
): Effect.Effect<number, LevelGenerationError> => {
  const low = Math.ceil(min)
  const high = Math.floor(max)

  return low > high
    ? Effect.succeed(low)
    : randomIntInclusive(low, high, description)
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
const replaceTilesWithTunnels = (
  a: Array<Entity>,
  b: Array<Entity>,
  tunnels: Array<Entity>
): Array<Entity> =>
  a.concat(b).filter((e) =>
    !tunnels.some((t) => t.at.x === e.at.x && t.at.y === e.at.y)
  ).concat(tunnels)
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

      const tunnels = yield* Effect.forEach(
        minXA < minXB
          ? range(maxXA + 1, minXB - 1)
          : range(maxXB + 1, minXA - 1),
        (x) => tunnel(x, linkLineY, z),
        { concurrency: 1 }
      )
      // console.log(
      //   "linking along: ",
      //   JSON.stringify(tunnels.map((t) => t.at))
      // )
      return replaceTilesWithTunnels(a, b, tunnels)
    }
    const xIntersectValues = Set(xsB).intersect(Set(xsA)).filter((x) =>
      floorsA.some((f) => f.at.x === x && maxYA === f.at.y)
      && floorsB.some((f) => f.at.x === x && maxYB === f.at.y)
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

      const tunnels = yield* Effect.forEach(
        minYA < minYB
          ? range(maxYA + 1, minYB - 1)
          : range(maxYB + 1, minYA - 1),
        (y) => tunnel(linkLineX, y, z),
        { concurrency: 1 }
      )
      // console.log(
      //   "linking along: ",
      //   JSON.stringify(tunnels.map((t) => t.at))
      // )
      return replaceTilesWithTunnels(a, b, tunnels)
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
    const tunnels = yield* Effect.forEach(
      tunnelSources,
      ({ at: { x, y, z } }) => tunnel(x, y, z),
      { concurrency: 1 }
    )
    // console.log("tunnels", tunnels)
    return replaceTilesWithTunnels(a, b, tunnels)
  })

const wallAt = (x: number, y: number) => (w: Array<Entity>) =>
  w.find((e) => e.at.x === x && e.at.y === y)?._tag !== "floor"

const flip =
  <A, B, C>(f: (a: A) => (b: B) => C): (b: B) => (a: A) => C =>
  (b: B) =>
  (a: A) => f(a)(b)

const wallN = flip(({ at: { x, y } }: Entity) => wallAt(x, y - 1))
const wallS = flip(({ at: { x, y } }: Entity) => wallAt(x, y + 1))
const wallE = flip(({ at: { x, y } }: Entity) => wallAt(x + 1, y))
const wallW = flip(({ at: { x, y } }: Entity) => wallAt(x - 1, y))
const wallNE = flip(({ at: { x, y } }: Entity) => wallAt(x + 1, y - 1))
const wallSE = flip(({ at: { x, y } }: Entity) => wallAt(x + 1, y + 1))
const wallNW = flip(({ at: { x, y } }: Entity) => wallAt(x - 1, y - 1))
const wallSW = flip(({ at: { x, y } }: Entity) => wallAt(x - 1, y + 1))

const determineWallVariant = (
  entity: Entity,
  world: Array<Entity>
): typeof DirectionalVariantSchema.Type => {
  // const n = normalNeighbors(e, w).filter((n) => n._tag === "wall")
  const n = wallN(world)(entity)
  const w = wallW(world)(entity)
  const e = wallE(world)(entity)
  const s = wallS(world)(entity)
  const ne = wallNE(world)(entity)
  const nw = wallNW(world)(entity)
  const se = wallSE(world)(entity)
  const sw = wallSW(world)(entity)
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
    return withRoom.map((e) =>
      e._tag === "wall"
        ? { ...e, variant: determineWallVariant(e, withRoom) }
        : e
    )
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
    if (width <= BSP_MAX_PART_WIDTH || height <= BSP_MAX_PART_HEIGHT) {
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
    const verticalp = yield* Random.nextBoolean
    // console.log("vertical split? ", verticalp)
    const sliceAt = yield* randomIntInclusive(
      (verticalp ? minX : minY) + 4,
      (verticalp ? maxX : maxY) - 4,
      "BSP slice"
    )
    // console.log("sliceat: ", sliceAt)
    const [sideA, sideB] = filterSplit(
      level,
      (e) => (verticalp ? e.at.x : e.at.y) < sliceAt
    )
    const doneA = yield* _BSPGenLevel(sideA)
    const doneB = yield* _BSPGenLevel(sideB)

    return yield* _linkLeaves(doneA, doneB)
  })

const CAMPGROUND_WIDTH = 120
const CAMPGROUND_HEIGHT = 48
const CAMPGROUND_HIPPIE_COUNT = 18
const CAMPGROUND_NAMED_HUMAN_COUNT = 5

type GridPosition = {
  readonly x: number
  readonly y: number
}

type CampgroundGeometry = {
  readonly centerX: number
  readonly centerY: number
  readonly outerLeft: number
  readonly outerRight: number
  readonly outerTop: number
  readonly outerBottom: number
  readonly innerLeft: number
  readonly innerRight: number
  readonly innerTop: number
  readonly innerBottom: number
  readonly templeLeft: number
  readonly templeRight: number
  readonly templeTop: number
  readonly templeBottom: number
}

type ThemeCampLayout = {
  readonly name: string
  readonly signPosition: GridPosition
  readonly tentPositions: ReadonlyArray<GridPosition>
  readonly coolerPosition: GridPosition
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

const makeCampgroundGeometry: Effect.Effect<
  CampgroundGeometry,
  LevelGenerationError
> = Effect.gen(function*() {
  const centerX = yield* randomIntInclusive(
    56,
    64,
    "campground center x"
  )
  const centerY = yield* randomIntInclusive(
    23,
    25,
    "campground center y"
  )
  const outerRadiusX = yield* randomIntInclusive(
    44,
    48,
    "outer road loop width"
  )
  const outerRadiusY = yield* randomIntInclusive(
    16,
    18,
    "outer road loop height"
  )
  const innerRadiusX = yield* randomIntInclusive(
    23,
    27,
    "inner road loop width"
  )
  const innerRadiusY = yield* randomIntInclusive(
    7,
    9,
    "inner road loop height"
  )

  return {
    centerX,
    centerY,
    outerLeft: centerX - outerRadiusX,
    outerRight: centerX + outerRadiusX,
    outerTop: centerY - outerRadiusY,
    outerBottom: centerY + outerRadiusY,
    innerLeft: centerX - innerRadiusX,
    innerRight: centerX + innerRadiusX,
    innerTop: centerY - innerRadiusY,
    innerBottom: centerY + innerRadiusY,
    templeLeft: centerX - 6,
    templeRight: centerX + 6,
    templeTop: centerY - 4,
    templeBottom: centerY + 4
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
          geometry.innerTop
        )
      )
      .concat(
        verticalLineCoordinates(
          geometry.centerX,
          geometry.innerBottom,
          geometry.outerBottom
        )
      )
      .concat(
        horizontalLineCoordinates(
          geometry.outerLeft,
          geometry.innerLeft,
          geometry.centerY
        )
      )
      .concat(
        horizontalLineCoordinates(
          geometry.innerRight,
          geometry.outerRight,
          geometry.centerY
        )
      )
  )

const themeCampNames = [
  "Camp Type Safety",
  "Null Pointer Lounge",
  "Dusty Generators",
  "Temple of Tests",
  "Static Mirage",
  "The Side Effect"
] as const

const themeCampNameAt = (offset: number): string =>
  themeCampNames.at(offset % themeCampNames.length) ?? "Camp Type Safety"

const makeThemeCampLayouts = (
  geometry: CampgroundGeometry
): Effect.Effect<Array<ThemeCampLayout>, LevelGenerationError> =>
  Effect.gen(function*() {
    const nameOffset = yield* randomIntInclusive(
      0,
      themeCampNames.length - 1,
      "theme camp name offset"
    )

    return [
      {
        name: themeCampNameAt(nameOffset),
        signPosition: {
          x: geometry.centerX - 24,
          y: geometry.outerTop + 2
        },
        tentPositions: [
          { x: geometry.centerX - 30, y: geometry.outerTop + 3 },
          { x: geometry.centerX - 27, y: geometry.outerTop + 4 },
          { x: geometry.centerX - 24, y: geometry.outerTop + 3 },
          { x: geometry.centerX - 21, y: geometry.outerTop + 4 }
        ],
        coolerPosition: {
          x: geometry.centerX - 24,
          y: geometry.outerTop + 5
        }
      },
      {
        name: themeCampNameAt(nameOffset + 1),
        signPosition: {
          x: geometry.innerRight + 9,
          y: geometry.centerY - 5
        },
        tentPositions: [
          { x: geometry.innerRight + 7, y: geometry.centerY - 7 },
          { x: geometry.innerRight + 10, y: geometry.centerY - 7 },
          { x: geometry.innerRight + 8, y: geometry.centerY + 5 },
          { x: geometry.innerRight + 11, y: geometry.centerY + 6 }
        ],
        coolerPosition: {
          x: geometry.innerRight + 9,
          y: geometry.centerY - 4
        }
      },
      {
        name: themeCampNameAt(nameOffset + 2),
        signPosition: {
          x: geometry.centerX + 24,
          y: geometry.outerBottom - 2
        },
        tentPositions: [
          { x: geometry.centerX + 18, y: geometry.outerBottom - 4 },
          { x: geometry.centerX + 21, y: geometry.outerBottom - 3 },
          { x: geometry.centerX + 24, y: geometry.outerBottom - 4 },
          { x: geometry.centerX + 27, y: geometry.outerBottom - 3 }
        ],
        coolerPosition: {
          x: geometry.centerX + 24,
          y: geometry.outerBottom - 5
        }
      }
    ]
  })

const themeCampStructureCoordinates = (
  layouts: ReadonlyArray<ThemeCampLayout>
): Array<GridPosition> =>
  layouts.flatMap((layout) =>
    [layout.signPosition].concat(layout.tentPositions)
  )

const makeCoolerContents = (
  container: Cooler
): Effect.Effect<Array<Entity>, never, KeyGenerator> =>
  Effect.gen(function*() {
    const { x, y, z } = container.at
    const beers = yield* Effect.forEach(
      range(0, 4),
      () => beer(x, y, z, container.key),
      { concurrency: 1 }
    )
    const foods = yield* Effect.all([
      hotdog(x, y, z, container.key),
      cheese(x, y, z, container.key),
      salsa(x, y, z, container.key)
    ], { concurrency: 1 })

    return [...beers, ...foods]
  })

const campgroundPlayerSpawnAnchor: GridPosition = { x: 60, y: 24 }

const campgroundPlayerSpawnDistanceSquared = (
  coordinate: GridPosition
): number =>
  (coordinate.x - campgroundPlayerSpawnAnchor.x) ** 2
  + (coordinate.y - campgroundPlayerSpawnAnchor.y) ** 2

const selectReservedPlayerSpawnCoordinate = (
  fieldCoordinates: ReadonlyArray<GridPosition>
): Effect.Effect<GridPosition, LevelGenerationError> => {
  const spawnCoordinate = fieldCoordinates.reduce<
    GridPosition | undefined
  >(
    (closest, candidate) =>
      closest === undefined
        || campgroundPlayerSpawnDistanceSquared(candidate)
          < campgroundPlayerSpawnDistanceSquared(closest)
        ? candidate
        : closest,
    undefined
  )

  return spawnCoordinate === undefined
    ? Effect.fail(levelGenerationError("campground player spawn floor"))
    : Effect.succeed(spawnCoordinate)
}

const chooseRandomCoordinate = (
  availableCoordinates: ReadonlyArray<GridPosition>,
  description: string
): Effect.Effect<
  readonly [GridPosition, Array<GridPosition>],
  LevelGenerationError
> =>
  Effect.gen(function*() {
    if (availableCoordinates.length === 0) {
      return yield* Effect.fail(levelGenerationError(description))
    }

    const index = yield* randomIntInclusive(
      0,
      availableCoordinates.length - 1,
      description
    )
    const coordinate = yield* getRequiredAt(
      availableCoordinates,
      index,
      description
    )

    return [
      coordinate,
      availableCoordinates.filter((_, coordinateIndex) =>
        coordinateIndex !== index
      )
    ] as const
  })

const chooseRandomCoordinates = (
  availableCoordinates: ReadonlyArray<GridPosition>,
  count: number,
  description: string
): Effect.Effect<Array<GridPosition>, LevelGenerationError> =>
  Effect.gen(function*() {
    let remainingCoordinates = [...availableCoordinates]
    const selectedCoordinates: Array<GridPosition> = []

    for (const offset of range(0, count - 1)) {
      const [coordinate, nextRemainingCoordinates] =
        yield* chooseRandomCoordinate(
          remainingCoordinates,
          `${description} ${offset}`
        )

      selectedCoordinates.push(coordinate)
      remainingCoordinates = nextRemainingCoordinates
    }

    return selectedCoordinates
  })

const campgroundHumanDisplayNameAt = (offset: number): string =>
  campgroundHumanDisplayNames.at(
    offset % campgroundHumanDisplayNames.length
  ) ?? "Alex"

const makeCampgroundNpcs = (
  availableCoordinates: ReadonlyArray<GridPosition>,
  dlvl: number
): Effect.Effect<Array<Entity>, LevelGenerationError, KeyGenerator> =>
  Effect.gen(function*() {
    const spawnCoordinates = yield* chooseRandomCoordinates(
      availableCoordinates,
      CAMPGROUND_HIPPIE_COUNT + CAMPGROUND_NAMED_HUMAN_COUNT,
      "campground npc spawn"
    )
    const nameOffset = yield* randomIntInclusive(
      0,
      campgroundHumanDisplayNames.length - 1,
      "campground human display name offset"
    )
    const hippieCoordinates = spawnCoordinates.slice(
      0,
      CAMPGROUND_HIPPIE_COUNT
    )
    const humanCoordinates = spawnCoordinates.slice(
      CAMPGROUND_HIPPIE_COUNT
    )
    const hippies = yield* Effect.forEach(
      hippieCoordinates,
      ({ x, y }) => hippie(x, y, dlvl, "hippie"),
      { concurrency: 1 }
    )
    const humans = yield* Effect.forEach(
      humanCoordinates.map((coordinate, offset) => ({
        coordinate,
        name: campgroundHumanDisplayNameAt(nameOffset + offset)
      })),
      ({ coordinate, name }) =>
        ranger(coordinate.x, coordinate.y, dlvl, name),
      { concurrency: 1 }
    )

    return [...hippies, ...humans]
  })

const openAirEffigyCoordinates = (
  geometry: CampgroundGeometry
): Array<GridPosition> => {
  const center = {
    x: geometry.outerLeft + 6,
    y: geometry.outerTop + 3
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
      !(y === geometry.templeBottom && Math.abs(x - geometry.centerX) <= 1)
  )

const templeMarkerCoordinate = (
  geometry: CampgroundGeometry
): GridPosition => ({
  x: geometry.centerX,
  y: geometry.centerY
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

const allCampgroundCoordinates = (): Array<GridPosition> =>
  range(0, CAMPGROUND_HEIGHT - 1).flatMap((y) =>
    range(0, CAMPGROUND_WIDTH - 1).map((x) => ({ x, y }))
  )

export const makeCampgroundLevel = (
  dlvl: number
): Effect.Effect<World, LevelGenerationError, KeyGenerator> =>
  Effect.gen(function*() {
    const geometry = yield* makeCampgroundGeometry
    const themeCamps = yield* makeThemeCampLayouts(geometry)
    const roadCoordinates = connectedRoadLoopCoordinates(geometry)
    const effigyCoordinates = openAirEffigyCoordinates(geometry)
    const templeWalls = templeWallCoordinates(geometry)
    const templeMarker = templeMarkerCoordinate(geometry)
    const occupiedCoordinates = new globalThis.Set(
      roadCoordinates
        .concat(effigyCoordinates)
        .concat(templeWalls)
        .concat([templeMarker])
        .concat(themeCampStructureCoordinates(themeCamps))
        .map(gridKey)
    )
    const fieldCoordinates = allCampgroundCoordinates().filter(
      (coordinate) => !occupiedCoordinates.has(gridKey(coordinate))
    )
    const reservedPlayerSpawnCoordinate =
      yield* selectReservedPlayerSpawnCoordinate(
        fieldCoordinates
      )
    const npcBlockerCoordinates = effigyCoordinates
      .concat(templeWalls)
      .concat([templeMarker])
      .concat(themeCampStructureCoordinates(themeCamps))
      .concat(themeCamps.map((layout) => layout.coolerPosition))
      .concat([reservedPlayerSpawnCoordinate])
    const npcBlockerKeys = new globalThis.Set(
      npcBlockerCoordinates.map(gridKey)
    )
    const npcSpawnCoordinates = uniqueGridPositions(
      fieldCoordinates.concat(roadCoordinates)
    ).filter((coordinate) => !npcBlockerKeys.has(gridKey(coordinate)))

    const fields = yield* Effect.forEach(
      fieldCoordinates,
      ({ x, y }) => floor(x, y, dlvl),
      { concurrency: 1 }
    )
    const roads = yield* Effect.forEach(
      roadCoordinates,
      ({ x, y }) => tunnel(x, y, dlvl),
      { concurrency: 1 }
    )
    const templeWallEntities = yield* Effect.forEach(
      templeWalls,
      ({ x, y }) =>
        wall(x, y, dlvl, templeWallVariant(geometry, { x, y })),
      { concurrency: 1 }
    )
    const tents = yield* Effect.forEach(
      themeCamps.flatMap((layout) => layout.tentPositions),
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
    const coolers = yield* Effect.forEach(
      themeCamps,
      (layout) =>
        cooler(layout.coolerPosition.x, layout.coolerPosition.y, dlvl),
      { concurrency: 1 }
    )
    const coolerContents = yield* Effect.forEach(
      coolers,
      makeCoolerContents,
      { concurrency: 1 }
    )
    const campgroundNpcs = yield* makeCampgroundNpcs(
      npcSpawnCoordinates,
      dlvl
    )
    const level: Array<Entity> = [
      ...fields,
      ...roads,
      ...templeWallEntities,
      ...tents,
      ...signs,
      ...effigies,
      ...temples,
      ...coolers,
      ...coolerContents.flat(),
      ...campgroundNpcs
    ]

    return HashMap.fromIterable(
      level.map((e) => [e.key, e])
    )
  })

export const CampgroundGenLevel = (
  seed: number,
  dlvl: number
): Effect.Effect<World, LevelGenerationError> =>
  makeCampgroundLevel(dlvl).pipe(
    Effect.provide(CounterKeyGeneratorLive),
    Effect.withRandom(Random.make(seed * 100 + dlvl))
  )

export const makeBspLevel = (
  dlvl: number
): Effect.Effect<World, LevelGenerationError, KeyGenerator> =>
  Effect.gen(function*() {
    const walls = yield* makeAllWalls(SCREEN_WIDTH, SCREEN_HEIGHT, dlvl)
    const level = yield* _BSPGenLevel(walls)

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
    Effect.withRandom(Random.make(seed * 100 + dlvl))
  )
// const genFeatures = (world: World) => {
// }
// export const genLevel = (seed: number, dlvl: number) => {
//   const map = BSPGenLevel(seed, dlvl)
//   const withFeatures = genFeatures(map)
// }
