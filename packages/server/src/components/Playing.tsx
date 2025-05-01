import { Match } from "effect"
import { List, Map } from "immutable"
import { Box, Newline, useInput } from "ink"
import React, { useState } from "react"
import { defined, map, UndefOr } from "scala-ts/UndefOr.js"
import { Action } from "../actions.js"
import {
  apiDoPlayerAction,
  apiGetInventory,
  apiGetLogs,
  apiGetWorld
} from "../gameloop.js"
import { TPos } from "../position.js"
import { nullMatrix } from "../util.js"
import { Entity, World } from "../world.js"
import GameBoard, { Tile, Tiles } from "./GameBoard.jsx"
import Inventory from "./Inventory.js"
import Messages from "./Messages.jsx"

type Props = {
  username: string
}

const parseInput = (input: any) => {
  switch (input) {
    case "j":
      return Action.moveDown
    case "h":
      return Action.moveLeft
    case "k":
      return Action.moveUp
    case "l":
      return Action.moveRight
    case "y":
      return Action.moveUpLeft
    case "u":
      return Action.moveUpRight
    case "b":
      return Action.moveDownLeft
    case "n":
      return Action.moveDownRight
    default:
      return Action.noop
  }
}

const getPosition = (e: Entity): UndefOr<TPos> =>
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
  // (e?.type) {
  //     case "flag":
  //       return { color: "yellow", bright: true, char: "F" }
  //     case "player":
  //       return { color: "white", char: "@" }
  //     case "wall":
  //       return { color: "white", char: "#" }
  //     case "hippie":
  //       return { color: "yellow", char: "h" }
  //     default:
  //       return { color: "black", char: ".", bright: true }
  //   }
}
// const getTile = (e: UndefOr<Entity>): Tile => {
//   switch (e?.type) {
//     case "flag":
//       return { color: "yellow", bright: true, char: "F" }
//     case "player":
//       return { color: "white", char: "@" }
//     case "wall":
//       return { color: "white", char: "#" }
//     case "hippie":
//       return { color: "yellow", char: "h" }
//     default:
//       return { color: "black", char: ".", bright: true }
//   }
// }

const posKey = (p: TPos): string => `${p.x},${p.y}`
const drawWorld = (world: World): Tiles => {
  const emptyMatrix = nullMatrix(20, 80)
  const worldMap = world
    .valueSeq()
    .groupBy((entity) => map(getPosition(entity), (p: TPos) => posKey(p)))
    .map((v) => v.valueSeq().toArray())
  // console.log("worldmap: ", JSON.stringify(worldMap))
  const fullmap = emptyMatrix.map((row, y) =>
    row
      .map((_, x) => worldMap.get(posKey({ x, y })))
      .map(List)
      .map((l) => l.first())
      .map(getTile)
  )
  return fullmap.map((r) => r.toArray()).toArray()
}
type Mode = "normal" | "inventory" | "using" | "popup"
export default function Playing({ username }: Props) {
  const [messages, setMessages] = useState<List<string>>(List())
  const [world, setWorld] = useState<World>(Map())
  const [inventory, setInventory] = useState<Map<string, Entity>>(Map())
  const [mode] = useState<Mode>("normal")
  if (world === undefined || world.size === 0) {
    apiGetWorld().then((w) => setWorld(w))
  }
  const theDrawMatrix = drawWorld(world)
  useInput((input) => {
    apiDoPlayerAction(parseInput(input)).then(apiGetWorld).then((res) => {
      setWorld(res)
      // setMessages(List([JSON.stringify(res)]))
    })
    apiGetLogs().then((messages) => setMessages(List(messages)))
    apiGetInventory().then(setInventory)
  })

  return mode === "normal"
    ? (
      <Box flexDirection="column" margin={2}>
        <Messages messages={messages} />
        <Newline />
        <Box flexDirection="row">
          <GameBoard tiles={theDrawMatrix} />
          <Inventory inventory={inventory} />
        </Box>
      </Box>
    )
    : <Box />
}
