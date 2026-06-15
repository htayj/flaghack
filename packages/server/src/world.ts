import {
  AnyCreature,
  AnyItem,
  conforms,
  EEntity,
  Hippie
} from "@flaghack/domain/schemas"
import type {
  DirectionalVariant as DirectionalVariantSchema,
  Entity as EntitySchema,
  Player as PlayerSchema,
  World as WorldSchema
} from "@flaghack/domain/schemas"
import { Data, Effect, HashMap, Option, Random } from "effect"
import { range } from "effect/Array"
import { filter, findFirst } from "effect/HashMap"
import { Set } from "immutable"
import { makeAcidcop, makeHippie, player } from "./creatures.js"
import { movePosition } from "./entity.js"
import { makeGroundFlag, makeWaterBottle } from "./items.js"
import {
  CounterKeyGeneratorLive,
  type KeyGenerator
} from "./keyGenerator.js"
// import { log } from "./log.js"
import { collideP, shift } from "./position.js"
import type { TPos } from "./position.js"
import { floor, isTerrain, testWalls, tunnel, wall } from "./terrain.js"
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
export const isCreature = conforms(AnyCreature)
export const isImpassable = (e: Entity) => e._tag === "wall"
export const isPlayer = (e: Entity): e is Player => e._tag === "player"
export const isHippie = conforms(Hippie)
export const isItem = conforms(AnyItem)
// export const creaturesFrom = <T extends World>(
//   w: T
// ): HashMap.HashMap<string, Creature> => w.pipe(filter(isCreature))
export const notPlayerFrom = <T extends World>(w: T) =>
  w.pipe(filter((o) => !isPlayer(o)))
export const isAt = (p: TPos) => <T extends Entity>(e: T) =>
  e.in === "world" && collideP(p)(e.at)
export const itemsAt = (world: World) => (pos: TPos) =>
  world.pipe(filter(isItem), filter(isAt(pos)))

export const actPosition =
  (w: World) => <T extends Entity>(e: Option.Option<T>, by: TPos) => {
    return Option.match({
      onNone: () => e,
      onSome: (e: T) => {
        const newPosition = shift(e.at, by)
        const eCollides = collideP(newPosition)
        const collidedEntity = w.pipe(
          filter((o) => eCollides(o.at)),
          findFirst((e) =>
            isCreature(e) || (isTerrain(e) && isImpassable(e))
          ) // todo: find a better way of detecting collision
        )

        // log(`collided entity ${JSON.stringify(collidedEntity)}`)
        if (Option.isNone(collidedEntity)) {
          return Option.some(movePosition(e, by))
        }
        if (isTerrain(collidedEntity)) return Option.some(e)
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
