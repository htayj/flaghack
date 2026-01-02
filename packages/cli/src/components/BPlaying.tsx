import { AnyTerrain, conforms, EAction, Entity, Key, Pos, World } from "@flaghack/domain/schemas"
// import blessed from "blessed"
import { getTile, Tile } from "@flaghack/domain/display"
import { Effect, HashMap } from "effect"
import { size } from "effect/HashMap"
import { List, Map } from "immutable"
import React, { useEffect, useRef, useState } from "react"
import { BoxElement } from "react-blessed"
import { map, UndefOr } from "scala-ts/UndefOr.js"
import { MainLive } from "../bin.js"
import { GameClient } from "../GameClient.js"
import BGameBoard, { Tiles } from "./BGameBoard.jsx"
import Inventory from "./Inventory.js"
import Messages from "./Messages.jsx"
import MultiDropPopup from "./MultiDropPopup.js"
import PickupPopup from "./PickupPopup.js"

const apiDoPlayerAction = GameClient.doPlayerAction
const apiGetInventory = GameClient.getInventory
const apiGetPickupItemsFor = GameClient.getPickupItemsFor
// const apiGetLogs = GameClient.getLogs
const apiGetWorld = GameClient.getWorld
export type Matrix<T> = List<List<T>>
export const nullMatrix = (h: number, w: number): Matrix<null> => {
  const rows = Array<Array<null>>(h)
  const filled = rows.fill(Array<null>(w).fill(null))
  /* filled.map( row => rownull) */

  return List(filled.map(List))
}
export const isTerrain = conforms(AnyTerrain)
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
const zindex = (p: typeof Entity.Type) =>  isTerrain(p) ? 0 : 1

const drawWorld = (world: World, log:(input: string) => void = console.log ): Tiles => {
  const emptyMatrix = nullMatrix(20, 80)

  const worldMap = Map(world)
    .valueSeq()
    .groupBy((entity) => map(getPosition(entity), (p: Pos) => posKey(p)))
    .map((v) => v.valueSeq().toArray())
  const fullmap = emptyMatrix.map((row, y) =>
    row
      .map((_, x) => worldMap.get(posKey({ x, y })))
      .map(List)
      .map((l) => {
			const sorted = l.sortBy(zindex).reverse()
			// if(l.size > 1) log(sorted.valueSeq().map(t => t._tag).join(","))
			return sorted.first()
		}
			)
      .map(getTileOrDefault)
  )
  return fullmap.map((r) => r.toArray()).toArray()
}
type Mode = "normal" | "inventory" | "picking_up" | "using" | "popup"
export default function BPlaying({}: Props) {
  const [messages, setMessages] = useState<List<string>>(List())
  const gameref = useRef<BoxElement>(null)
  const pickupRef = useRef<BoxElement>(null)
  const dropRef = useRef<BoxElement>(null)
  // const [debugdump, setDebugdump] = useState<string>("aaaa")
  const [world, setWorld] = useState<World>(HashMap.empty())
  const [pickupContents, setPickupContents] = useState<World>(
    HashMap.empty()
  )
  const [inventory, setInventory] = useState<World>(HashMap.empty())
  const [mode, setMode] = useState<Mode>("normal")
  if (world === undefined || size(world) === 0) {
    apiGetWorld.pipe(Effect.andThen((w) => setWorld(w))).pipe(
      Effect.andThen(() => pickupRef.current?.hide()),
      Effect.andThen(() => dropRef.current?.hide()),
      Effect.provide(MainLive),
      Effect.runPromise
    )
  }
  const theDrawMatrix = drawWorld(world)
  const log = (input: string) =>
    setMessages((messages) => messages.unshift(`[debug] ${input}`))

  useEffect(() => {
    gameref.current?.focus()
    gameref.current?.key(
      ["j", "k", "l", "h", "y", "d", "u", "n", "b", ","],
      (input: string) => {
        setMessages((messages) => messages.unshift(`doing ${input}`))
        if (input === ",") {
          setMessages((messages) => messages.unshift("picking up "))
          apiGetPickupItemsFor("player").pipe(
            Effect.andThen(setPickupContents),
            Effect.provide(MainLive),
            Effect.runPromise
          )
          pickupRef.current?.show()
          pickupRef.current?.focus()
        } else if (input === "d") {
          setMessages((messages) => messages.unshift("dropping"))
          dropRef.current?.show()
          dropRef.current?.focus()
        } else {
          const action = parseInput(input)
          action
            ? (
              apiDoPlayerAction(action).pipe(
                Effect.andThen(apiGetWorld),
                Effect.andThen(setWorld),
                Effect.provide(MainLive),
                Effect.runPromise
              )
            )
            : setMode(action)
          apiGetInventory.pipe(
            Effect.andThen(setInventory),
            Effect.provide(MainLive),
            Effect.runPromise
          )
        }
      }
    )
  }, [])

  const onDoPickup = (pickupItems: Key[]) => {
    apiDoPlayerAction(EAction.pickupMulti({ keys: pickupItems })).pipe(
      Effect.andThen(() => {
        pickupRef.current?.hide()
        gameref.current?.focus()
      }),
      Effect.provide(MainLive),
      Effect.runPromise
    )
  }
  const onDoDrop = (dropItems: Key[]) => {
    apiDoPlayerAction(EAction.dropMulti({ keys: dropItems })).pipe(
      Effect.andThen(() => {
        dropRef.current?.hide()
        gameref.current?.focus()
      }),
      Effect.provide(MainLive),
      Effect.runPromise
    )
  }
  const onCancelMultiDrop = () => {
    setMessages((messages) => messages.unshift(`canceling multidrop`))
    dropRef.current?.hide()
    gameref.current?.focus()
  }
  const onCancelPickup = () => {
    setMessages((messages) => messages.unshift(`canceling pickup`))
    pickupRef.current?.hide()
    gameref.current?.focus()
  }

  return ["normal", "picking_up"].includes(mode)
    ? (
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
    : <box />
}
