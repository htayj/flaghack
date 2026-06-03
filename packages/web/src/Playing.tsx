import { getTile } from "@flaghack/domain/display"
import type { Tile } from "@flaghack/domain/display"
import { AnyTerrain, conforms, EAction } from "@flaghack/domain/schemas"
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
import { type KeyboardEvent, useEffect, useRef, useState } from "react"
import type { Tiles } from "./GameBoard.tsx"
import GameBoard from "./GameBoard.tsx"
import {
  doPlayerAction,
  getInventory,
  getPickupItemsFor,
  getWorld,
  LiveRuntime
} from "./GameClient.js"
import Inventory from "./Inventory.tsx"
import Messages from "./Messages.tsx"
import PickupPopup from "./PickupPopup.tsx"

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
const getTileOrDefault = (e: Entity | undefined): Tile =>
  e === undefined ? { color: "black", char: " " } : getTile(e)

export const parseInput = (input: string): Option.Option<Action> => {
  switch (input) {
    case "j":
      return Option.some(EAction.move({ dir: "S" }))
    case "h":
      return Option.some(EAction.move({ dir: "W" }))
    case "k":
      return Option.some(EAction.move({ dir: "N" }))
    case "l":
      return Option.some(EAction.move({ dir: "E" }))
    case "y":
      return Option.some(EAction.move({ dir: "NW" }))
    case "u":
      return Option.some(EAction.move({ dir: "NE" }))
    case "b":
      return Option.some(EAction.move({ dir: "SW" }))
    case "n":
      return Option.some(EAction.move({ dir: "SE" }))
    default:
      return Option.none()
  }
}

const getPosition = (e: Entity): Pos | undefined =>
  e.in === "world" ? e.at : undefined

const posKey = (p: Omit<Pos, "z">): string => `${p.x},${p.y}`
const isTerrain = conforms(AnyTerrain)
const zindex = (entity: Entity): number => isTerrain(entity) ? 0 : 1
export const drawWorld = (world: World): Tiles => {
  const emptyMatrix = nullMatrix(20, 80)

  const worldMap = Map(world)
    .valueSeq()
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
export default function BPlaying(_props: Props) {
  const [messages, setMessages] = useState<List<string>>(List())
  const gameref = useRef<HTMLDivElement>(null)
  const pickupRef = useRef<HTMLDivElement>(null)
  const initialWorldFetchRequestedRef = useRef(false)
  // const [debugdump, setDebugdump] = useState<string>("aaaa")
  const [world, setWorld] = useState<World>(HashMap.empty())
  const [pickupContents, setPickupContents] = useState<World>(
    HashMap.empty()
  )
  const [showPickup, setShowPickup] = useState<boolean>(false)
  const [inventory, setInventory] = useState<World>(HashMap.empty())
  const refreshWorldAndInventory = Effect.all({
    world: getWorld,
    inventory: getInventory
  }).pipe(
    Effect.tap(({ world }) => Effect.sync(() => setWorld(world))),
    Effect.tap(({ inventory }) =>
      Effect.sync(() => setInventory(inventory))
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
  const theDrawMatrix = drawWorld(world)
  const log = (input: string) =>
    setMessages((messages) => messages.unshift(`[debug] ${input}`))

  // const handleKeyDown = (event: any) =>
  //   Match.value(event.keyCode).pipe(
  //     Match.when("j", () => onSubmit(marked)), // j
  //     Match.when(81, () => onCancel()), // q
  //     Match.when(188, () => markAll()) // ,
  //   )
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const input = event.key
    if (input === ",") {
      void LiveRuntime.runPromise(
        getPickupItemsFor("player").pipe(
          Effect.tap((contents) =>
            Effect.sync(() => setPickupContents(contents))
          )
        )
      )
      setShowPickup(true)
    } else {
      const action = parseInput(input)
      if (Option.isNone(action)) {
        return
      }

      void LiveRuntime.runPromise(
        doPlayerAction(action.value).pipe(
          Effect.andThen(refreshWorldAndInventory)
        )
      )
    }
  }
  // useEffect(() => {}) was the legacy react-blessed keyboard path.

  // const GameElement = reactBlessed.render(box)
  const onDoPickup = (pickupItems: ReadonlyArray<Key>) => {
    void LiveRuntime.runPromise(
      doPlayerAction(EAction.pickupMulti({ keys: pickupItems })).pipe(
        Effect.andThen(refreshWorldAndInventory),
        Effect.tap(() => Effect.sync(() => setShowPickup(false)))
      )
    )
  }
  const onCancelPickup = () => {
    setMessages((messages) => messages.unshift(`canceling pickup`))
    setShowPickup(false)
  }

  return (
    <div
      ref={gameref}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <Messages messages={messages} />
      <GameBoard tiles={theDrawMatrix} />
      <PickupPopup
        pickupRef={pickupRef}
        items={pickupContents}
        onSubmit={onDoPickup}
        onCancel={onCancelPickup}
        open={showPickup}
        log={log}
      />
      <Inventory inventory={inventory} />
    </div>
  )
}
