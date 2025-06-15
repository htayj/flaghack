import {
  AnyCreature,
  AnyItem,
  conforms,
  EEntity,
  Entity,
  Hippie,
  Player,
  World
} from "@flaghack/domain/schemas"
import { HashMap, Option } from "effect"
import { filter, findFirst } from "effect/HashMap"
import { acidcop, hippie, player } from "./creatures.js"
import { movePosition } from "./entity.js"
import { groundFlag, waterbottle } from "./items.js"
// import { log } from "./log.js"
import { range } from "effect/Array"
import { Set } from "immutable"
import prand from "pure-rand"
import { collideP, shift, TPos } from "./position.js"
import { isTerrain, testWalls, Tunnel, tunnel, wall } from "./terrain.js"
import { simpleDraw } from "./testDrawUtils.js"
import { dijkstraPath } from "./worldUtil.js"

export type Entity = typeof Entity.Type
type Player = typeof Player.Type
export type World = typeof World.Type

export const initWorld: Array<Entity> = [
  player(3, 3, 0),
  ...testWalls,
  groundFlag({ x: 4, y: 4, z: 0 }),
  groundFlag({ x: 52, y: 7, z: 0 }),
  groundFlag({ x: 52, y: 9, z: 0 }),
  groundFlag({ x: 58, y: 9, z: 0 }),
  hippie(50, 3, 0),
  acidcop(53, 4, 0),
  waterbottle(0, 0, 0, "player"),
  waterbottle(4, 4, 0, "world")
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
  e.in === "world" && e.at === p
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
const makeAllWalls = (width: number, height: number, dlvl: number) => [
  ...range(0, height - 1).map((y) =>
    range(0, width).map((x) => wall(x, y, 0))
  ).flat()
]
const randBool = (rng: prand.RandomGenerator) => {
  const [num, rng2] = prand.uniformIntDistribution(0, 1, rng)
  return [!!num, rng2] as [boolean, prand.RandomGenerator]
}
const filterSplit = <T>(
  arr: T[],
  fn: (a: T) => boolean
) => [arr.filter(fn), arr.filter((a) => !fn(a))]

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
  number[],
  number[]
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
const _linkLeaves = (
  a: Array<Entity>,
  b: Array<Entity>,
  rng: prand.RandomGenerator
): [Array<Entity>, prand.RandomGenerator] => {
  // console.log("linking")
  const floorsA = a.filter(EEntity.$is("floor"))
  const floorsB = b.filter(EEntity.$is("floor"))
  const [widthA, heightA, minXA, minYA, maxXA, maxYA, xsA, ysA] =
    getSpatialInfo(floorsA)
  const [widthB, heightB, minXB, minYB, maxXB, maxYB, xsB, ysB] =
    getSpatialInfo(floorsB)
  const z = floorsB[0].at.z // fixme?

  // fixme replace all the rest of this with a pathfinding to link random points on edges....
  const yIntersect = Set(ysB).intersect(Set(ysA)).filter((y) =>
    !!floorsA.find((f) => f.at.y === y && (maxXA === f.at.x))
    && !!floorsB.find((f) => f.at.y === y && (minXB === f.at.x))
  )
  if (yIntersect.size > 0) {
    // console.log(
    //   "able to link on y intersection",
    //   JSON.stringify(yIntersect.toArray())
    // )
    const [i, rng2] = prand.uniformIntDistribution(
      0,
      yIntersect.size - 1,
      rng
    )
    const linkLineY = yIntersect.toArray()[i]

    const tunnels = (minXA < minXB
      ? range(maxXA + 1, minXB - 1)
      : range(maxXB + 1, minXA - 1)).map((x) => tunnel(x, linkLineY, z))
    const merged = a.concat(b).filter((e) =>
      !tunnels.find((t) => t.at.x === e.at.x && t.at.y === e.at.y)
    ).concat(tunnels)
    // console.log(
    //   "linking along: ",
    //   JSON.stringify(tunnels.map((t) => t.at))
    // )
    return [merged, rng2]
  }
  const xIntersect = Set(xsB).intersect(Set(xsA)).filter((x) =>
    !!floorsA.find((f) => f.at.x === x && maxYA === f.at.y)
    && !!floorsB.find((f) => f.at.x === x && maxYB === f.at.y)
  )
  if (xIntersect.size > 0) {
    // console.log(
    //   "able to link on x intersection: ",
    //   JSON.stringify(xIntersect.toArray())
    // )
    const [i, rng2] = prand.uniformIntDistribution(
      0,
      xIntersect.size - 1,
      rng
    )
    const linkLineX = xIntersect.toArray()[i]

    const tunnels = (minYA < minYB
      ? range(maxYA + 1, minYB - 1)
      : range(maxYB + 1, minYA - 1)).map((y) => tunnel(linkLineX, y, z))
    // console.log(
    //   "linking along: ",
    //   JSON.stringify(tunnels.map((t) => t.at))
    // )
    const merged = a.concat(b).filter((e) =>
      !tunnels.find((t) => t.at.x === e.at.x && t.at.y === e.at.y)
    ).concat(tunnels)
    return [merged, rng2]
  }
  const [ia, rng2] = prand.uniformIntDistribution(
    0,
    floorsA.length - 1,
    rng
  )
  const [ib, rng3] = prand.uniformIntDistribution(
    0,
    floorsB.length - 1,
    rng2
  )
  const fa = floorsA[ia]
  const fb = floorsB[ib]
  const world = HashMap.fromIterable(a.concat(b).map((e) => [e.key, e]))

  const tunnels = dijkstraPath(fa.at, fb.at, tunnelingDist, world, true)
    .filter(
      (e) => e?._tag === "wall"
    ).map(({ at: { x, y, z } }) => tunnel(x, y, z))
  // console.log("tunnels", tunnels)
  return [
    a.concat(b).filter((e) =>
      !tunnels.find((t) => t.at.x === e.at.x && t.at.y === e.at.y)
    ).concat(tunnels),
    rng3
  ]
}
const _carveRoom = (
  level: Array<Entity>,
  rng: prand.RandomGenerator,
  width: number,
  height: number,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number
): [Array<Entity>, prand.RandomGenerator] => {
  const [top, rng2] = prand.uniformIntDistribution(
    minY + 1,
    maxY - (height / 2) - 1,
    rng
  )
  const [bottom, rng3] = prand.uniformIntDistribution(
    minY + (height / 2) + 1,
    maxY - 1,
    rng2
  )
  const [left, rng4] = prand.uniformIntDistribution(
    minX + 1,
    maxX - (width / 2) - 1,
    rng3
  )
  const [right, rng5] = prand.uniformIntDistribution(
    minX + (width / 2) + 1,
    maxX - 1,
    rng4
  )
  // console.log(
  //   "carving room :: x: [%o => %o], y: [%o => %o]",
  //   left,
  //   right,
  //   top,
  //   bottom
  // )
  const deleteWallp = (e: Entity) =>
    e.at.x <= right && e.at.x >= left && e.at.y <= bottom && e.at.y >= top
  return [
    level.map((e) => deleteWallp(e) ? { ...e, _tag: "floor" } : e),
    rng5
  ]
}
const _BSPGenLevel = (
  level: Array<Entity>,
  rng: prand.RandomGenerator
): [Array<Entity>, prand.RandomGenerator] => {
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
    const res = _carveRoom(
      level,
      rng,
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
  const [verticalp, rng2] = randBool(rng)
  // console.log("vertical split? ", verticalp)
  const [sliceAt, rng3] = prand.uniformIntDistribution(
    (verticalp ? minX : minY) + 4,
    (verticalp ? maxX : maxY) - 4,
    rng2
  )
  // console.log("sliceat: ", sliceAt)
  const [sideA, sideB] = filterSplit(
    level,
    (e) => (verticalp ? e.at.x : e.at.y) < sliceAt
  )
  const [doneA, rng4] = _BSPGenLevel(sideA, rng3)
  const [doneB, rng5] = _BSPGenLevel(sideB, rng4)

  const [linked, rng6] = _linkLeaves(doneA, doneB, rng5)

  return [linked, rng6]
}

export const BSPGenLevel = (seed: number, dlvl: number): World => {
  const walls = makeAllWalls(SCREEN_WIDTH, SCREEN_HEIGHT, dlvl)
  const rng = prand.xoroshiro128plus(seed * 100 + dlvl)
  const [level] = _BSPGenLevel(walls, rng)
  return HashMap.fromIterable(
    level.map((e) => [e.key, e])
  )
}
