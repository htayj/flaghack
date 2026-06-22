import { type Action, EAction } from "@flaghack/domain/schemas"
import { Effect, HashMap, Option } from "effect"
import { doAction } from "./actions.js"
import {
  type CampgroundActiveRegion,
  entityWithinBounds
} from "./activeRegion.js"
import { planOneAi } from "./ai/ai.js"
import type { GameState } from "./gamestate.js"
import type { TPos } from "./position.js"
import { UV } from "./position.js"
import { type Entity, isCreature, type World } from "./world.js"

export type LazyOffscreenOptions = {
  readonly enabled: boolean
  readonly budget: number
}

export type LazyOffscreenStats = {
  readonly offscreenBudget: number
  readonly offscreenCandidateCount: number
  readonly offscreenBudgetedCount: number
  readonly offscreenCursor: number
  readonly offscreenExecutedCount: number
  readonly offscreenNextCursor: number
  readonly offscreenSkippedNearActiveCount: number
}

export type LazyOffscreenResult = {
  readonly state: GameState
  readonly stats: LazyOffscreenStats
}

export const DEFAULT_LAZY_OFFSCREEN_OPTIONS: LazyOffscreenOptions = {
  budget: 4,
  enabled: true
}

const zeroStats = (
  options: LazyOffscreenOptions,
  candidateCount = 0
): LazyOffscreenStats => ({
  offscreenBudget: options.budget,
  offscreenBudgetedCount: 0,
  offscreenCandidateCount: candidateCount,
  offscreenCursor: 0,
  offscreenExecutedCount: 0,
  offscreenNextCursor: 0,
  offscreenSkippedNearActiveCount: 0
})

const movementDeltas = {
  N: UV.Up,
  E: UV.Right,
  S: UV.Down,
  W: UV.Left,
  NE: UV.UpRight,
  NW: UV.UpLeft,
  SE: UV.DownRight,
  SW: UV.DownLeft
} as const satisfies Readonly<Record<string, TPos>>

const addPosition = (a: TPos, b: TPos): TPos => ({
  x: a.x + b.x,
  y: a.y + b.y,
  z: a.z + b.z
})

const positionKey = (position: TPos): string =>
  `${position.x},${position.y},${position.z}`

const isNonPlayerWorldCreature = (entity: Entity): boolean =>
  entity.in === "world" && entity._tag !== "player" && isCreature(entity)

const sortedOffscreenCreatures = (
  world: World,
  activeRegion: CampgroundActiveRegion
): Array<Entity> =>
  Array.from(world.pipe(HashMap.values)).filter((entity) =>
    isNonPlayerWorldCreature(entity)
    && entity.at.z === activeRegion.collisionBounds.z
    && !entityWithinBounds(activeRegion.collisionBounds)(entity)
  ).sort((a, b) => a.key.localeCompare(b.key))

const moveTarget = (action: Action, entity: Entity): TPos | undefined => {
  if (!EAction.$is("move")(action)) return undefined

  return addPosition(entity.at, movementDeltas[action.dir])
}

const targetStaysOffscreen = (
  activeRegion: CampgroundActiveRegion,
  entity: Entity,
  target: TPos | undefined
): target is TPos =>
  target !== undefined
  && !entityWithinBounds(activeRegion.collisionBounds)({
    ...entity,
    at: target
  })

const candidateMovementPositions = (
  gs: GameState,
  activeRegion: CampgroundActiveRegion,
  entity: Entity
): ReadonlyArray<TPos> => {
  const planned = planOneAi(gs, entity)
  const target = Option.isSome(planned)
    ? moveTarget(planned.value.action, entity)
    : undefined

  return targetStaysOffscreen(activeRegion, entity, target)
    ? [entity.at, target]
    : [entity.at]
}

const localMovementWorld = (
  gs: GameState,
  activeRegion: CampgroundActiveRegion,
  actors: ReadonlyArray<Entity>
): World => {
  const interestingPositions = new Set(
    actors.flatMap((entity) =>
      candidateMovementPositions(gs, activeRegion, entity).map(positionKey)
    )
  )

  return gs.world.pipe(
    HashMap.filter((entity) =>
      entity.in === "world"
      && interestingPositions.has(positionKey(entity.at))
    )
  )
}

type LazyOffscreenAccumulator = {
  readonly state: GameState
  readonly movementWorld: World
  readonly executed: number
  readonly skippedNearActive: number
}

const syncLazyMovementWorld = (
  movementWorld: World,
  entityKey: string,
  fullWorld: World
): World => {
  const movedEntity = fullWorld.pipe(HashMap.get(entityKey))
  return Option.isSome(movedEntity) && movedEntity.value.in === "world"
    ? movementWorld.pipe(HashMap.set(entityKey, movedEntity.value))
    : movementWorld.pipe(HashMap.remove(entityKey))
}

const applyOneLazyOffscreenActor = (
  gs: GameState,
  activeRegion: CampgroundActiveRegion,
  entity: Entity,
  movementWorld: World
): Effect.Effect<{
  readonly state: GameState
  readonly movementWorld: World
  readonly executed: boolean
  readonly nearActive: boolean
}> => {
  const planned = planOneAi(gs, entity)
  if (Option.isNone(planned)) {
    return Effect.succeed({
      executed: false,
      movementWorld,
      nearActive: false,
      state: gs
    })
  }

  if (EAction.$is("noop")(planned.value.action)) {
    return Effect.succeed({
      executed: false,
      movementWorld,
      nearActive: false,
      state: gs
    })
  }

  const target = moveTarget(planned.value.action, entity)
  if (target === undefined) {
    return Effect.succeed({
      executed: false,
      movementWorld,
      nearActive: false,
      state: gs
    })
  }

  if (!targetStaysOffscreen(activeRegion, entity, target)) {
    return Effect.succeed({
      executed: false,
      movementWorld,
      nearActive: true,
      state: gs
    })
  }

  return doAction(gs, planned.value, { movementWorld }).pipe(
    Effect.map((nextState) => {
      const movedEntity = nextState.world.pipe(HashMap.get(entity.key))
      const executed = Option.isSome(movedEntity)
        && movedEntity.value.in === "world"
        && (
          movedEntity.value.at.x !== entity.at.x
          || movedEntity.value.at.y !== entity.at.y
          || movedEntity.value.at.z !== entity.at.z
        )

      return {
        executed,
        movementWorld: syncLazyMovementWorld(
          movementWorld,
          entity.key,
          nextState.world
        ),
        nearActive: false,
        state: nextState
      }
    })
  )
}

export const applyLazyOffscreenStep = (
  gs: GameState,
  activeRegion: CampgroundActiveRegion,
  options: LazyOffscreenOptions = DEFAULT_LAZY_OFFSCREEN_OPTIONS
): Effect.Effect<LazyOffscreenResult> => {
  const candidates = sortedOffscreenCreatures(gs.world, activeRegion)
  if (!options.enabled || options.budget <= 0) {
    return Effect.succeed({
      state: gs,
      stats: zeroStats(options, candidates.length)
    })
  }

  const cursor = candidates.length === 0
    ? 0
    : Math.max(0, Math.floor(gs.lazyOffscreenCursor ?? 0))
      % candidates.length
  const budgeted = candidates.length === 0
    ? []
    : Array.from(
      { length: Math.min(options.budget, candidates.length) },
      (_, index) => candidates[(cursor + index) % candidates.length]
    ).filter((entity): entity is Entity => entity !== undefined)
  const nextCursor = candidates.length === 0
    ? 0
    : (cursor + Math.min(options.budget, candidates.length))
      % candidates.length
  const movementWorld = localMovementWorld(gs, activeRegion, budgeted)
  return Effect.reduce(
    budgeted,
    { executed: 0, movementWorld, skippedNearActive: 0, state: gs },
    (acc: LazyOffscreenAccumulator, entity) =>
      applyOneLazyOffscreenActor(
        acc.state,
        activeRegion,
        entity,
        acc.movementWorld
      ).pipe(
        Effect.map((next) => ({
          executed: acc.executed + (next.executed ? 1 : 0),
          movementWorld: next.movementWorld,
          skippedNearActive: acc.skippedNearActive
            + (next.nearActive ? 1 : 0),
          state: next.state
        }))
      )
  ).pipe(
    Effect.map((result) => ({
      state: {
        ...result.state,
        lazyOffscreenCursor: nextCursor
      },
      stats: {
        offscreenBudget: options.budget,
        offscreenBudgetedCount: budgeted.length,
        offscreenCandidateCount: candidates.length,
        offscreenCursor: cursor,
        offscreenExecutedCount: result.executed,
        offscreenNextCursor: nextCursor,
        offscreenSkippedNearActiveCount: result.skippedNearActive
      }
    }))
  )
}
