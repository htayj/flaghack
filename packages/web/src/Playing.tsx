import { getTile } from "@flaghack/domain/display"
import type { Tile } from "@flaghack/domain/display"
import { EAction } from "@flaghack/domain/schemas"
import type {
  Action,
  Entity as EntitySchema,
  Key as KeySchema,
  Pos as PosSchema,
  World as WorldSchema
} from "@flaghack/domain/schemas"
// import blessed from "blessed"
import { Effect, HashMap } from "effect"
import { size } from "effect/HashMap"
import { List, Map } from "immutable"
import { type KeyboardEvent, useEffect, useRef, useState } from "react"
import type { Tiles } from "./GameBoard.tsx"
import GameBoard from "./GameBoard.tsx"
import {
  doPlayerAction,
  getInventory,
  getPickupItemsFor,
  getWorld
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

export const parseInput = (input: string): Action | undefined => {
  switch (input) {
    case "j":
      return EAction.move({ dir: "S" })
    case "h":
      return EAction.move({ dir: "W" })
    case "k":
      return EAction.move({ dir: "N" })
    case "l":
      return EAction.move({ dir: "E" })
    case "y":
      return EAction.move({ dir: "NW" })
    case "u":
      return EAction.move({ dir: "NE" })
    case "b":
      return EAction.move({ dir: "SW" })
    case "n":
      return EAction.move({ dir: "SE" })
    default:
      return undefined
  }
}

const getPosition = (e: Entity): Pos | undefined =>
  e.in === "world" ? e.at : undefined

const posKey = (p: Omit<Pos, "z">): string => `${p.x},${p.y}`
const drawWorld = (world: World): Tiles => {
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
      .map((l) => l.first())
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
    Effect.andThen(({ inventory, world }) => {
      setWorld(world)
      setInventory(inventory)
    })
  )

  useEffect(() => {
    if (initialWorldFetchRequestedRef.current) {
      return
    }

    if (world === undefined || size(world) !== 0) {
      return
    }

    initialWorldFetchRequestedRef.current = true
    getWorld.pipe(Effect.andThen((w) => setWorld(w))).pipe(
      Effect.runPromise
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
      getPickupItemsFor("player").pipe(
        Effect.andThen(setPickupContents),
        Effect.runPromise
      )
      setShowPickup(true)
    } else {
      const action = parseInput(input)
      if (action === undefined) {
        return
      }

      doPlayerAction(action).pipe(
        Effect.andThen(refreshWorldAndInventory),
        Effect.runPromise
      )
    }
  }
  // useEffect(() => {
  //   gameref.current?.focus()
  //   gameref.current?.key(
  //     ["j", "k", "l", "h", "y", "u", "n", "b", ","],
  //     (input: string) => {
  //       setMessages((messages) => messages.unshift(`doing ${input}`))
  //       if (input === ",") {
  //         setMessages((messages) => messages.unshift("picking up "))
  //         apiGetPickupItemsFor("player").pipe(
  //           Effect.andThen(setPickupContents),
  //           Effect.provide(MainLive),
  //           Effect.runPromise
  //         )
  //         pickupRef.current?.show()
  //         pickupRef.current?.focus()
  //       } else {
  //         const action = parseInput(input)
  //         action
  //           ? (
  //             apiDoPlayerAction(action).pipe(
  //               Effect.andThen(apiGetWorld),
  //               Effect.andThen(setWorld),
  //               Effect.provide(MainLive),
  //               Effect.runPromise
  //             )
  //           )
  //           : setMode(action)
  //         // apiGetLogs.pipe(
  //         //   Effect.andThen((messages) => setMessages(List(messages))),
  //         //   Effect.provide(MainLive),
  //         //   Effect.runPromise
  //         // )
  //         apiGetInventory.pipe(
  //           Effect.andThen(setInventory),
  //           Effect.provide(MainLive),
  //           Effect.runPromise
  //         )
  //       }
  //     }
  //   )
  // }, [])

  // const pickupRecursive = (pickupItems: Key[]) => {
  // 	if( pickupItems.length > 0 )  {
  // 		const k = pickupItems[0]
  // 		apiDoPlayerAction(EAction.pickup({object:world.pipe(HashMap.get(k))}))
  // 	} }
  // const GameElement = reactBlessed.render(box)
  const onDoPickup = (pickupItems: Array<Key>) => {
    doPlayerAction(EAction.pickupMulti({ keys: pickupItems })).pipe(
      Effect.andThen(refreshWorldAndInventory),
      Effect.andThen(() => {
        setShowPickup(false)
      }),
      Effect.runPromise
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
