import { getTile, type Tile } from "@flaghack/domain/display"
import {
  type Action,
  AnyCreature,
  AnyItem,
  AnyTerrain,
  conforms,
  EAction,
  type Entity as EntitySchema,
  type Key as KeySchema,
  type Pos as PosSchema,
  type World as WorldSchema
} from "@flaghack/domain/schemas"
import { Effect, HashMap, Option } from "effect"
import { List, Map } from "immutable"

export const MAX_VISIBLE_MESSAGES = 50
export type Tiles = ReadonlyArray<ReadonlyArray<Tile>>

export const BOARD_HEIGHT = 20
export const BOARD_WIDTH = 80
export const MAX_TRAVEL_STEPS = BOARD_HEIGHT * BOARD_WIDTH
export const MAX_DIRECTIONAL_MOVEMENT_STEPS = BOARD_HEIGHT * BOARD_WIDTH
export type Matrix<T> = List<List<T>>
export const nullMatrix = (h: number, w: number): Matrix<null> =>
  List(
    Array.from({ length: h }, () =>
      List(Array.from({ length: w }, () => null)))
  )
export const isTerrain = conforms(AnyTerrain)
const isCreature = conforms(AnyCreature)
const isItem = conforms(AnyItem)
export type World = typeof WorldSchema.Type
export type Key = typeof KeySchema.Type
export type Entity = typeof EntitySchema.Type
export type Pos = typeof PosSchema.Type
export type MovementDirection =
  | "N"
  | "E"
  | "S"
  | "W"
  | "NE"
  | "NW"
  | "SE"
  | "SW"
type BaseMovementInput = keyof typeof baseMovementDirections
export type MovementPrefix = "g" | "G" | "m" | "M"
export type BlessedKeyLike = {
  readonly full?: string
  readonly name?: string
}
export type ExtendedCommand = "quit"
export type MovementCommand =
  | { readonly _tag: "walk"; readonly dir: MovementDirection }
  | { readonly _tag: "run-to-block"; readonly dir: MovementDirection }
  | { readonly _tag: "rush"; readonly dir: MovementDirection }
  | { readonly _tag: "run"; readonly dir: MovementDirection }
  | { readonly _tag: "no-pickup-walk"; readonly dir: MovementDirection }
  | { readonly _tag: "no-pickup-run"; readonly dir: MovementDirection }
export type RepeatedMovementCommand = Extract<
  MovementCommand,
  {
    readonly _tag:
      | "run-to-block"
      | "rush"
      | "run"
      | "no-pickup-run"
  }
>
type TravelRunResult =
  | { readonly _tag: "arrived"; readonly steps: number }
  | { readonly _tag: "blocked"; readonly steps: number }
  | { readonly _tag: "cancelled"; readonly steps: number }
  | { readonly _tag: "player-not-found"; readonly steps: number }
  | { readonly _tag: "too-far"; readonly steps: number }
export type DirectionalMovementRunResult =
  | { readonly _tag: "blocked"; readonly steps: number }
  | { readonly _tag: "cancelled"; readonly steps: number }
  | { readonly _tag: "interesting"; readonly steps: number }
  | { readonly _tag: "player-not-found"; readonly steps: number }
  | { readonly _tag: "too-far"; readonly steps: number }

export const travelResultMessage = (result: TravelRunResult): string => {
  switch (result._tag) {
    case "arrived":
      return result.steps === 0
        ? "already there"
        : `arrived after ${result.steps} steps`
    case "blocked":
      return result.steps === 0
        ? "no known travel path"
        : `travel blocked after ${result.steps} steps`
    case "cancelled":
      return `travel canceled after ${result.steps} steps`
    case "player-not-found":
      return "cannot travel: player not found"
    case "too-far":
      return `travel stopped after ${result.steps} steps`
  }
}

export const directionalMovementResultMessage = (
  command: RepeatedMovementCommand,
  result: DirectionalMovementRunResult
): string => {
  const label = command._tag === "rush"
    ? "rush"
    : command._tag === "no-pickup-run"
    ? "run without pickup"
    : "run"
  switch (result._tag) {
    case "blocked":
      return result.steps === 0
        ? `${label} blocked immediately`
        : `${label} blocked after ${result.steps} steps`
    case "cancelled":
      return `${label} canceled after ${result.steps} steps`
    case "interesting":
      return command._tag === "run-to-block"
          || command._tag === "no-pickup-run"
        ? `${label} ran into something after ${result.steps} steps`
        : `${label} stopped at something interesting after ${result.steps} steps`
    case "player-not-found":
      return `cannot ${label}: player not found`
    case "too-far":
      return `${label} stopped after ${result.steps} steps`
  }
}

const getTileOrDefault = (e: Entity | undefined): Tile =>
  e === undefined ? { color: "black", char: " " } : getTile(e)

const baseMovementDirections = {
  h: "W",
  j: "S",
  k: "N",
  l: "E",
  y: "NW",
  u: "NE",
  b: "SW",
  n: "SE"
} as const satisfies Readonly<Record<string, MovementDirection>>

const movementDeltas = {
  N: { x: 0, y: -1, z: 0 },
  E: { x: 1, y: 0, z: 0 },
  S: { x: 0, y: 1, z: 0 },
  W: { x: -1, y: 0, z: 0 },
  NE: { x: 1, y: -1, z: 0 },
  NW: { x: -1, y: -1, z: 0 },
  SE: { x: 1, y: 1, z: 0 },
  SW: { x: -1, y: 1, z: 0 }
} as const satisfies Readonly<Record<MovementDirection, Pos>>

const travelSearchDirections = [
  "W",
  "N",
  "E",
  "S",
  "NW",
  "NE",
  "SE",
  "SW"
] as const satisfies ReadonlyArray<MovementDirection>

const cardinalMovementDirections = [
  "N",
  "E",
  "S",
  "W"
] as const satisfies ReadonlyArray<MovementDirection>

const rawControlInputs: Readonly<Record<string, string>> = {
  "\b": "C-h",
  "\u007f": "C-h",
  "\n": "C-j",
  "\u000b": "C-k",
  "\f": "C-l",
  "\u0019": "C-y",
  "\u0015": "C-u",
  "\u0002": "C-b",
  "\u000e": "C-n",
  "\r": "enter"
}

export const isBaseMovementInput = (
  input: string
): input is BaseMovementInput =>
  Object.prototype.hasOwnProperty.call(baseMovementDirections, input)

export const parseMovementCommand = (
  input: string
): Option.Option<MovementCommand> => {
  if (isBaseMovementInput(input)) {
    return Option.some({
      _tag: "walk",
      dir: baseMovementDirections[input]
    })
  }

  const shiftedInput = input.length === 1 ? input.toLowerCase() : ""
  if (input !== shiftedInput && isBaseMovementInput(shiftedInput)) {
    return Option.some({
      _tag: "run-to-block",
      dir: baseMovementDirections[shiftedInput]
    })
  }

  const controlMatch = /^C-([hjklyubn])$/u.exec(input)
  if (
    controlMatch?.[1] !== undefined && isBaseMovementInput(controlMatch[1])
  ) {
    return Option.some({
      _tag: "run",
      dir: baseMovementDirections[controlMatch[1]]
    })
  }

  const prefixedMatch = /^(g|G|m|M)\+([hjklyubn])$/u.exec(input)
  if (
    prefixedMatch?.[1] !== undefined
    && prefixedMatch[2] !== undefined
    && isBaseMovementInput(prefixedMatch[2])
  ) {
    const dir = baseMovementDirections[prefixedMatch[2]]
    switch (prefixedMatch[1]) {
      case "g":
        return Option.some({ _tag: "rush", dir })
      case "G":
        return Option.some({ _tag: "run", dir })
      case "m":
        return Option.some({ _tag: "no-pickup-walk", dir })
      case "M":
        return Option.some({ _tag: "no-pickup-run", dir })
    }
  }

  return Option.none()
}

export const movementCommandRequiresRepeatedMovement = (
  command: MovementCommand
): command is RepeatedMovementCommand =>
  command._tag === "run-to-block"
  || command._tag === "rush"
  || command._tag === "run"
  || command._tag === "no-pickup-run"

const singleStepMovementAction = (
  command: MovementCommand
): Option.Option<Action> => {
  switch (command._tag) {
    case "walk":
    case "no-pickup-walk":
      return Option.some(EAction.move({ dir: command.dir }))
    case "run-to-block":
    case "rush":
    case "run":
    case "no-pickup-run":
      return Option.none()
  }
}

export const normalizeGameInput = (
  input: string,
  key?: BlessedKeyLike
): string => {
  const full = key?.full ?? key?.name

  if (full !== undefined) {
    const shiftedMatch = /^S-([ghjklmyubn])$/u.exec(full)
    if (shiftedMatch?.[1] !== undefined) {
      return shiftedMatch[1].toUpperCase()
    }

    if (full === "S-3") {
      return "#"
    }

    const controlMatch = /^C-([hjklyubn])$/u.exec(full)
    if (controlMatch?.[1] !== undefined) {
      return `C-${controlMatch[1]}`
    }

    switch (full) {
      case "backspace":
        return "C-h"
      case "linefeed":
        return "C-j"
      case "enter":
      case "return":
      case "escape":
        return full
      default:
        break
    }
  }

  return rawControlInputs[input] ?? input
}

export const parseExtendedCommand = (
  input: string
): Option.Option<ExtendedCommand> => {
  switch (input.trim().replace(/^#/u, "").toLowerCase()) {
    case "quit":
      return Option.some("quit")
    default:
      return Option.none()
  }
}

export const parseInput = (input: string): Option.Option<Action> => {
  const movementCommand = parseMovementCommand(input)
  if (Option.isSome(movementCommand)) {
    return singleStepMovementAction(movementCommand.value)
  }

  switch (input) {
    case ".":
      return Option.some(EAction.noop())
    default:
      return Option.none()
  }
}

const getPosition = (e: Entity): Pos | undefined =>
  e.in === "world" ? e.at : undefined

const positionKey = (p: Pos): string => `${p.x},${p.y},${p.z}`
const posKey = (p: Omit<Pos, "z">): string => `${p.x},${p.y}`
export const samePosition = (a: Pos, b: Pos): boolean =>
  a.x === b.x && a.y === b.y && a.z === b.z
const addPositions = (a: Pos, b: Pos): Pos => ({
  x: a.x + b.x,
  y: a.y + b.y,
  z: a.z + b.z
})
const previousPositionFromDirection = (
  position: Pos,
  direction: MovementDirection
): Pos => {
  const delta = movementDeltas[direction]
  return {
    x: position.x - delta.x,
    y: position.y - delta.y,
    z: position.z - delta.z
  }
}
const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))
export const clampTravelTarget = (target: Pos): Pos => ({
  x: clamp(target.x, 0, BOARD_WIDTH - 1),
  y: clamp(target.y, 0, BOARD_HEIGHT - 1),
  z: target.z
})
export const moveTravelTarget = (
  target: Pos,
  direction: MovementDirection
): Pos =>
  clampTravelTarget(addPositions(target, movementDeltas[direction]))
export const travelPrompt = (target: Pos): string =>
  `Travel target ${target.x},${target.y}: hjkl/yubn move, Enter travel, Esc cancel`
const isPassableTravelTerrain = (entity: Entity): boolean =>
  entity._tag === "floor" || entity._tag === "tunnel"
export const findPlayerPosition = (world: World): Option.Option<Pos> =>
  Option.fromNullable(
    Array.from(world.pipe(HashMap.values)).find((entity) =>
      entity._tag === "player"
    )?.at
  )

const entitiesAtPosition = (world: World, position: Pos): Array<Entity> =>
  Array.from(world.pipe(HashMap.values)).filter((entity) =>
    entity.in === "world" && samePosition(entity.at, position)
  )

const directPosition = (
  position: Pos,
  direction: MovementDirection
): Pos => addPositions(position, movementDeltas[direction])

const directionFromPositions = (
  from: Pos,
  to: Pos
): MovementDirection | undefined => {
  const dx = Math.sign(to.x - from.x)
  const dy = Math.sign(to.y - from.y)
  return travelSearchDirections.find((direction) => {
    const delta = movementDeltas[direction]
    return delta.x === dx && delta.y === dy
  })
}

const nonPlayerCreaturesAdjacentTo = (
  world: World,
  position: Pos
): Array<Entity> =>
  Array.from(world.pipe(HashMap.values)).filter((entity) =>
    entity.in === "world"
    && entity._tag !== "player"
    && isCreature(entity)
    && entity.at.z === position.z
    && Math.abs(entity.at.x - position.x) <= 1
    && Math.abs(entity.at.y - position.y) <= 1
  )

const isKnownPassablePosition = (world: World, position: Pos): boolean =>
  Array.from(world.pipe(HashMap.values)).some((entity) =>
    entity.in === "world"
    && samePosition(entity.at, position)
    && isPassableTravelTerrain(entity)
  )

const isKnownCorridorPosition = (world: World, position: Pos): boolean =>
  Array.from(world.pipe(HashMap.values)).some((entity) =>
    entity.in === "world"
    && samePosition(entity.at, position)
    && entity._tag === "tunnel"
  )

const isKnownRoomPosition = (world: World, position: Pos): boolean =>
  Array.from(world.pipe(HashMap.values)).some((entity) =>
    entity.in === "world"
    && samePosition(entity.at, position)
    && entity._tag === "floor"
  )

const onwardPassablePositions = (
  world: World,
  position: Pos,
  previousPosition: Pos
): ReadonlyArray<Pos> =>
  travelSearchDirections
    .map((direction) => addPositions(position, movementDeltas[direction]))
    .filter((candidate) => !samePosition(candidate, previousPosition))
    .filter((candidate) => isKnownPassablePosition(world, candidate))

const onwardCorridorPositions = (
  world: World,
  position: Pos,
  previousPosition: Pos
): ReadonlyArray<Pos> =>
  onwardPassablePositions(world, position, previousPosition).filter(
    (candidate) => isKnownCorridorPosition(world, candidate)
  )

const autorunStopsAtCorridorBoundaries = (
  command: RepeatedMovementCommand
): boolean =>
  command._tag === "run-to-block" || command._tag === "no-pickup-run"

const autorunMayTurnCorners = (
  command: RepeatedMovementCommand
): boolean =>
  command._tag === "run"
  || command._tag === "run-to-block"
  || command._tag === "no-pickup-run"

const shouldStopAtCorridorBoundary = (options: {
  readonly command: RepeatedMovementCommand
  readonly direction: MovementDirection
  readonly world: World
  readonly position: Pos
  readonly previousPosition?: Pos | undefined
}): boolean => {
  if (!autorunStopsAtCorridorBoundaries(options.command)) return false
  if (!isKnownCorridorPosition(options.world, options.position)) {
    return false
  }

  const previousPosition = options.previousPosition
    ?? previousPositionFromDirection(options.position, options.direction)
  return cardinalMovementDirections
    .map((direction) =>
      addPositions(options.position, movementDeltas[direction])
    )
    .filter((candidate) => !samePosition(candidate, previousPosition))
    .some((candidate) => isKnownRoomPosition(options.world, candidate))
    || onwardCorridorPositions(
        options.world,
        options.position,
        previousPosition
      ).length > 1
}

export const shouldStopDirectionalRun = (options: {
  readonly command: RepeatedMovementCommand
  readonly direction: MovementDirection
  readonly world: World
  readonly position: Pos
  readonly previousPosition: Pos
}): boolean => {
  const directAhead = directPosition(options.position, options.direction)

  if (
    entitiesAtPosition(options.world, directAhead).some((entity) =>
      entity._tag !== "player" && isCreature(entity)
    )
  ) {
    return true
  }

  if (autorunStopsAtCorridorBoundaries(options.command)) {
    return shouldStopAtCorridorBoundary(options)
  }

  if (entitiesAtPosition(options.world, options.position).some(isItem)) {
    return true
  }
  if (
    nonPlayerCreaturesAdjacentTo(options.world, options.position).length
      > 0
  ) {
    return true
  }

  return options.command._tag === "rush"
    && isKnownCorridorPosition(options.world, options.position)
    && onwardCorridorPositions(
        options.world,
        options.position,
        options.previousPosition
      ).length > 1
}

const directionDotProduct = (
  left: MovementDirection,
  right: MovementDirection
): number => {
  const leftDelta = movementDeltas[left]
  const rightDelta = movementDeltas[right]
  return leftDelta.x * rightDelta.x + leftDelta.y * rightDelta.y
}

const clockwiseDirections = [
  "N",
  "NE",
  "E",
  "SE",
  "S",
  "SW",
  "W",
  "NW"
] as const satisfies ReadonlyArray<MovementDirection>

const turnAmount = (
  from: MovementDirection,
  to: MovementDirection
): number => {
  const fromIndex = clockwiseDirections.indexOf(from)
  const toIndex = clockwiseDirections.indexOf(to)
  const clockwise = toIndex - fromIndex
  if (clockwise > 4) return clockwise - 8
  if (clockwise < -4) return clockwise + 8
  return clockwise
}

const nextDirectionalRunDirection = (options: {
  readonly command: RepeatedMovementCommand
  readonly direction: MovementDirection
  readonly world: World
  readonly position: Pos
  readonly previousPosition: Pos
  readonly turnAccumulator: number
}): {
  readonly direction: MovementDirection
  readonly turnAccumulator: number
} => {
  if (!autorunMayTurnCorners(options.command)) {
    return {
      direction: options.direction,
      turnAccumulator: options.turnAccumulator
    }
  }
  if (!isKnownCorridorPosition(options.world, options.position)) {
    return {
      direction: options.direction,
      turnAccumulator: options.turnAccumulator
    }
  }

  const choices = onwardCorridorPositions(
    options.world,
    options.position,
    options.previousPosition
  ).filter((candidate) => {
    const direction = directionFromPositions(options.position, candidate)
    return direction !== undefined
      && directionDotProduct(options.direction, direction) >= 0
  })
  if (choices.length !== 1) {
    return {
      direction: options.direction,
      turnAccumulator: options.turnAccumulator
    }
  }

  const nextDirection = directionFromPositions(
    options.position,
    choices[0] ?? options.position
  )
  if (nextDirection === undefined) {
    return {
      direction: options.direction,
      turnAccumulator: options.turnAccumulator
    }
  }

  const nextTurnAccumulator = options.turnAccumulator
    + turnAmount(options.direction, nextDirection)
  if (nextTurnAccumulator < -2 || nextTurnAccumulator > 2) {
    return {
      direction: options.direction,
      turnAccumulator: options.turnAccumulator
    }
  }

  return {
    direction: nextDirection,
    turnAccumulator: nextTurnAccumulator
  }
}

type DirectionalMovementRefresh = {
  readonly world: World
}

// Flag Hack has only single-step server moves, so NetHack autorun commands
// are implemented by repeated CLI moves with NetHack-inspired stop and
// corridor-turning rules from cmd.c/rhack() and hack.c/lookaround().
export const runDirectionalMovement = <
  A extends DirectionalMovementRefresh,
  E,
  R
>(options: {
  readonly world: World
  readonly command: RepeatedMovementCommand
  readonly moveAndRefresh: (
    direction: MovementDirection
  ) => Effect.Effect<A, E, R>
  readonly isCancelled?: (() => boolean) | undefined
  readonly maxSteps?: number
}): Effect.Effect<DirectionalMovementRunResult, E, R> =>
  Effect.gen(function*() {
    const maxSteps = options.maxSteps ?? MAX_DIRECTIONAL_MOVEMENT_STEPS
    let currentWorld = options.world
    let currentDirection = options.command.dir
    let previousPosition: Pos | undefined
    let turnAccumulator = 0
    let steps = 0

    while (steps < maxSteps) {
      if (options.isCancelled?.() === true) {
        return { _tag: "cancelled", steps } as const
      }

      const beforePosition = findPlayerPosition(currentWorld)
      if (Option.isNone(beforePosition)) {
        return { _tag: "player-not-found", steps } as const
      }

      if (
        steps > 0
        && shouldStopAtCorridorBoundary({
          command: options.command,
          direction: currentDirection,
          world: currentWorld,
          position: beforePosition.value,
          previousPosition
        })
      ) {
        return { _tag: "interesting", steps } as const
      }

      const refreshed = yield* options.moveAndRefresh(currentDirection)
      currentWorld = refreshed.world

      const afterPosition = findPlayerPosition(currentWorld)
      if (Option.isNone(afterPosition)) {
        return { _tag: "player-not-found", steps } as const
      }
      if (samePosition(beforePosition.value, afterPosition.value)) {
        return { _tag: "blocked", steps } as const
      }

      steps += 1
      if (options.isCancelled?.() === true) {
        return { _tag: "cancelled", steps } as const
      }

      if (
        shouldStopDirectionalRun({
          command: options.command,
          direction: currentDirection,
          world: currentWorld,
          position: afterPosition.value,
          previousPosition: beforePosition.value
        })
      ) {
        return { _tag: "interesting", steps } as const
      }

      const nextDirection = nextDirectionalRunDirection({
        command: options.command,
        direction: currentDirection,
        world: currentWorld,
        position: afterPosition.value,
        previousPosition: beforePosition.value,
        turnAccumulator
      })
      previousPosition = beforePosition.value
      currentDirection = nextDirection.direction
      turnAccumulator = nextDirection.turnAccumulator
    }

    return { _tag: "too-far", steps } as const
  })

export const findTravelDirections = (
  world: World,
  start: Pos,
  target: Pos
): ReadonlyArray<MovementDirection> => {
  if (samePosition(start, target)) return []

  const passablePositions = new globalThis.Map<string, Pos>()
  const blockedPositions = new globalThis.Set<string>()
  for (const entity of world.pipe(HashMap.values)) {
    if (entity.in !== "world") continue
    if (isPassableTravelTerrain(entity)) {
      passablePositions.set(positionKey(entity.at), entity.at)
    }
    if (isCreature(entity) && !samePosition(entity.at, start)) {
      blockedPositions.add(positionKey(entity.at))
    }
  }
  for (const blockedPosition of blockedPositions) {
    passablePositions.delete(blockedPosition)
  }
  passablePositions.set(positionKey(start), start)

  if (!passablePositions.has(positionKey(target))) return []

  const distances = new globalThis.Map<string, number>([[
    positionKey(target),
    0
  ]])
  const queue: Array<Pos> = [target]

  for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
    const current = queue[queueIndex]
    if (current === undefined) continue

    const currentDistance = distances.get(positionKey(current)) ?? 0
    for (const direction of travelSearchDirections) {
      const next = addPositions(current, movementDeltas[direction])
      const nextKey = positionKey(next)
      if (!passablePositions.has(nextKey) || distances.has(nextKey)) {
        continue
      }
      distances.set(nextKey, currentDistance + 1)
      queue.push(passablePositions.get(nextKey) ?? next)
    }
  }

  const path: Array<MovementDirection> = []
  let current = start
  const startDistance = distances.get(positionKey(current))
  if (startDistance === undefined) return []
  let remainingDistance: number = startDistance

  while (remainingDistance > 0) {
    const previousDistance = remainingDistance
    const next = travelSearchDirections
      .map((direction) => {
        const candidate = addPositions(current, movementDeltas[direction])
        return {
          candidate,
          direction,
          distance: distances.get(positionKey(candidate))
        }
      })
      .find(({ distance }) => distance === previousDistance - 1)

    if (next === undefined || next.distance === undefined) return []
    path.push(next.direction)
    current = next.candidate
    remainingDistance = next.distance
  }

  return path
}

const zindex = (p: Entity) => isTerrain(p) ? 0 : 1
export const prependMessage =
  (message: string) => (messages: List<string>): List<string> =>
    messages.unshift(message).take(MAX_VISIBLE_MESSAGES)

export const drawWorld = (world: World, travelTarget?: Pos): Tiles => {
  const emptyMatrix = nullMatrix(BOARD_HEIGHT, BOARD_WIDTH)

  const worldMap = Map(world)
    .valueSeq()
    .groupBy((entity) => {
      const position = getPosition(entity)
      return position === undefined ? undefined : posKey(position)
    })
    .map((v) => v.valueSeq().toArray())
  const tiles = emptyMatrix.map((row, y) =>
    row
      .map((_, x) => worldMap.get(posKey({ x, y })))
      .map(List)
      .map((l) => {
        const sorted = l.sortBy(zindex).reverse()
        // if(l.size > 1) log(sorted.valueSeq().map(t => t._tag).join(","))
        return sorted.first()
      })
      .map(getTileOrDefault)
      .toArray()
  ).toArray()

  if (travelTarget !== undefined) {
    const targetRow = tiles.at(travelTarget.y)
    if (
      targetRow !== undefined && targetRow[travelTarget.x] !== undefined
    ) {
      tiles[travelTarget.y] = targetRow.map((tile, x) =>
        x === travelTarget.x
          ? { ...tile, bg: true, bright: true, char: "*", color: "yellow" }
          : tile
      )
    }
  }

  return tiles
}
