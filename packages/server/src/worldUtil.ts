import type {
  Entity as EntitySchema,
  World as WorldSchema
} from "@flaghack/domain/schemas"
import { HashMap } from "effect"
import { Set } from "immutable"
import type { TPos } from "./position.js"

export type World = typeof WorldSchema.Type

type Entity = typeof EntitySchema.Type
type VEntity = { readonly dist: number; readonly entity: Entity }

const posEq = (a: TPos, b: TPos) =>
  a.x === b.x && a.y === b.y && a.z === b.z

const compareOrdinal = (a: string, b: string) => {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

const compareDistance = (a: VEntity, b: VEntity) => {
  if (a.dist < b.dist) return -1
  if (b.dist < a.dist) return 1

  return compareOrdinal(a.entity.key, b.entity.key)
}

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

const relaxNeighbor = (
  valFun: (e: Entity, w?: World) => number,
  active: VEntity,
  unvisited: Set<VEntity>,
  neighbor: VEntity
): Set<VEntity> => {
  const candidate = active.dist + valFun(neighbor.entity)

  return candidate < neighbor.dist
    ? unvisited.delete(neighbor).add({ ...neighbor, dist: candidate })
    : unvisited
}

const relaxNeighbors = (
  valFun: (e: Entity, w?: World) => number,
  active: VEntity,
  unvisited: Set<VEntity>,
  noDiagonal?: boolean
): Set<VEntity> =>
  neighbors(active.entity, unvisited, noDiagonal).reduce(
    (nextUnvisited, neighbor) =>
      relaxNeighbor(valFun, active, nextUnvisited, neighbor),
    unvisited
  )

const runDijkstra = (
  valFun: (e: Entity, w?: World) => number,
  visited: Set<VEntity>,
  unvisited: Set<VEntity>,
  remaining: number,
  noDiagonal?: boolean
): Set<VEntity> => {
  if (
    remaining <= 0
    || unvisited.size === 0
    || unvisited.every(({ dist }) => dist === Infinity)
  ) return visited

  const active = unvisited.min(compareDistance)

  if (active === undefined) return visited

  const relaxedUnvisited = relaxNeighbors(
    valFun,
    active,
    unvisited,
    noDiagonal
  )

  return runDijkstra(
    valFun,
    visited.add(active),
    relaxedUnvisited.delete(active),
    remaining - 1,
    noDiagonal
  )
}

export const unsafe_dijkstra = (
  valFun: (e: Entity, w?: World) => number,
  visited: Set<VEntity>,
  unvisited: Set<VEntity>,
  noDiagonal?: boolean,
  _world?: World
): Set<VEntity> =>
  runDijkstra(
    valFun,
    visited,
    unvisited,
    unvisited.size,
    noDiagonal
  )

export const dijkstra = (
  start: TPos,
  valFun: (e: Entity, world?: World) => number,
  world: World,
  noDiagonal?: boolean
) => {
  const unvisited = Set(world.pipe(HashMap.values)).map((e) =>
    posEq(e.at, start)
      ? { dist: 0, entity: e }
      : { dist: Infinity, entity: e }
  )

  return unsafe_dijkstra(valFun, Set<VEntity>(), unvisited, noDiagonal)
}

export const dijkstraPath = (
  start: TPos,
  end: TPos,
  valFun: (e: Entity, world?: World) => number,
  world: World,
  noDiagonal?: boolean
) => {
  const dmap = dijkstra(start, valFun, world, noDiagonal)
  const reconstructPath = (
    current: VEntity | undefined,
    remaining: number,
    seenKeys: Set<string>
  ): Array<Entity> | undefined => {
    if (current === undefined || !Number.isFinite(current.dist)) {
      return undefined
    }
    if (Object.is(current.dist, 0)) {
      return []
    }
    if (remaining <= 0 || seenKeys.has(current.entity.key)) {
      return undefined
    }

    const next = neighbors(current.entity, dmap, noDiagonal)
      .filter(({ dist }) => dist < current.dist)
      .min(compareDistance)

    if (next === undefined) {
      return undefined
    }

    const rest = reconstructPath(
      next,
      remaining - 1,
      seenKeys.add(current.entity.key)
    )

    return rest === undefined ? undefined : [next.entity, ...rest]
  }
  const path = reconstructPath(
    dmap.find((entity) => posEq(entity.entity.at, end)),
    dmap.size,
    Set<string>()
  )

  return path ?? []
}
