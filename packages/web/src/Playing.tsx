import { getTile } from "@flaghack/domain/display"
import type { Tile } from "@flaghack/domain/display"
import {
  AnyCreature,
  AnyItem,
  AnyTerrain,
  conforms,
  EAction
} from "@flaghack/domain/schemas"
import type {
  Action,
  Entity as EntitySchema,
  Key as KeySchema,
  Pos as PosSchema,
  World as WorldSchema
} from "@flaghack/domain/schemas"
// import blessed from "blessed"
import { Effect, HashMap, Option } from "effect"
import { size } from "effect/HashMap"
import { List, Map } from "immutable"
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState
} from "react"
import type { Tiles } from "./GameBoard.tsx"
import GameBoard from "./GameBoard.tsx"
import {
  doPlayerAction,
  getInventory,
  getPickupItemsFor,
  getWorld,
  LiveRuntime,
  quitGame,
  saveGame
} from "./GameClient.js"
import Inventory from "./Inventory.tsx"
import Messages, { MAX_VISIBLE_MESSAGES } from "./Messages.tsx"
import PickupPopup from "./PickupPopup.tsx"

const BOARD_HEIGHT = 20
const BOARD_WIDTH = 80

export type Matrix<T> = List<List<T>>
export const nullMatrix = (h: number, w: number): Matrix<null> =>
  List(
    Array.from({ length: h }, () =>
      List(Array.from({ length: w }, () => null)))
  )
type World = typeof WorldSchema.Type
type Key = typeof KeySchema.Type
type Entity = typeof EntitySchema.Type
type Pos = typeof PosSchema.Type
type Props = {
  username: string
}
type Direction = "N" | "E" | "S" | "W" | "NE" | "NW" | "SE" | "SW"
type DirectionalActionKind = "open" | "close"
type ExtendedCommand = "quit" | "save"
const quitWarningPrompt =
  "Really quit? This permanently ends the game; save exits without quitting. [yn]"
const getTileOrDefault = (e: Entity | undefined): Tile =>
  e === undefined ? { color: "black", char: " " } : getTile(e)

const directionForInput = (input: string): Direction | undefined => {
  switch (input) {
    case "j":
      return "S"
    case "h":
      return "W"
    case "k":
      return "N"
    case "l":
      return "E"
    case "y":
      return "NW"
    case "u":
      return "NE"
    case "b":
      return "SW"
    case "n":
      return "SE"
    default:
      return undefined
  }
}

export const parseInput = (input: string): Option.Option<Action> => {
  const dir = directionForInput(input)
  return dir === undefined
    ? Option.none()
    : Option.some(EAction.move({ dir }))
}

export const parseDirectionalActionInput = (
  kind: DirectionalActionKind,
  input: string
): Option.Option<Action> => {
  const dir = directionForInput(input)
  if (dir === undefined) return Option.none()

  return Option.some(
    kind === "open" ? EAction.open({ dir }) : EAction.close({ dir })
  )
}

export const parseExtendedCommand = (
  input: string
): Option.Option<ExtendedCommand> => {
  switch (input.trim().replace(/^#/u, "").toLowerCase()) {
    case "quit":
      return Option.some("quit")
    case "save":
      return Option.some("save")
    default:
      return Option.none()
  }
}

const directionActionPrompt = (kind: DirectionalActionKind): string =>
  `${kind === "open" ? "Open" : "Close"} direction: hjkl/yubn, Esc cancel`

const getPosition = (e: Entity): Pos | undefined =>
  e.in === "world" ? e.at : undefined

const posKey = (p: Omit<Pos, "z">): string => `${p.x},${p.y}`

const clamp = (value: number, low: number, high: number): number =>
  Math.min(Math.max(value, low), high)

type Viewport = {
  readonly left: number
  readonly top: number
  readonly z: number
  readonly hasZ: boolean
}

const findViewportPlayer = (world: World): Entity | undefined =>
  Map(world).valueSeq().find((entity) =>
    entity._tag === "player" && entity.in === "world"
  )

const viewportForWorld = (world: World): Viewport => {
  const player = findViewportPlayer(world)
  if (player === undefined) return { hasZ: false, left: 0, top: 0, z: 0 }

  const worldEntities = Map(world).valueSeq().toArray()
  const sameLevelEntities = worldEntities.filter((entity) =>
    entity.in === "world" && entity.at.z === player.at.z
  )
  const maxX = Math.max(
    player.at.x,
    ...sameLevelEntities.map((entity) => entity.at.x)
  )
  const maxY = Math.max(
    player.at.y,
    ...sameLevelEntities.map((entity) => entity.at.y)
  )

  return {
    hasZ: true,
    left: clamp(
      player.at.x - Math.floor(BOARD_WIDTH / 2),
      0,
      Math.max(0, maxX - BOARD_WIDTH + 1)
    ),
    top: clamp(
      player.at.y - Math.floor(BOARD_HEIGHT / 2),
      0,
      Math.max(0, maxY - BOARD_HEIGHT + 1)
    ),
    z: player.at.z
  }
}

const screenPosition = (position: Pos, viewport: Viewport): Pos => ({
  x: position.x - viewport.left,
  y: position.y - viewport.top,
  z: position.z
})

const isVisibleScreenPosition = (position: Pos): boolean =>
  position.x >= 0
  && position.x < BOARD_WIDTH
  && position.y >= 0
  && position.y < BOARD_HEIGHT
const isTerrain = conforms(AnyTerrain)
const isCreature = conforms(AnyCreature)
const isItem = conforms(AnyItem)
const zindex = (entity: Entity): number => {
  switch (entity._tag) {
    case "tent":
      return -1
    case "floor":
    case "tunnel":
      return 0
    case "wall":
    case "door":
    case "tent-wall":
    case "tent-post":
    case "sign":
    case "effigy":
    case "temple":
      return 2
    default:
      if (isItem(entity)) return 3
      if (isCreature(entity)) return 4
      return isTerrain(entity) ? 0 : 3
  }
}
export const drawWorld = (world: World): Tiles => {
  const emptyMatrix = nullMatrix(BOARD_HEIGHT, BOARD_WIDTH)
  const viewport = viewportForWorld(world)

  const worldMap = Map(world)
    .valueSeq()
    .filter((entity) =>
      entity.in === "world"
      && (!viewport.hasZ || entity.at.z === viewport.z)
    )
    .map((entity) =>
      ({
        ...entity,
        at: screenPosition(entity.at, viewport)
      }) as Entity
    )
    .filter((entity) => isVisibleScreenPosition(entity.at))
    .groupBy((entity) => {
      const position = getPosition(entity)
      return position === undefined ? undefined : posKey(position)
    })
    .map((v) => v.valueSeq().toArray())
  const fullmap = emptyMatrix.map((row, y) =>
    row
      .map((_, x) => worldMap.get(posKey({ x, y })))
      .map(List)
      .map((l) => l.sortBy(zindex).reverse().first())
      .map(getTileOrDefault)
  )
  return fullmap.map((r) => r.toArray()).toArray()
}

export const prependMessage =
  (message: string) => (messages: List<string>): List<string> =>
    messages.unshift(message).take(MAX_VISIBLE_MESSAGES)

export default function BPlaying(_props: Props) {
  const [messages, setMessages] = useState<List<string>>(List())
  const gameref = useRef<HTMLDivElement>(null)
  const initialWorldFetchRequestedRef = useRef(false)
  // const [debugdump, setDebugdump] = useState<string>("aaaa")
  const [world, setWorld] = useState<World>(HashMap.empty())
  const [pickupContents, setPickupContents] = useState<World>(
    HashMap.empty()
  )
  const [showPickup, setShowPickup] = useState<boolean>(false)
  const [inventory, setInventory] = useState<World>(HashMap.empty())
  const [pendingDirectionalAction, setPendingDirectionalAction] = useState<
    DirectionalActionKind | undefined
  >(undefined)
  const [pendingExtendedCommand, setPendingExtendedCommand] = useState<
    string | undefined
  >(undefined)
  const [pendingQuitConfirmation, setPendingQuitConfirmation] = useState(
    false
  )
  const [terminalState, setTerminalState] = useState<
    "quit" | "saved" | undefined
  >(undefined)
  const terminalPendingRef = useRef(false)
  const refreshWorldAndInventory = Effect.suspend(() =>
    terminalPendingRef.current
      ? Effect.void
      : Effect.all({
        world: getWorld,
        inventory: getInventory
      }).pipe(
        Effect.tap(({ inventory, world }) =>
          Effect.sync(() => {
            if (terminalPendingRef.current) return
            setWorld(world)
            setInventory(inventory)
          })
        )
      )
  )

  useEffect(() => {
    if (initialWorldFetchRequestedRef.current) {
      return
    }

    if (world === undefined || size(world) !== 0) {
      return
    }

    initialWorldFetchRequestedRef.current = true
    void LiveRuntime.runPromise(
      getWorld.pipe(
        Effect.tap((world) => Effect.sync(() => setWorld(world)))
      )
    )
  }, [world])
  const runPlayerAction = useCallback(
    (action: Action) => {
      if (terminalPendingRef.current) return
      void LiveRuntime.runPromise(
        doPlayerAction(action).pipe(
          Effect.andThen(refreshWorldAndInventory)
        )
      )
    },
    [refreshWorldAndInventory]
  )
  const theDrawMatrix = drawWorld(world)

  // const handleKeyDown = (event: any) =>
  //   Match.value(event.keyCode).pipe(
  //     Match.when("j", () => onSubmit(marked)), // j
  //     Match.when(81, () => onCancel()), // q
  //     Match.when(188, () => markAll()) // ,
  //   )
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const input = event.ctrlKey
      ? `C-${event.key.toLowerCase()}`
      : event.key

    if (input === "C-s" || input === "C-q") {
      event.preventDefault()
    }

    if (terminalState !== undefined || terminalPendingRef.current) {
      event.preventDefault()
      return
    }

    const saveAndExit = () => {
      setPendingDirectionalAction(undefined)
      setPendingExtendedCommand(undefined)
      setPendingQuitConfirmation(false)
      terminalPendingRef.current = true
      setMessages(prependMessage("saving"))
      void LiveRuntime.runPromise(
        saveGame.pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              setTerminalState("saved")
              setMessages(prependMessage("saved; you may close this tab"))
            })
          ),
          Effect.catchAllCause((cause) =>
            Effect.sync(() => {
              terminalPendingRef.current = false
              setMessages(prependMessage(`save failed: ${String(cause)}`))
            })
          )
        )
      )
    }

    const beginQuitConfirmation = () => {
      setPendingDirectionalAction(undefined)
      setPendingExtendedCommand(undefined)
      setPendingQuitConfirmation(true)
      setMessages(prependMessage(quitWarningPrompt))
    }

    if (pendingQuitConfirmation) {
      switch (input.toLowerCase()) {
        case "y":
          setPendingQuitConfirmation(false)
          terminalPendingRef.current = true
          setMessages(prependMessage("quitting"))
          void LiveRuntime.runPromise(
            quitGame.pipe(
              Effect.tap(() =>
                Effect.sync(() => {
                  setTerminalState("quit")
                  setMessages(
                    prependMessage("game quit; you may close this tab")
                  )
                })
              ),
              Effect.catchAllCause((cause) =>
                Effect.sync(() => {
                  terminalPendingRef.current = false
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
          setPendingQuitConfirmation(false)
          setMessages(prependMessage("quit canceled"))
          return
        default:
          setMessages(prependMessage(quitWarningPrompt))
          return
      }
    }

    if (pendingExtendedCommand !== undefined) {
      switch (input) {
        case "Escape":
          setPendingExtendedCommand(undefined)
          setMessages(prependMessage("canceled extended command"))
          return
        case "Backspace":
          setPendingExtendedCommand(pendingExtendedCommand.slice(0, -1))
          return
        case "Enter": {
          const command = parseExtendedCommand(pendingExtendedCommand)
          setPendingExtendedCommand(undefined)
          if (Option.isSome(command) && command.value === "save") {
            saveAndExit()
          } else if (Option.isSome(command) && command.value === "quit") {
            beginQuitConfirmation()
          } else {
            setMessages(
              prependMessage(
                `unknown extended command: #${pendingExtendedCommand}`
              )
            )
          }
          return
        }
        default:
          if (/^[a-z]$/iu.test(input)) {
            setPendingExtendedCommand(
              `${pendingExtendedCommand}${input.toLowerCase()}`
            )
          } else {
            setPendingExtendedCommand(undefined)
          }
          return
      }
    }

    if (pendingDirectionalAction !== undefined) {
      if (input === "Escape") {
        setPendingDirectionalAction(undefined)
        setMessages(prependMessage(`canceled ${pendingDirectionalAction}`))
        return
      }

      const directionalAction = parseDirectionalActionInput(
        pendingDirectionalAction,
        input
      )
      setPendingDirectionalAction(undefined)
      if (Option.isNone(directionalAction)) {
        setMessages(prependMessage(`canceled ${pendingDirectionalAction}`))
        return
      }

      runPlayerAction(directionalAction.value)
      return
    }

    if (input === "C-s") {
      saveAndExit()
      return
    }

    if (input === "C-q") {
      beginQuitConfirmation()
      return
    }

    if (input === "#") {
      setPendingDirectionalAction(undefined)
      setPendingExtendedCommand("")
      setMessages(prependMessage("extended command: #"))
      return
    }

    if (input === "o" || input === "c") {
      const kind = input === "o" ? "open" : "close"
      setPendingDirectionalAction(kind)
      setMessages(prependMessage(directionActionPrompt(kind)))
      return
    }

    if (input === ",") {
      void LiveRuntime.runPromise(
        getPickupItemsFor("player").pipe(
          Effect.tap((contents) =>
            Effect.sync(() => {
              if (terminalPendingRef.current) return
              setPickupContents(contents)
            })
          )
        )
      )
      setShowPickup(true)
    } else {
      const action = parseInput(input)
      if (Option.isNone(action)) {
        return
      }

      runPlayerAction(action.value)
    }
  }
  // useEffect(() => {}) was the legacy react-blessed keyboard path.

  // const GameElement = reactBlessed.render(box)
  const onDoPickup = (pickupItems: ReadonlyArray<Key>) => {
    if (terminalState !== undefined || terminalPendingRef.current) return
    void LiveRuntime.runPromise(
      doPlayerAction(EAction.pickupMulti({ keys: pickupItems })).pipe(
        Effect.andThen(refreshWorldAndInventory),
        Effect.tap(() =>
          Effect.sync(() => {
            setShowPickup(false)
            gameref.current?.focus()
          })
        )
      )
    )
  }
  const onCancelPickup = () => {
    setMessages(prependMessage("canceling pickup"))
    setShowPickup(false)
    gameref.current?.focus()
  }

  return (
    <div
      ref={gameref}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <Messages messages={messages} />
      {terminalState === "saved"
        ? <p role="status">Game saved. You may close this tab.</p>
        : null}
      {terminalState === "quit"
        ? <p role="status">Game quit. You may close this tab.</p>
        : null}
      <GameBoard tiles={theDrawMatrix} />
      <PickupPopup
        items={pickupContents}
        onSubmit={onDoPickup}
        onCancel={onCancelPickup}
        open={showPickup}
      />
      <Inventory inventory={inventory} />
    </div>
  )
}
