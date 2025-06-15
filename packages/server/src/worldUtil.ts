import { Entity, World } from "@flaghack/domain/schemas"
import { Array, HashMap, Option } from "effect"
import { Set } from "immutable"
import { TPos } from "./position.js"
import { dijDraw } from "./testDrawUtils.js"

export type World = typeof World.Type

type Entity = typeof Entity.Type
type VEntity = { dist: number; entity: Entity }
const posEq = (a: TPos, b: TPos) =>
  a.x === b.x && a.y === b.y && a.z === b.z

const neighbors = (
  e: Entity,
  unvisited: Set<VEntity>,
  noDiagonal?: boolean
) =>
  noDiagonal
    ? neighborsWithoutDiag(e, unvisited)
    : neighborsWithDiag(e, unvisited)
const neighborsWithDiag = (e: Entity, unvisited: Set<VEntity>) =>
  unvisited.filter(({ entity }) =>
    entity.at.z === e.at.z && Math.abs(entity.at.x - e.at.x) < 2
    && Math.abs(entity.at.y - e.at.y) < 2
  ).filter(({ entity }) => entity.key !== e.key)
const neighborsWithoutDiag = (e: Entity, unvisited: Set<VEntity>) =>
  unvisited.filter(({ entity }) =>
    entity.at.z === e.at.z && (Math.abs(entity.at.x - e.at.x)
        + Math.abs(entity.at.y - e.at.y)) < 2
  ).filter(({ entity }) => entity.key !== e.key)

export const unsafe_dijkstra = (
  valFun: (e: Entity, w?: World) => number,
  visited: Set<VEntity>,
  unvisited: Set<VEntity>,
  noDiagonal?: boolean,
  world?: World
): Set<VEntity> => {
  // initial values
  // console.log("recurse")
  // console.log("visited size: ", visited.size)
  // console.log("unvisited size: ", unvisited.size)
  if (
    unvisited.size === 0
    || unvisited.every(({ dist }) => dist === Infinity)
  ) return visited
  const active = unvisited.min((a, b) => a.dist < b.dist ? -1 : 1)
  // console.log("active pos: ", active?.entity.at)
  // console.log("unvisited size: ", unvisited.size)
  if (active === undefined) return visited
  const neigh = neighbors(active.entity, unvisited, noDiagonal)
  neigh.forEach((obj) => {
    obj.dist = active.dist + valFun(obj.entity)
  })
  return unsafe_dijkstra(
    valFun,
    visited.add(active),
    unvisited.delete(active),
    noDiagonal,
    world
  )
}
export const dijkstra = (
  start: TPos,
  valFun: (e: Entity, world?: World) => number,
  world: World,
  noDiagonal?: boolean
) => {
  // initial values
  // console.log("dijkstra: start:", start)
  const unvisited = Set(world.pipe(HashMap.values)).map((e) =>
    posEq(e.at, start)
      ? { dist: 0, entity: e }
      : { dist: Infinity, entity: e }
  )
  // console.log("dmap\n", dijDraw(unvisited))
  // console.log(
  //   "first\n",
  //   unvisited.min((a, b) =>
  //     a.dist === b.dist ? 0 : a.dist < b.dist ? -1 : 1
  //   )
  // )
  return unsafe_dijkstra(valFun, Set(), unvisited, noDiagonal)
}
export const dijkstraPath = (
  start: TPos,
  end: TPos,
  valFun: (e: Entity, world?: World) => number,
  world: World,
  noDiagonal?: boolean
) => {
  const dmap = dijkstra(start, valFun, world, noDiagonal)
  // console.log("dmap/n", dijDraw(dmap))
  // let curr = world.pipe(HashMap.findFirst((e) => posEq(e.at, end))).pipe(
  //   Option.match({ onSome: (s) => s, onNone: () => undefined }),

  // )
  // let curr = world.pipe(
  //   HashMap.values,
  //   Array.findFirst((e) => posEq(e.at, end))
  // ).pipe(
  //   Option.match({ onSome: (s) => s, onNone: () => undefined })
  // )
  let curr = dmap.find((e) => posEq(e.entity.at, end))
  let path = []
  while (curr && !(curr.dist === 0)) {
    const n = neighbors(curr.entity, dmap, noDiagonal)
    curr = n.min((a, b) => a.dist < b.dist ? -1 : 1)
    path.push(curr)
    // console.log(path)
    // console.log("curr:", curr)
    // console.log("neighbors:", n.valueSeq().toArray())
  }
  return path.filter((a) => a !== undefined).map(({ entity }) => entity)
}
