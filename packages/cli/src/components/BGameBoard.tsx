// import { Match } from "effect"
import { Color, Tile } from "@flaghack/domain/display"
import { Map } from "immutable"
import React from "react"
// import blessed from "react-blessed"
import { getOrElse } from "scala-ts/UndefOr.js"
import { identity } from "../util.js"

type Props = {
  tiles: Tiles
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

const tileToText = ({ color, char, bright, bg }: Tile) =>
  `${ecolor(color, bright, bg)}${char}`
export default function({ tiles }: Props) {
  const content = tiles.map((row) => row.map(tileToText).join("")).join(
    "\n"
  )
  return (
    <box
      bottom={0}
      left={0}
      height={tiles.length + 2}
      width={(tiles[0]?.length ?? 1) + 2}
      border="line"
      fg={"brightblack"}
      // children={griditems}
    >
      {content}
    </box>
  )
}
