import { EAction } from "@flaghack/domain/schemas"
import { Effect, HashMap, Option } from "effect"
import { size } from "effect/HashMap"
import { List } from "immutable"
import React, { useEffect, useMemo, useRef, useState } from "react"
import type { BoxElement } from "react-blessed"
import { GameClient } from "../GameClient.js"
import { LiveRuntime } from "../runtime.js"
import {
  type BlessedKeyLike,
  clampTravelTarget,
  directionalMovementResultMessage,
  drawWorld,
  findPlayerPosition,
  findTravelDirections,
  isBaseMovementInput,
  type Key,
  MAX_TRAVEL_STEPS,
  movementCommandRequiresRepeatedMovement,
  type MovementPrefix,
  moveTravelTarget,
  normalizeGameInput,
  parseExtendedCommand,
  parseInput,
  parseMovementCommand,
  type Pos,
  prependMessage,
  runDirectionalMovement,
  samePosition,
  travelPrompt,
  travelResultMessage,
  type World
} from "../tuiGame.js"
import BGameBoard from "./BGameBoard.js"
import Inventory from "./Inventory.js"
import Messages from "./Messages.js"
import MultiDropPopup from "./MultiDropPopup.js"
import PickupPopup from "./PickupPopup.js"

const apiDoPlayerAction = GameClient.doPlayerAction
const apiGetInventory = GameClient.getInventory
const apiGetPickupItemsFor = GameClient.getPickupItemsFor
const apiGetWorld = GameClient.getWorld

export {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  clampTravelTarget,
  directionalMovementResultMessage,
  drawWorld,
  findPlayerPosition,
  findTravelDirections,
  findTravelDirections as findTravelPathDirections,
  isBaseMovementInput,
  isTerrain,
  MAX_DIRECTIONAL_MOVEMENT_STEPS,
  MAX_TRAVEL_STEPS,
  movementCommandRequiresRepeatedMovement,
  moveTravelTarget,
  normalizeGameInput,
  nullMatrix,
  parseExtendedCommand,
  parseInput,
  parseMovementCommand,
  prependMessage,
  runDirectionalMovement,
  samePosition,
  shouldStopDirectionalRun,
  travelPrompt,
  travelResultMessage
} from "../tuiGame.js"
export type {
  BlessedKeyLike,
  DirectionalMovementRunResult,
  Entity,
  ExtendedCommand,
  Key,
  Matrix,
  MovementCommand,
  MovementDirection,
  MovementPrefix,
  Pos,
  RepeatedMovementCommand,
  World
} from "../tuiGame.js"

type Props = {
  username: string
  onQuit?: (() => void) | undefined
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
  const activeAutoMoveId = useRef<number | undefined>(undefined)
  const nextAutoMoveId = useRef(0)
  const pickupRequestId = useRef(0)
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
      "S-g",
      "S-m",
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
      "S-3",
      "q",
      "i",
      "t",
      "enter",
      "return",
      "escape"
    ]
    const beginAutoMove = (): number => {
      nextAutoMoveId.current += 1
      activeAutoMoveId.current = nextAutoMoveId.current
      return nextAutoMoveId.current
    }
    const isAutoMoveCancelled = (autoMoveId: number): boolean =>
      activeAutoMoveId.current !== autoMoveId
    const finishAutoMove = (autoMoveId: number) => {
      if (activeAutoMoveId.current === autoMoveId) {
        activeAutoMoveId.current = undefined
      }
    }
    const cancelActiveAutoMove = (): boolean => {
      if (activeAutoMoveId.current === undefined) return false

      activeAutoMoveId.current = undefined
      pendingMovementPrefix.current = undefined
      setMessages(prependMessage("automove canceled"))
      gameref.current?.focus()
      return true
    }
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
    const runTravelToTarget = (target: Pos, autoMoveId: number) =>
      Effect.gen(function*() {
        let currentWorld = world
        let steps = 0

        while (steps < MAX_TRAVEL_STEPS) {
          if (isAutoMoveCancelled(autoMoveId)) {
            return { _tag: "cancelled", steps } as const
          }

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

          if (isAutoMoveCancelled(autoMoveId)) {
            return { _tag: "cancelled", steps } as const
          }

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
          const autoMoveId = beginAutoMove()
          setMessages(prependMessage("traveling"))
          void LiveRuntime.runPromise(
            runTravelToTarget(target, autoMoveId).pipe(
              Effect.tap((result) =>
                Effect.sync(() => {
                  if (isAutoMoveCancelled(autoMoveId)) return
                  setMessages(prependMessage(travelResultMessage(result)))
                })
              ),
              Effect.ensuring(
                Effect.sync(() => finishAutoMove(autoMoveId))
              )
            )
          )
          return
        }
        default: {
          const travelMovementCommand = parseMovementCommand(input)
          if (Option.isSome(travelMovementCommand)) {
            const nextTarget = moveTravelTarget(
              target,
              travelMovementCommand.value.dir
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
      if (cancelActiveAutoMove()) return

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
        pickupRequestId.current += 1
        const requestId = pickupRequestId.current
        setPickupContents(HashMap.empty())
        setMessages(prependMessage("picking up "))
        void LiveRuntime.runPromise(
          apiGetPickupItemsFor("player").pipe(
            Effect.tap((contents) =>
              Effect.sync(() => {
                if (pickupRequestId.current !== requestId) return
                setPickupContents(contents)
              })
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
        } else if (
          normalizedInput === "g"
          || normalizedInput === "G"
          || normalizedInput === "m"
          || normalizedInput === "M"
        ) {
          pendingMovementPrefix.current = normalizedInput
          return
        }

        const movementCommand = parseMovementCommand(actionInput)
        if (
          Option.isSome(movementCommand)
          && movementCommandRequiresRepeatedMovement(movementCommand.value)
        ) {
          const repeatedCommand = movementCommand.value
          const autoMoveId = beginAutoMove()
          void LiveRuntime.runPromise(
            runDirectionalMovement({
              world,
              command: repeatedCommand,
              isCancelled: () => isAutoMoveCancelled(autoMoveId),
              moveAndRefresh: (direction) =>
                apiDoPlayerAction(EAction.move({ dir: direction })).pipe(
                  Effect.andThen(refreshWorldAndInventory)
                )
            }).pipe(
              Effect.tap((result) =>
                Effect.sync(() => {
                  if (isAutoMoveCancelled(autoMoveId)) return
                  setMessages(
                    prependMessage(
                      directionalMovementResultMessage(
                        repeatedCommand,
                        result
                      )
                    )
                  )
                  gameref.current?.focus()
                })
              ),
              Effect.ensuring(
                Effect.sync(() => finishAutoMove(autoMoveId))
              )
            )
          )
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
    pickupRequestId.current += 1
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
    pickupRequestId.current += 1
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
