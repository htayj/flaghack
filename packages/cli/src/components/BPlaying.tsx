import {
  type Action,
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
import React, { useEffect, useRef, useState } from "react"
import type { BoxElement } from "react-blessed"
import { GameClient } from "../GameClient.js"
import { MainLive } from "../runtime.js"
import BGameBoard, { type Tiles } from "./BGameBoard.js"
import Inventory from "./Inventory.js"
import Messages from "./Messages.js"
import MultiDropPopup from "./MultiDropPopup.js"
import PickupPopup from "./PickupPopup.js"

const apiDoPlayerAction = GameClient.doPlayerAction
const apiGetInventory = GameClient.getInventory
const apiGetPickupItemsFor = GameClient.getPickupItemsFor
// const apiGetLogs = GameClient.getLogs
const apiGetWorld = GameClient.getWorld
export type Matrix<T> = List<List<T>>
export const nullMatrix = (h: number, w: number): Matrix<null> =>
  List(
    Array.from({ length: h }, () =>
      List(Array.from({ length: w }, () => null)))
  )
export const isTerrain = conforms(AnyTerrain)
type World = typeof WorldSchema.Type
type Key = typeof KeySchema.Type
type Entity = typeof EntitySchema.Type
type Pos = typeof PosSchema.Type
type Props = {
  username: string
}
const getTileOrDefault = (e: Entity | undefined): Tile =>
  e === undefined ? { color: "black", char: " " } : getTile(e)

const parseInput = (input: string): Option.Option<Action> => {
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
const zindex = (p: Entity) => isTerrain(p) ? 0 : 1

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
      .map((l) => {
        const sorted = l.sortBy(zindex).reverse()
        // if(l.size > 1) log(sorted.valueSeq().map(t => t._tag).join(","))
        return sorted.first()
      })
      .map(getTileOrDefault)
  )
  return fullmap.map((r) => r.toArray()).toArray()
}
export default function BPlaying(_props: Props) {
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
  const initialWorldFetchStarted = useRef(false)
  const refreshWorldAndInventory = Effect.all({
    world: apiGetWorld,
    inventory: apiGetInventory
  }).pipe(
    Effect.tap(({ world }) => Effect.sync(() => setWorld(world))),
    Effect.tap(({ inventory }) =>
      Effect.sync(() => setInventory(inventory))
    )
  )

  useEffect(() => {
    if (
      initialWorldFetchStarted.current
      || (world !== undefined && size(world) !== 0)
    ) {
      return
    }

    initialWorldFetchStarted.current = true
    apiGetWorld.pipe(
      Effect.tap((world) => Effect.sync(() => setWorld(world))),
      Effect.tap(() => Effect.sync(() => pickupRef.current?.hide())),
      Effect.tap(() => Effect.sync(() => dropRef.current?.hide())),
      Effect.provide(MainLive),
      Effect.runPromise
    )
  }, [world])
  const theDrawMatrix = drawWorld(world)
  const log = (input: string) =>
    setMessages((messages) => messages.unshift(`[debug] ${input}`))

  useEffect(() => {
    const gameBox = gameref.current
    const gameKeys = ["j", "k", "l", "h", "y", "d", "u", "n", "b", ","]
    const handleGameKey = (input: string) => {
      setMessages((messages) => messages.unshift(`doing ${input}`))
      if (input === ",") {
        setMessages((messages) => messages.unshift("picking up "))
        apiGetPickupItemsFor("player").pipe(
          Effect.tap((contents) =>
            Effect.sync(() => setPickupContents(contents))
          ),
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
        if (Option.isNone(action)) {
          return
        }
        apiDoPlayerAction(action.value).pipe(
          Effect.andThen(refreshWorldAndInventory),
          Effect.provide(MainLive),
          Effect.runPromise
        )
      }
    }

    gameBox?.focus()
    gameBox?.key(gameKeys, handleGameKey)

    return () => {
      for (const key of gameKeys) {
        gameBox?.removeListener(`key ${key}`, handleGameKey)
      }
    }
  }, [])

  const onDoPickup = (pickupItems: ReadonlyArray<Key>) => {
    apiDoPlayerAction(EAction.pickupMulti({ keys: pickupItems })).pipe(
      Effect.andThen(refreshWorldAndInventory),
      Effect.tap(() => Effect.sync(() => pickupRef.current?.hide())),
      Effect.tap(() => Effect.sync(() => gameref.current?.focus())),
      Effect.provide(MainLive),
      Effect.runPromise
    )
  }
  const onDoDrop = (dropItems: ReadonlyArray<Key>) => {
    apiDoPlayerAction(EAction.dropMulti({ keys: dropItems })).pipe(
      Effect.andThen(refreshWorldAndInventory),
      Effect.tap(() => Effect.sync(() => dropRef.current?.hide())),
      Effect.tap(() => Effect.sync(() => gameref.current?.focus())),
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
