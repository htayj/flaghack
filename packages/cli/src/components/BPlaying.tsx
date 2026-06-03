import {
  type Action,
  AnyCreature,
  AnyTerrain,
  conforms,
  EAction,
  type Entity as EntitySchema,
  type Key as KeySchema,
  type Pos as PosSchema,
  type World as WorldSchema
} from "@flaghack/domain/schemas"
// import blessed from "blessed"
import { getTile, type Tile } from "@flaghack/domain/display"
import { Effect, HashMap, Option } from "effect"
import { size } from "effect/HashMap"
import { List, Map } from "immutable"
import React, { useEffect, useMemo, useRef, useState } from "react"
import type { BoxElement } from "react-blessed"
import { GameClient } from "../GameClient.js"
import { LiveRuntime } from "../runtime.js"
import BGameBoard, { type Tiles } from "./BGameBoard.js"
import Inventory from "./Inventory.js"
import Messages, { MAX_VISIBLE_MESSAGES } from "./Messages.js"
import MultiDropPopup from "./MultiDropPopup.js"
import PickupPopup from "./PickupPopup.js"

const apiDoPlayerAction = GameClient.doPlayerAction
const apiGetInventory = GameClient.getInventory
const apiGetPickupItemsFor = GameClient.getPickupItemsFor
// const apiGetLogs = GameClient.getLogs
const apiGetWorld = GameClient.getWorld
const BOARD_HEIGHT = 20
const BOARD_WIDTH = 80
const MAX_TRAVEL_STEPS = BOARD_HEIGHT * BOARD_WIDTH
export type Matrix<T> = List<List<T>>
export const nullMatrix = (h: number, w: number): Matrix<null> =>
  List(
    Array.from({ length: h }, () =>
      List(Array.from({ length: w }, () => null)))
  )
export const isTerrain = conforms(AnyTerrain)
const isCreature = conforms(AnyCreature)
type World = typeof WorldSchema.Type
type Key = typeof KeySchema.Type
type Entity = typeof EntitySchema.Type
type Pos = typeof PosSchema.Type
type Props = {
  username: string
  onQuit?: (() => void) | undefined
}
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
type MovementPrefix = "g" | "m"
export type BlessedKeyLike = {
  readonly full?: string
  readonly name?: string
}
export type ExtendedCommand = "quit"
type TravelRunResult =
  | { readonly _tag: "arrived"; readonly steps: number }
  | { readonly _tag: "blocked"; readonly steps: number }
  | { readonly _tag: "player-not-found"; readonly steps: number }
  | { readonly _tag: "too-far"; readonly steps: number }

const travelResultMessage = (result: TravelRunResult): string => {
  switch (result._tag) {
    case "arrived":
      return result.steps === 0
        ? "already there"
        : `arrived after ${result.steps} steps`
    case "blocked":
      return result.steps === 0
        ? "no known travel path"
        : `travel blocked after ${result.steps} steps`
    case "player-not-found":
      return "cannot travel: player not found"
    case "too-far":
      return `travel stopped after ${result.steps} steps`
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

const isBaseMovementInput = (input: string): input is BaseMovementInput =>
  Object.prototype.hasOwnProperty.call(baseMovementDirections, input)

const movementBaseInput = (
  input: string
): Option.Option<BaseMovementInput> => {
  if (isBaseMovementInput(input)) {
    return Option.some(input)
  }

  const shiftedInput = input.length === 1 ? input.toLowerCase() : ""
  if (input !== shiftedInput && isBaseMovementInput(shiftedInput)) {
    return Option.some(shiftedInput)
  }

  const controlMatch = /^C-([hjklyubn])$/u.exec(input)
  if (
    controlMatch?.[1] !== undefined && isBaseMovementInput(controlMatch[1])
  ) {
    return Option.some(controlMatch[1])
  }

  const prefixedMatch = /^(?:g|m)\+([hjklyubn])$/u.exec(input)
  if (
    prefixedMatch?.[1] !== undefined
    && isBaseMovementInput(prefixedMatch[1])
  ) {
    return Option.some(prefixedMatch[1])
  }

  return Option.none()
}

export const normalizeGameInput = (
  input: string,
  key?: BlessedKeyLike
): string => {
  const full = key?.full ?? key?.name

  if (full !== undefined) {
    const shiftedMatch = /^S-([hjklyubn])$/u.exec(full)
    if (shiftedMatch?.[1] !== undefined) {
      return shiftedMatch[1].toUpperCase()
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
  const baseInput = movementBaseInput(input)
  if (Option.isSome(baseInput)) {
    return Option.some(
      EAction.move({ dir: baseMovementDirections[baseInput.value] })
    )
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
const samePosition = (a: Pos, b: Pos): boolean =>
  a.x === b.x && a.y === b.y && a.z === b.z
const addPositions = (a: Pos, b: Pos): Pos => ({
  x: a.x + b.x,
  y: a.y + b.y,
  z: a.z + b.z
})
const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))
export const clampTravelTarget = (target: Pos): Pos => ({
  x: clamp(target.x, 0, BOARD_WIDTH - 1),
  y: clamp(target.y, 0, BOARD_HEIGHT - 1),
  z: target.z
})
const moveTravelTarget = (
  target: Pos,
  direction: MovementDirection
): Pos =>
  clampTravelTarget(addPositions(target, movementDeltas[direction]))
const travelPrompt = (target: Pos): string =>
  `Travel target ${target.x},${target.y}: hjkl/yubn move, Enter travel, Esc cancel`
const isPassableTravelTerrain = (entity: Entity): boolean =>
  entity._tag === "floor" || entity._tag === "tunnel"
const findPlayerPosition = (world: World): Option.Option<Pos> =>
  Option.fromNullable(
    Array.from(world.pipe(HashMap.values)).find((entity) =>
      entity._tag === "player"
    )?.at
  )

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

const drawWorld = (world: World, travelTarget?: Pos): Tiles => {
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
export default function BPlaying({ onQuit }: Props) {
  const [messages, setMessages] = useState<List<string>>(List())
  const gameref = useRef<BoxElement>(null)
  const pickupRef = useRef<BoxElement>(null)
  const dropRef = useRef<BoxElement>(null)
  const pendingMovementPrefix = useRef<MovementPrefix | undefined>(
    undefined
  )
  const pendingExtendedCommand = useRef<string | undefined>(undefined)
  // const [debugdump, setDebugdump] = useState<string>("aaaa")
  const [world, setWorld] = useState<World>(HashMap.empty())
  const [pickupContents, setPickupContents] = useState<World>(
    HashMap.empty()
  )
  const [inventory, setInventory] = useState<World>(HashMap.empty())
  const [travelTarget, setTravelTarget] = useState<Pos | undefined>(
    undefined
  )
  const initialWorldFetchStarted = useRef(false)
  const refreshWorldAndInventory = useMemo(
    () =>
      Effect.all({
        world: apiGetWorld,
        inventory: apiGetInventory
      }).pipe(
        Effect.tap(({ world }) => Effect.sync(() => setWorld(world))),
        Effect.tap(({ inventory }) =>
          Effect.sync(() => setInventory(inventory))
        )
      ),
    []
  )

  useEffect(() => {
    if (
      initialWorldFetchStarted.current
      || (world !== undefined && size(world) !== 0)
    ) {
      return
    }

    initialWorldFetchStarted.current = true
    void LiveRuntime.runPromise(
      apiGetWorld.pipe(
        Effect.tap((world) => Effect.sync(() => setWorld(world))),
        Effect.tap(() => Effect.sync(() => pickupRef.current?.hide())),
        Effect.tap(() => Effect.sync(() => dropRef.current?.hide()))
      )
    )
  }, [world])

  useEffect(() => {
    const gameBox = gameref.current
    gameBox?.focus()
  }, [])

  const theDrawMatrix = drawWorld(world, travelTarget)
  const log = (input: string) =>
    setMessages(prependMessage(`[debug] ${input}`))

  useEffect(() => {
    const gameBox = gameref.current
    const gameKeys = [
      "h",
      "j",
      "k",
      "l",
      "y",
      "u",
      "b",
      "n",
      "S-h",
      "S-j",
      "S-k",
      "S-l",
      "S-y",
      "S-u",
      "S-b",
      "S-n",
      "C-h",
      "C-j",
      "C-k",
      "C-l",
      "C-y",
      "C-u",
      "C-b",
      "C-n",
      "backspace",
      "linefeed",
      "g",
      "m",
      ".",
      "_",
      "d",
      ",",
      "#",
      "q",
      "i",
      "t",
      "enter",
      "return",
      "escape"
    ]
    const finishExtendedCommand = (commandInput: string) => {
      const command = parseExtendedCommand(commandInput)
      pendingExtendedCommand.current = undefined
      if (Option.isSome(command) && command.value === "quit") {
        setMessages(prependMessage("quitting"))
        onQuit?.()
      } else {
        setMessages(
          prependMessage(`unknown extended command: #${commandInput}`)
        )
      }
    }
    const handleExtendedCommandKey = (input: string) => {
      const commandInput = pendingExtendedCommand.current ?? ""
      switch (input) {
        case "escape":
          pendingExtendedCommand.current = undefined
          setMessages(prependMessage("canceled extended command"))
          return
        case "C-h":
          pendingExtendedCommand.current = commandInput.slice(0, -1)
          return
        case "enter":
        case "return":
        case "C-j":
          finishExtendedCommand(commandInput)
          return
        default:
          if (/^[a-z]$/iu.test(input)) {
            pendingExtendedCommand.current =
              `${commandInput}${input.toLowerCase()}`
            return
          }
          pendingExtendedCommand.current = undefined
          return
      }
    }
    const runTravelToTarget = (target: Pos) =>
      Effect.gen(function*() {
        let currentWorld = world
        let steps = 0

        while (steps < MAX_TRAVEL_STEPS) {
          const playerPosition = findPlayerPosition(currentWorld)
          if (Option.isNone(playerPosition)) {
            return { _tag: "player-not-found", steps } as const
          }
          if (samePosition(playerPosition.value, target)) {
            return { _tag: "arrived", steps } as const
          }

          const firstDirection = findTravelDirections(
            currentWorld,
            playerPosition.value,
            target
          )[0]
          if (firstDirection === undefined) {
            return { _tag: "blocked", steps } as const
          }

          const beforePosition = playerPosition.value
          const refreshed = yield* apiDoPlayerAction(
            EAction.move({ dir: firstDirection })
          ).pipe(Effect.andThen(refreshWorldAndInventory))
          steps += 1
          currentWorld = refreshed.world

          const afterPosition = findPlayerPosition(currentWorld)
          if (Option.isNone(afterPosition)) {
            return { _tag: "player-not-found", steps } as const
          }
          if (samePosition(beforePosition, afterPosition.value)) {
            return { _tag: "blocked", steps } as const
          }
        }

        return { _tag: "too-far", steps } as const
      })
    const handleTravelTargetKey = (input: string, target: Pos) => {
      switch (input) {
        case "escape":
          setTravelTarget(undefined)
          setMessages(prependMessage("canceled travel"))
          return
        case "enter":
        case "return":
        case "C-j": {
          const playerPosition = findPlayerPosition(world)
          setTravelTarget(undefined)
          if (Option.isNone(playerPosition)) {
            setMessages(prependMessage("cannot travel: player not found"))
            return
          }
          if (samePosition(playerPosition.value, target)) {
            setMessages(prependMessage("already there"))
            return
          }
          setMessages(prependMessage("traveling"))
          void LiveRuntime.runPromise(
            runTravelToTarget(target).pipe(
              Effect.tap((result) =>
                Effect.sync(() =>
                  setMessages(prependMessage(travelResultMessage(result)))
                )
              )
            )
          )
          return
        }
        default: {
          const travelDirection = movementBaseInput(input)
          if (Option.isSome(travelDirection)) {
            const nextTarget = moveTravelTarget(
              target,
              baseMovementDirections[travelDirection.value]
            )
            setTravelTarget(nextTarget)
            setMessages(prependMessage(travelPrompt(nextTarget)))
            return
          }
          return
        }
      }
    }
    const handleGameKey = (input: string, key?: BlessedKeyLike) => {
      const normalizedInput = normalizeGameInput(input, key)
      setMessages(prependMessage(`doing ${normalizedInput}`))

      if (pendingExtendedCommand.current !== undefined) {
        handleExtendedCommandKey(normalizedInput)
        return
      }

      if (travelTarget !== undefined) {
        handleTravelTargetKey(normalizedInput, travelTarget)
        return
      }

      if (normalizedInput === "#") {
        pendingMovementPrefix.current = undefined
        pendingExtendedCommand.current = ""
        setMessages(prependMessage("extended command: #"))
        return
      }

      if (normalizedInput === "_") {
        pendingMovementPrefix.current = undefined
        const playerPosition = findPlayerPosition(world)
        if (Option.isSome(playerPosition)) {
          const initialTarget = clampTravelTarget(playerPosition.value)
          setTravelTarget(initialTarget)
          setMessages(prependMessage(travelPrompt(initialTarget)))
        } else {
          setMessages(prependMessage("cannot travel: player not found"))
        }
        return
      }

      if (normalizedInput === ",") {
        pendingMovementPrefix.current = undefined
        setMessages(prependMessage("picking up "))
        void LiveRuntime.runPromise(
          apiGetPickupItemsFor("player").pipe(
            Effect.tap((contents) =>
              Effect.sync(() => setPickupContents(contents))
            )
          )
        )
        pickupRef.current?.show()
        pickupRef.current?.focus()
      } else if (normalizedInput === "d") {
        pendingMovementPrefix.current = undefined
        setMessages(prependMessage("dropping"))
        dropRef.current?.show()
        dropRef.current?.focus()
      } else {
        let actionInput = normalizedInput
        const movementPrefix = pendingMovementPrefix.current
        if (movementPrefix !== undefined) {
          pendingMovementPrefix.current = undefined
          if (isBaseMovementInput(normalizedInput)) {
            actionInput = `${movementPrefix}+${normalizedInput}`
          }
        } else if (normalizedInput === "g" || normalizedInput === "m") {
          pendingMovementPrefix.current = normalizedInput
          return
        }

        const action = parseInput(actionInput)
        if (Option.isNone(action)) {
          return
        }
        void LiveRuntime.runPromise(
          apiDoPlayerAction(action.value).pipe(
            Effect.andThen(refreshWorldAndInventory)
          )
        )
      }
    }

    gameBox?.key(gameKeys, handleGameKey)

    return () => {
      for (const key of gameKeys) {
        gameBox?.removeListener(`key ${key}`, handleGameKey)
      }
    }
  }, [onQuit, refreshWorldAndInventory, travelTarget, world])

  const onDoPickup = (pickupItems: ReadonlyArray<Key>) => {
    void LiveRuntime.runPromise(
      apiDoPlayerAction(EAction.pickupMulti({ keys: pickupItems })).pipe(
        Effect.andThen(refreshWorldAndInventory),
        Effect.tap(() => Effect.sync(() => pickupRef.current?.hide())),
        Effect.tap(() => Effect.sync(() => gameref.current?.focus()))
      )
    )
  }
  const onDoDrop = (dropItems: ReadonlyArray<Key>) => {
    void LiveRuntime.runPromise(
      apiDoPlayerAction(EAction.dropMulti({ keys: dropItems })).pipe(
        Effect.andThen(refreshWorldAndInventory),
        Effect.tap(() => Effect.sync(() => dropRef.current?.hide())),
        Effect.tap(() => Effect.sync(() => gameref.current?.focus()))
      )
    )
  }
  const onCancelMultiDrop = () => {
    setMessages(prependMessage(`canceling multidrop`))
    dropRef.current?.hide()
    gameref.current?.focus()
  }
  const onCancelPickup = () => {
    setMessages(prependMessage(`canceling pickup`))
    pickupRef.current?.hide()
    gameref.current?.focus()
  }

  return (
    <box
      ref={gameref}
      width="100%"
      height="100%"
    >
      <Messages messages={messages} />
      <BGameBoard tiles={theDrawMatrix} />
      <PickupPopup
        pickupRef={pickupRef}
        items={pickupContents}
        onSubmit={onDoPickup}
        onCancel={onCancelPickup}
        log={log}
      />
      <MultiDropPopup
        dropRef={dropRef}
        world={world}
        onDrop={onDoDrop}
        onCancel={onCancelMultiDrop}
      />
      <Inventory inventory={inventory} />
    </box>
  )
}
