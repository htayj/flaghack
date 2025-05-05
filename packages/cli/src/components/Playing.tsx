import { EAction, Entity, Pos, World } from "@flaghack/domain/schemas"
import { Effect, HashMap, Match } from "effect"
import { size } from "effect/HashMap"
import { List, Map } from "immutable"
import { Box, Newline, useInput } from "ink"
import React, { useState } from "react"
import { defined, map, UndefOr } from "scala-ts/UndefOr.js"
// import {
//   apiDoPlayerAction,
//   apiGetInventory,
//   apiGetLogs,
//   apiGetWorld
// } from "../gameloop.js"
// import { nullMatrix } from "../util.js"
import { GameClient } from "../GameClient.js"
import GameBoard, { Tile, Tiles } from "./GameBoard.jsx"
// import Inventory from "./Inventory.js"
import { MainLive } from "../bin.js"
import Messages from "./Messages.jsx"

const apiDoPlayerAction = GameClient.doPlayerAction
const apiGetInventory = GameClient.getInventory
const apiGetLogs = GameClient.getLogs
const apiGetWorld = GameClient.getWorld
export type Matrix<T> = List<List<T>>
export const nullMatrix = (h: number, w: number): Matrix<null> => {
  const rows = Array<Array<null>>(h)
  const filled = rows.fill(Array<null>(w).fill(null))
  /* filled.map( row => rownull) */

  return List(filled.map(List))
}
type World = typeof World.Type
type Entity = typeof Entity.Type
type Pos = typeof Pos.Type
type Props = {
  username: string
}

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

const getTile = (e: UndefOr<Entity>): Tile => {
  return defined(e)
    ? Match.type<Entity>().pipe(
      Match.tag("player", () => ({ color: "white", char: "@" })),
      Match.tag("ranger", () => ({ color: "magenta", char: "@" })),
      Match.tag("hippie", () => ({ color: "yellow", char: "h" })),
      Match.tag("wook", () => ({ color: "cyan", char: "h" })),
      Match.tag("acidcop", () => ({ color: "magenta", char: "K" })),
      Match.tag("lesser_egregore", () => ({ color: "green", char: "e" })),
      Match.tag("greater_egregore", () => ({ color: "green", char: "E" })),
      Match.tag(
        "collective_egregore",
        () => ({ color: "green", char: "E" })
      ),
      Match.tag(
        "flag",
        () => ({ color: "yellow", bright: true, char: "F" })
      ),
      Match.tag("water", () => ({ color: "cyan", char: "!" })),
      Match.tag("booze", () => ({ color: "yellow", char: "!" })),
      Match.tag("acid", () => ({ color: "green", char: "!" })),
      Match.tag(
        "bacon",
        () => ({ color: "red", bright: true, char: "%" })
      ),
      Match.tag(
        "poptart",
        () => ({ color: "yellow", bright: true, char: "%" })
      ),
      Match.tag(
        "trailmix",
        () => ({ color: "yellow", char: "%" })
      ),
      Match.tag(
        "pancake",
        () => ({ color: "white", bright: true, char: "%" })
      ),
      Match.tag(
        "soup",
        () => ({ color: "red", char: "%" })
      ),
      Match.tag("wall", () => ({ color: "white", char: "#" })),
      Match.exhaustive
    )(e) as Tile
    : { color: "black", char: ".", bright: true }
}

const posKey = (p: Pos): string => `${p.x},${p.y}`
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
      .map(getTile)
  )
  return fullmap.map((r) => r.toArray()).toArray()
}
type Mode = "normal" | "inventory" | "picking_up" | "using" | "popup"
export default function Playing({}: Props) {
  const [messages, setMessages] = useState<List<string>>(List())
  const [world, setWorld] = useState<World>(HashMap.empty())
  const [_, setInventory] = useState<World>(HashMap.empty())
  const [mode, setMode] = useState<Mode>("normal")
  if (world === undefined || size(world) === 0) {
    apiGetWorld.pipe(Effect.andThen((w) => setWorld(w))).pipe(
      Effect.provide(MainLive),
      Effect.runPromise
    )
  }
  const theDrawMatrix = drawWorld(world)
  useInput((input) => {
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
    apiGetLogs.pipe(
      Effect.andThen((messages) => setMessages(List(messages))),
      Effect.provide(MainLive),
      Effect.runPromise
    )
    apiGetInventory.pipe(
      Effect.andThen(setInventory),
      Effect.provide(MainLive),
      Effect.runPromise
    )
  })

  return ["normal", "picking_up"].includes(mode)
    ? (
      <Box flexDirection="column" margin={2}>
        <Messages messages={messages} />
        <Newline />
        <Box flexDirection="row">
          <GameBoard tiles={theDrawMatrix} />
        </Box>
      </Box>
    )
    : <Box />
}

// <Inventory inventory={Map(inventory)} />
