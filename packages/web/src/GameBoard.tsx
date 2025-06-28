import { Map } from "immutable"
import { getOrElse } from "scala-ts/UndefOr.js"
import { identity } from "./util.ts"
// @ts-ignore
import React from "react"

type Props = {
  tiles: Tiles
}
export type Tile = {
  char: string
  color?: Color
  bright?: boolean
  bg?: boolean
}
export type Tiles = Tile[][]

type Color =
  | "black"
  | "red"
  | "green"
  | "yellow"
  | "blue"
  | "magenta"
  | "cyan"
  | "white"
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
const hcolor =
  (color: Color = "white", bright?: boolean, bg?: boolean) =>
  (char: string) => (
    <span style={{ color }}>
      {`${char === " " ? " " : char}`}
    </span>
  )

const tileToText = ({ color, char, bright, bg }: Tile) =>
  hcolor(color, bright, bg)(char)
export default function({ tiles }: Props) {
  // const content = tiles.map((row) => row.map(tileToText).join("")).join(
  //   "\n"
  // )
  const content = tiles.map((row) =>
    row.map(tileToText).concat([
      <br />
    ])
  )
  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        border: "solid",
        fontFamily: "monospace"
      }}
    >
      {content}
    </div>
  )
}
