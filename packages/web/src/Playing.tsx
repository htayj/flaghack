import { getTile } from "@flaghack/domain/display"
import type { Tile } from "@flaghack/domain/display"
import { EAction, Entity, Key, Pos, World } from "@flaghack/domain/schemas"
// import blessed from "blessed"
import { Effect, HashMap } from "effect"
import { size } from "effect/HashMap"
import { List, Map } from "immutable"
import { type KeyboardEvent, useRef, useState } from "react"
import { map } from "scala-ts/UndefOr.js"
import type { UndefOr } from "scala-ts/UndefOr.js"
import type { Tiles } from "./GameBoard.tsx"
import GameBoard from "./GameBoard.tsx"
import {
  doPlayerAction,
  GameClient,
  getInventory,
  getPickupItemsFor,
  getWorld
} from "./GameClient.js"
import Inventory from "./Inventory.tsx"
import Messages from "./Messages.tsx"
import PickupPopup from "./PickupPopup.tsx"
// @ts-ignore
import React from "react"

export type Matrix<T> = List<List<T>>
export const nullMatrix = (h: number, w: number): Matrix<null> => {
  const rows = Array<Array<null>>(h)
  const filled = rows.fill(Array<null>(w).fill(null))
  /* filled.map( row => rownull) */

  return List(filled.map(List))
}
type World = typeof World.Type
type Key = typeof Key.Type
type Entity = typeof Entity.Type
type Pos = typeof Pos.Type
type Props = {
  username: string
}
const getTileOrDefault = (e: Entity | undefined): Tile =>
  e === undefined ? { color: "black", char: " " } : getTile(e)

const parseInput = (input: any) => {
  console.log("parsing input for input of: ", input)
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
      return EAction.noop()
  }
}

const getPosition = (e: Entity): UndefOr<Pos> =>
  e.in === "world" ? e.at : undefined

const posKey = (p: Omit<Pos, "z">): string => `${p.x},${p.y}`
const drawWorld = (world: World): Tiles => {
  const emptyMatrix = nullMatrix(20, 80)

  const worldMap = Map(world)
    .valueSeq()
    .groupBy((entity) => map(getPosition(entity), (p: Pos) => posKey(p)))
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
type Mode = "normal" | "inventory" | "picking_up" | "using" | "popup"
export default function BPlaying({}: Props) {
  const [messages, setMessages] = useState<List<string>>(List())
  const gameref = useRef<HTMLDivElement>(null)
  const pickupRef = useRef<HTMLDivElement>(null)
  // const [debugdump, setDebugdump] = useState<string>("aaaa")
  const [world, setWorld] = useState<World>(HashMap.empty())
  const [pickupContents, setPickupContents] = useState<World>(
    HashMap.empty()
  )
  const [showPickup, setShowPickup] = useState<boolean>(false)
  const [inventory, setInventory] = useState<World>(HashMap.empty())
  const [mode, setMode] = useState<Mode>("normal")
  if (world === undefined || size(world) === 0) {
    getWorld.pipe(Effect.andThen((w) => setWorld(w))).pipe(
      Effect.runPromise
    )
  }
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
    console.log("in handle key down: ", event)
    if (input === ",") {
      getPickupItemsFor("player").pipe(
        Effect.andThen(setPickupContents),
        Effect.runPromise
      )
      setShowPickup(true)
    } else {
      const action = parseInput(input)
      action
        ? (
          doPlayerAction(action).pipe(
            Effect.andThen(getWorld),
            Effect.andThen(setWorld),
            Effect.runPromise
          )
        )
        : setMode(action)
      getInventory.pipe(
        Effect.andThen(setInventory),
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
  const onDoPickup = (pickupItems: Key[]) => {
    DoPlayerAction(EAction.pickupMulti({ keys: pickupItems })).pipe(
      Effect.andThen(() => {
        setShowPickup(false)
      }),
      Effect.provide(MainLive),
      Effect.runPromise
    )
  }
  const onCancelPickup = () => {
    setMessages((messages) => messages.unshift(`canceling pickup`))
    setShowPickup(false)
  }

  return ["normal", "picking_up"].includes(mode)
    ? (
      <div
        ref={gameref}
        onKeyDown={handleKeyDown}
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
    : <div />
}
