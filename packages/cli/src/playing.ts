import { EAction, Entity, Pos, World } from "@flaghack/domain/schemas"
import blessed from "blessed"
import { Effect, HashMap, Layer, Match } from "effect"
import {} from "effect"
import { size } from "effect/HashMap"
import { List, Map } from "immutable"
import { Box, Newline, useInput } from "ink"
import React, { useState } from "react"
import { defined, map, UndefOr } from "scala-ts/UndefOr.js"
import { MainLive } from "./bin.js"
import { gameboard } from "./gameboard.js"
import { GameClient } from "./GameClient.js"
import { messagebox } from "./messagebox.js"
import { identity, nullMatrix, tilesToText } from "./util.js"
// import GameBoard, { Tile, Tiles } from "./GameBoard.jsx"
// import Messages from "./Messages.jsx"

type World = typeof World.Type
type Entity = typeof Entity.Type
type Pos = typeof Pos.Type

type Color =
  | "black"
  | "red"
  | "green"
  | "yellow"
  | "blue"
  | "magenta"
  | "cyan"
  | "white"
export type Tile = {
  char: string
  color?: Color
  bright?: boolean
  bg?: boolean
}
const colorNumMap = Map<Color, number>({
  black: 0,
  red: 1,
  green: 2,
  yellow: 3,
  blue: 4,
  magenta: 5,
  cyan: 6,
  white: 7
})
const maybeDo = (doP?: boolean) => <T extends Function>(fn: T) =>
  !!doP ? fn : identity
const fgColor = (num: number) => num + 30
const bgColor = (num: number) => num + 10
const brightenColor = (num: number) => num + 60
// export type Tiles = string[][];
export type Tiles = Tile[][]
// type Props = {
//   username: string
//   client: typeof GameClient
// }

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
export const playbox = (world: World) =>
  Effect.gen(function*() {
    const box = blessed.box({
      top: "center",
      left: "center",
      width: "100%",
      height: "100%"
      // label: "MESSAGES"
      // style: {
      //   fg: "white",
      //   bg: "black",
      //   border: {
      //     fg: "blue"
      //   },
      //   hover: { bg: "green" }
      // },
      // border: {
      //   type: "line"
      // }
    })
    // const screen = blessed.screen({})
    const world = yield* GameClient.getWorld
    const tiles = drawWorld(world)
    const messages = yield* GameClient.getLogs
    const gameBoard = blessed.box({
      bottom: 0,
      left: 0,
      width: tiles ? (tiles[0]?.length ?? 1) + 2 : 80,
      height: world ? (tiles?.length ?? 1) + 2 : 20,
      label: "gameboard",
      content: world ? tilesToText(tiles) : "empty board",
      style: {
        fg: "white",
        bg: "black",
        border: {
          fg: "blue"
        },
        hover: { bg: "green" }
      },
      border: {
        type: "line"
      }
    })
    // const boardBox = gameboard(tiles)
    const messageBox = messagebox(messages)

    // box.key(["j"], () => {
    //   GameClient.doPlayerAction(parseInput("j"))
    // })
    // box.key(["w"], () => {
    //   process.exit(0)
    // })

    box.focus()

    box.key(["j", "h", "l", "k"], (ch, k) =>
      Effect.runPromise(
        GameClient.doPlayerAction(parseInput(ch)).pipe(
          Effect.provide(MainLive)
        )
      )?.then((gs) => {
        gameBoard.setContent(tilesToText(drawWorld(gs.world)))
        gameBoard.render()
      }))
    box.append(gameBoard)
    box.append(messageBox)
    return box
  })
