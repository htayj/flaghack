import { type Action, EAction } from "@flaghack/domain/schemas"
import { Effect, HashMap, Option } from "effect"
import { size } from "effect/HashMap"
import { List } from "immutable"
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react"
import type { BoxElement } from "react-blessed"
import { GameClient } from "../GameClient.js"
import { LiveRuntime } from "../runtime.js"
import {
  type BlessedKeyLike,
  clampTravelTarget,
  directionActionPrompt,
  type DirectionalActionKind,
  directionalMovementResultMessage,
  drawWorld,
  filterDrinkItems,
  filterFoodItems,
  findPlayerPosition,
  findTravelDirections,
  isBaseMovementInput,
  type Key,
  MAX_TRAVEL_STEPS,
  movementCommandRequiresRepeatedMovement,
  type MovementPrefix,
  moveTravelTarget,
  normalizeGameInput,
  parseDirectionalActionInput,
  parseExtendedCommand,
  parseInput,
  parseMovementCommand,
  type Pos,
  prependMessage,
  quitWarningPrompt,
  runDirectionalMovement,
  samePosition,
  travelPrompt,
  travelResultMessage,
  type World
} from "../tuiGame.js"
import BGameBoard from "./BGameBoard.js"
import Inventory from "./Inventory.js"
import LootPopup from "./LootPopup.js"
import Messages from "./Messages.js"
import MultiDropPopup from "./MultiDropPopup.js"
import PickupPopup from "./PickupPopup.js"
import Popup from "./popup.js"
import Status from "./Status.js"

const apiDoPlayerAction = GameClient.doPlayerAction
const apiGetInventory = GameClient.getInventory
const apiGetLootContainersFor = GameClient.getLootContainersFor
const apiGetLootItemsFor = GameClient.getLootItemsFor
const apiGetPickupItemsFor = GameClient.getPickupItemsFor
const apiGetWorld = GameClient.getWorld
const apiQuitGame = GameClient.quitGame
const apiSaveGame = GameClient.saveGame

export {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  clampTravelTarget,
  directionActionPrompt,
  directionalMovementResultMessage,
  drawWorld,
  filterDrinkItems,
  filterFoodItems,
  findPlayerPosition,
  findTravelDirections,
  findTravelDirections as findTravelPathDirections,
  formatStatusLines,
  isBaseMovementInput,
  isTerrain,
  MAX_DIRECTIONAL_MOVEMENT_STEPS,
  MAX_TRAVEL_STEPS,
  movementCommandRequiresRepeatedMovement,
  moveTravelTarget,
  normalizeGameInput,
  nullMatrix,
  parseDirectionalActionInput,
  parseExtendedCommand,
  parseInput,
  parseMovementCommand,
  prependMessage,
  quitWarningPrompt,
  runDirectionalMovement,
  samePosition,
  shouldStopDirectionalRun,
  travelPrompt,
  travelResultMessage
} from "../tuiGame.js"
export type {
  BlessedKeyLike,
  DirectionalActionKind,
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
  debugMessages?: boolean | undefined
  onQuit?: (() => void) | undefined
}

export default function BPlaying(
  { debugMessages = false, onQuit }: Props
) {
  const [messages, setMessages] = useState<List<string>>(List())
  const gameref = useRef<BoxElement>(null)
  const pickupRef = useRef<BoxElement>(null)
  const dropRef = useRef<BoxElement>(null)
  const lootRef = useRef<BoxElement>(null)
  const eatRef = useRef<BoxElement>(null)
  const quaffRef = useRef<BoxElement>(null)
  const pendingMovementPrefix = useRef<MovementPrefix | undefined>(
    undefined
  )
  const pendingDirectionalAction = useRef<
    DirectionalActionKind | undefined
  >(undefined)
  const pendingExtendedCommand = useRef<string | undefined>(undefined)
  const pendingQuitConfirmation = useRef(false)
  const pendingTerminalAction = useRef(false)
  const activeAutoMoveId = useRef<number | undefined>(undefined)
  const nextAutoMoveId = useRef(0)
  const pickupRequestId = useRef(0)
  const lootRequestId = useRef(0)
  // const [debugdump, setDebugdump] = useState<string>("aaaa")
  const [world, setWorld] = useState<World>(HashMap.empty())
  const [pickupContents, setPickupContents] = useState<World>(
    HashMap.empty()
  )
  const [lootContents, setLootContents] = useState<World>(HashMap.empty())
  const [lootContainerKey, setLootContainerKey] = useState<
    Key | undefined
  >(
    undefined
  )
  const [lootContainerName, setLootContainerName] = useState("container")
  const [lootPromptSerial, setLootPromptSerial] = useState(0)
  const [inventory, setInventory] = useState<World>(HashMap.empty())
  const [travelTarget, setTravelTarget] = useState<Pos | undefined>(
    undefined
  )
  const initialWorldFetchStarted = useRef(false)
  const refreshWorldAndInventory = useMemo(
    () =>
      Effect.suspend(() =>
        pendingTerminalAction.current
          ? Effect.succeed({
            inventory: HashMap.empty(),
            world: HashMap.empty()
          })
          : Effect.all({
            world: apiGetWorld,
            inventory: apiGetInventory
          }).pipe(
            Effect.tap(({ inventory, world }) =>
              Effect.sync(() => {
                if (pendingTerminalAction.current) return
                setWorld(world)
                setInventory(inventory)
              })
            )
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
      refreshWorldAndInventory.pipe(
        Effect.tap(() => Effect.sync(() => pickupRef.current?.hide())),
        Effect.tap(() => Effect.sync(() => dropRef.current?.hide())),
        Effect.tap(() => Effect.sync(() => lootRef.current?.hide())),
        Effect.tap(() => Effect.sync(() => eatRef.current?.hide())),
        Effect.tap(() => Effect.sync(() => quaffRef.current?.hide()))
      )
    )
  }, [refreshWorldAndInventory, world])

  useEffect(() => {
    const gameBox = gameref.current
    gameBox?.focus()
  }, [])

  const runPlayerAction = useCallback(
    (action: Action) => {
      if (pendingTerminalAction.current) return
      void LiveRuntime.runPromise(
        apiDoPlayerAction(action).pipe(
          Effect.andThen(refreshWorldAndInventory)
        )
      )
    },
    [refreshWorldAndInventory]
  )

  const theDrawMatrix = drawWorld(world, travelTarget)
  const addDebugMessage = (message: string) => {
    if (debugMessages) {
      setMessages(prependMessage(message))
    }
  }
  const log = (input: string) => addDebugMessage(`[debug] ${input}`)

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
      "C-s",
      "C-q",
      "M-l",
      "backspace",
      "linefeed",
      "g",
      "m",
      ".",
      "_",
      "c",
      "d",
      "e",
      ",",
      "#",
      "S-3",
      "o",
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
      pendingDirectionalAction.current = undefined
      pendingMovementPrefix.current = undefined
      pendingQuitConfirmation.current = false
      setMessages(prependMessage("automove canceled"))
      gameref.current?.focus()
      return true
    }
    const saveAndExit = () => {
      pendingDirectionalAction.current = undefined
      pendingExtendedCommand.current = undefined
      pendingMovementPrefix.current = undefined
      pendingQuitConfirmation.current = false
      pendingTerminalAction.current = true
      activeAutoMoveId.current = undefined
      setMessages(prependMessage("saving"))
      void LiveRuntime.runPromise(
        apiSaveGame.pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              setMessages(prependMessage("saved"))
              onQuit?.()
            })
          ),
          Effect.catchAllCause((cause) =>
            Effect.sync(() => {
              pendingTerminalAction.current = false
              setMessages(prependMessage(`save failed: ${String(cause)}`))
            })
          )
        )
      )
    }
    const beginQuitConfirmation = () => {
      pendingDirectionalAction.current = undefined
      pendingExtendedCommand.current = undefined
      pendingMovementPrefix.current = undefined
      pendingQuitConfirmation.current = true
      setMessages(prependMessage(quitWarningPrompt))
    }
    const finishExtendedCommand = (commandInput: string) => {
      const command = parseExtendedCommand(commandInput)
      pendingExtendedCommand.current = undefined
      if (Option.isSome(command) && command.value === "save") {
        saveAndExit()
      } else if (Option.isSome(command) && command.value === "quit") {
        beginQuitConfirmation()
      } else {
        setMessages(
          prependMessage(`unknown extended command: #${commandInput}`)
        )
      }
    }
    const handleDirectionalActionKey = (
      kind: DirectionalActionKind,
      input: string
    ) => {
      if (input === "escape") {
        pendingDirectionalAction.current = undefined
        setMessages(prependMessage(`canceled ${kind}`))
        return
      }

      const action = parseDirectionalActionInput(kind, input)
      if (Option.isNone(action)) {
        pendingDirectionalAction.current = undefined
        setMessages(prependMessage(`canceled ${kind}`))
        return
      }

      pendingDirectionalAction.current = undefined
      runPlayerAction(action.value)
    }
    const handleQuitConfirmationKey = (input: string) => {
      switch (input.toLowerCase()) {
        case "y":
          pendingQuitConfirmation.current = false
          pendingTerminalAction.current = true
          activeAutoMoveId.current = undefined
          setMessages(prependMessage("quitting"))
          void LiveRuntime.runPromise(
            apiQuitGame.pipe(
              Effect.tap(() => Effect.sync(() => onQuit?.())),
              Effect.catchAllCause((cause) =>
                Effect.sync(() => {
                  pendingTerminalAction.current = false
                  setMessages(
                    prependMessage(`quit failed: ${String(cause)}`)
                  )
                })
              )
            )
          )
          return
        case "n":
        case "escape":
          pendingQuitConfirmation.current = false
          setMessages(prependMessage("quit canceled"))
          return
        default:
          setMessages(prependMessage(quitWarningPrompt))
          return
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
              travelMovementCommand.value.dir,
              world
            )
            setTravelTarget(nextTarget)
            setMessages(prependMessage(travelPrompt(nextTarget)))
            return
          }
          return
        }
      }
    }
    const beginLoot = () => {
      pendingMovementPrefix.current = undefined
      lootRequestId.current += 1
      const requestId = lootRequestId.current
      setLootContents(HashMap.empty())
      setLootContainerKey(undefined)
      setLootContainerName("container")
      pickupRef.current?.hide()
      dropRef.current?.hide()
      eatRef.current?.hide()
      quaffRef.current?.hide()
      void LiveRuntime.runPromise(
        apiGetLootContainersFor("player").pipe(
          Effect.flatMap((containers) => {
            const container = Array.from(HashMap.values(containers)).sort(
              (left, right) => left.key.localeCompare(right.key)
            )[0]
            if (container === undefined) {
              return Effect.sync(() => {
                if (
                  pendingTerminalAction.current
                  || lootRequestId.current !== requestId
                ) return
                setMessages(prependMessage("no floor container here"))
              })
            }
            return apiGetLootItemsFor("player", container.key).pipe(
              Effect.tap((contents) =>
                Effect.sync(() => {
                  if (
                    pendingTerminalAction.current
                    || lootRequestId.current !== requestId
                  ) return
                  setLootContainerKey(container.key)
                  setLootContainerName(container._tag)
                  setLootContents(contents)
                  setLootPromptSerial((serial) => serial + 1)
                  setMessages(prependMessage(`looting ${container._tag}`))
                  lootRef.current?.show()
                  lootRef.current?.focus()
                })
              )
            )
          })
        )
      )
    }
    const handleGameKey = (input: string, key?: BlessedKeyLike) => {
      const normalizedInput = normalizeGameInput(input, key)
      if (pendingTerminalAction.current) return
      if (cancelActiveAutoMove()) return

      if (normalizedInput !== "M-l") {
        lootRequestId.current += 1
      }

      addDebugMessage(`doing ${normalizedInput}`)

      if (pendingQuitConfirmation.current) {
        handleQuitConfirmationKey(normalizedInput)
        return
      }

      if (pendingDirectionalAction.current !== undefined) {
        handleDirectionalActionKey(
          pendingDirectionalAction.current,
          normalizedInput
        )
        return
      }

      if (pendingExtendedCommand.current !== undefined) {
        handleExtendedCommandKey(normalizedInput)
        return
      }

      if (travelTarget !== undefined) {
        handleTravelTargetKey(normalizedInput, travelTarget)
        return
      }

      if (normalizedInput === "C-s") {
        saveAndExit()
        return
      }

      if (normalizedInput === "C-q") {
        beginQuitConfirmation()
        return
      }

      if (normalizedInput === "#") {
        pendingDirectionalAction.current = undefined
        pendingMovementPrefix.current = undefined
        pendingExtendedCommand.current = ""
        setMessages(prependMessage("extended command: #"))
        return
      }

      if (normalizedInput === "o" || normalizedInput === "c") {
        const kind = normalizedInput === "o" ? "open" : "close"
        pendingDirectionalAction.current = kind
        pendingMovementPrefix.current = undefined
        setMessages(prependMessage(directionActionPrompt(kind)))
        return
      }

      if (normalizedInput === "_") {
        pendingDirectionalAction.current = undefined
        pendingMovementPrefix.current = undefined
        const playerPosition = findPlayerPosition(world)
        if (Option.isSome(playerPosition)) {
          const initialTarget = clampTravelTarget(
            playerPosition.value,
            world
          )
          setTravelTarget(initialTarget)
          setMessages(prependMessage(travelPrompt(initialTarget)))
        } else {
          setMessages(prependMessage("cannot travel: player not found"))
        }
        return
      }

      if (normalizedInput === "M-l") {
        beginLoot()
      } else if (normalizedInput === ",") {
        pendingMovementPrefix.current = undefined
        lootRef.current?.hide()
        dropRef.current?.hide()
        eatRef.current?.hide()
        quaffRef.current?.hide()
        pickupRequestId.current += 1
        const requestId = pickupRequestId.current
        setPickupContents(HashMap.empty())
        setMessages(prependMessage("picking up "))
        void LiveRuntime.runPromise(
          apiGetPickupItemsFor("player").pipe(
            Effect.tap((contents) =>
              Effect.sync(() => {
                if (
                  pendingTerminalAction.current
                  || pickupRequestId.current !== requestId
                ) return
                setPickupContents(contents)
              })
            )
          )
        )
        pickupRef.current?.show()
        pickupRef.current?.focus()
      } else if (normalizedInput === "d") {
        pendingMovementPrefix.current = undefined
        pickupRef.current?.hide()
        lootRef.current?.hide()
        eatRef.current?.hide()
        quaffRef.current?.hide()
        setMessages(prependMessage("dropping"))
        dropRef.current?.show()
        dropRef.current?.focus()
      } else if (normalizedInput === "e") {
        pendingMovementPrefix.current = undefined
        pickupRef.current?.hide()
        dropRef.current?.hide()
        lootRef.current?.hide()
        quaffRef.current?.hide()
        setMessages(prependMessage("eating"))
        eatRef.current?.show()
        eatRef.current?.focus()
      } else if (normalizedInput === "q") {
        pendingMovementPrefix.current = undefined
        pickupRef.current?.hide()
        dropRef.current?.hide()
        lootRef.current?.hide()
        eatRef.current?.hide()
        setMessages(prependMessage("quaffing"))
        quaffRef.current?.show()
        quaffRef.current?.focus()
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
        runPlayerAction(action.value)
      }
    }

    gameBox?.key(gameKeys, handleGameKey)

    return () => {
      for (const key of gameKeys) {
        gameBox?.removeListener(`key ${key}`, handleGameKey)
      }
    }
  }, [
    debugMessages,
    onQuit,
    refreshWorldAndInventory,
    runPlayerAction,
    travelTarget,
    world
  ])

  const onDoPickup = (pickupItems: ReadonlyArray<Key>) => {
    if (pendingTerminalAction.current) return
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
    if (pendingTerminalAction.current) return
    void LiveRuntime.runPromise(
      apiDoPlayerAction(EAction.dropMulti({ keys: dropItems })).pipe(
        Effect.andThen(refreshWorldAndInventory),
        Effect.tap(() => Effect.sync(() => dropRef.current?.hide())),
        Effect.tap(() => Effect.sync(() => gameref.current?.focus()))
      )
    )
  }
  const onDoEat = (eatItems: ReadonlyArray<Key>) => {
    if (pendingTerminalAction.current) return
    void LiveRuntime.runPromise(
      apiDoPlayerAction(EAction.eatMulti({ keys: eatItems })).pipe(
        Effect.andThen(refreshWorldAndInventory),
        Effect.tap(() => Effect.sync(() => eatRef.current?.hide())),
        Effect.tap(() => Effect.sync(() => gameref.current?.focus()))
      )
    )
  }
  const onDoQuaff = (quaffItems: ReadonlyArray<Key>) => {
    if (pendingTerminalAction.current) return
    void LiveRuntime.runPromise(
      apiDoPlayerAction(EAction.quaffMulti({ keys: quaffItems })).pipe(
        Effect.andThen(refreshWorldAndInventory),
        Effect.tap(() => Effect.sync(() => quaffRef.current?.hide())),
        Effect.tap(() => Effect.sync(() => gameref.current?.focus()))
      )
    )
  }
  const onTakeLoot = (lootItems: ReadonlyArray<Key>) => {
    if (pendingTerminalAction.current) return
    const containerKey = lootContainerKey
    if (containerKey === undefined) return
    lootRequestId.current += 1
    void LiveRuntime.runPromise(
      apiDoPlayerAction(
        EAction.lootTakeMulti({ containerKey, keys: lootItems })
      ).pipe(
        Effect.andThen(refreshWorldAndInventory),
        Effect.tap(() => Effect.sync(() => lootRef.current?.hide())),
        Effect.tap(() => Effect.sync(() => gameref.current?.focus()))
      )
    )
  }
  const onPutLoot = (lootItems: ReadonlyArray<Key>) => {
    if (pendingTerminalAction.current) return
    const containerKey = lootContainerKey
    if (containerKey === undefined) return
    lootRequestId.current += 1
    void LiveRuntime.runPromise(
      apiDoPlayerAction(
        EAction.lootPutMulti({ containerKey, keys: lootItems })
      ).pipe(
        Effect.andThen(refreshWorldAndInventory),
        Effect.tap(() => Effect.sync(() => lootRef.current?.hide())),
        Effect.tap(() => Effect.sync(() => gameref.current?.focus()))
      )
    )
  }
  const onCancelMultiDrop = () => {
    setMessages(prependMessage(`canceling multidrop`))
    dropRef.current?.hide()
    gameref.current?.focus()
  }
  const onCancelEat = () => {
    setMessages(prependMessage(`canceling eating`))
    eatRef.current?.hide()
    gameref.current?.focus()
  }
  const onCancelQuaff = () => {
    setMessages(prependMessage(`canceling quaffing`))
    quaffRef.current?.hide()
    gameref.current?.focus()
  }
  const onCancelPickup = () => {
    pickupRequestId.current += 1
    setMessages(prependMessage(`canceling pickup`))
    pickupRef.current?.hide()
    gameref.current?.focus()
  }
  const onCancelLoot = () => {
    lootRequestId.current += 1
    setMessages(prependMessage(`canceling loot`))
    lootRef.current?.hide()
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
      <Status world={world} />
      <Inventory inventory={inventory} />
      <PickupPopup
        pickupRef={pickupRef}
        items={pickupContents}
        onSubmit={onDoPickup}
        onCancel={onCancelPickup}
        log={log}
      />
      <LootPopup
        key={lootPromptSerial}
        lootRef={lootRef}
        containerName={lootContainerName}
        takeItems={lootContents}
        putItems={inventory}
        promptSerial={lootPromptSerial}
        onTake={onTakeLoot}
        onPut={onPutLoot}
        onCancel={onCancelLoot}
      />
      <MultiDropPopup
        dropRef={dropRef}
        world={world}
        onDrop={onDoDrop}
        onCancel={onCancelMultiDrop}
      />
      <Popup
        boxRef={eatRef}
        items={filterFoodItems(inventory)}
        onSubmit={onDoEat}
        onCancel={onCancelEat}
        label="Eat what?"
      />
      <Popup
        boxRef={quaffRef}
        items={filterDrinkItems(inventory)}
        onSubmit={onDoQuaff}
        onCancel={onCancelQuaff}
        label="Quaff what?"
      />
    </box>
  )
}
