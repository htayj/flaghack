import { Match } from "effect"
import { List, Map } from "immutable"
import { Box, Newline, useInput } from "ink"
import React, { useState } from "react"
import { defined, map, UndefOr } from "scala-ts/UndefOr.js"
import { Action } from "../actions.js"
import { apiDoPlayerAction, apiGetLogs, apiGetWorld } from "../gameloop.js"
import { TPos } from "../position.js"
import { nullMatrix } from "../util.js"
import { Entity, World } from "../world.js"
import GameBoard, { Tile, Tiles } from "./GameBoard.jsx"
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
  (((e as any)["loc"] ?? {}) as any)["at"]
// const getPosition = (e: Entity): UndefOr<TPos> =>
//   map(Map(e as any).get("loc"), (l) => l.get("at"))
// const getPosition = (e: Entity): UndefOr<TPos> =>
//   map(filterIs(e, isPositioned), (c) => c.loc.at)

const getTile = (e: UndefOr<Entity>): Tile => {
  return defined(e)
    ? Match.type<Entity>().pipe(
      Match.tag("player", () => ({ color: "white", char: "@" })),
      Match.tag("hippie", () => ({ color: "yellow", char: "h" })),
      Match.tag("wall", () => ({ color: "white", char: "#" })),
      Match.tag(
        "flag",
        () => ({ color: "yellow", bright: true, char: "F" })
      ),
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
  })

  return mode === "normal"
    ? (
      <Box flexDirection="column" margin={2}>
        <Messages messages={messages} />
        <Newline />
        <GameBoard tiles={theDrawMatrix} />
      </Box>
    )
    : <Box />
}
