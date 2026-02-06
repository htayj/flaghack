// import { Match } from "effect"
import { Color, Tile } from "@flaghack/domain/display"
import { Map } from "immutable"
import React from "react"
// import blessed from "react-blessed"
import { getOrElse } from "scala-ts/UndefOr.js"
import { identity } from "../util.js"

type Props = {
  tiles: Tiles
  cursor?: { x: number; y: number }
  showCursor?: boolean
}
export type Tiles = Tile[][]

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
const escColor = (num: number) => `\x1b[${num}m`
const ecolor = (color: Color = "white", bright?: boolean, bg?: boolean) =>
  escColor(
    maybeDo(bg)(bgColor)(
      maybeDo(bright)(brightenColor)(
        fgColor(getOrElse(colorNumMap.get(color), () => 7))
      )
    )
  )

const invertOn = "\x1b[7m"
const invertOff = "\x1b[27m"
const tileToText = (tile: Tile & { invert?: boolean }) => {
  const { color, char, bright, bg } = tile
  return `${tile.invert ? invertOn : ""}${ecolor(color, bright, bg)}${char}${
    tile.invert ? invertOff : ""
  }`
}
const applyCursor = (
  tiles: Tiles,
  cursor?: { x: number; y: number },
  showCursor?: boolean
): Tiles => {
  if (!showCursor || !cursor) return tiles
  const { x, y } = cursor
  if (y < 0 || y >= tiles.length) return tiles
  if (x < 0 || x >= (tiles[0]?.length ?? 0)) return tiles
  return tiles.map((row, rowIdx) =>
    rowIdx !== y
      ? row
      : row.map((tile, colIdx) =>
        colIdx === x
          ? { ...tile, invert: true }
          : tile
      )
  )
}
export default function({ tiles, cursor, showCursor }: Props) {
  const withCursor = applyCursor(tiles, cursor, showCursor)
  const content = withCursor.map((row) =>
    row.map(tileToText).join("")
  ).join("\n")
  return (
    <box
      bottom={0}
      left={0}
      height={withCursor.length + 2}
      width={(withCursor[0]?.length ?? 1) + 2}
      border="line"
      fg={"brightblack"}
      // children={griditems}
    >
      {content}
    </box>
  )
}
