import { Match } from "effect"
import { Map } from "immutable"
import React from "react"
import blessed from "react-blessed"
import { getOrElse } from "scala-ts/UndefOr.js"
import { identity } from "../util.js"

// const identity = <T>(a: T) => a

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
const tcolor = (
  opening: boolean,
  color: Color = "white",
  bright?: boolean,
  bg?: boolean
) =>
  `{${opening ? "" : "/"}${bright ? "bright" : ""}${color}${
    bg ? "-bg" : "-fg"
  }}`
const bcolor = (
  char: string,
  color: Color = "white",
  bright?: boolean,
  bg?: boolean
) =>
  `${tcolor(true, color, bright, bg)}${char}${
    tcolor(false, color, bright, bg)
  }`
// escColor(
//   maybeDo(bg)(bgColor)(
//     maybeDo(bright)(brightenColor)(
//       fgColor(getOrElse(colorNumMap.get(color), () => 7))
//     )
//   )
// )
// const truecolor = (color: Color = "white", bright?: boolean) =>
//   Match.value(color).pipe(
//     Match.when("white", () => "#aaaaaa"),
//     Match.when("black", () => "#000000"),
//     Match.when("yellow", () => "#aaaa00")
//     Match.orElse(() => "#aaaa00")
//   )

const tileToText = ({ color, char, bright, bg }: Tile) =>
  `${ecolor(color, bright, bg)}${char}`
export default function({ tiles }: Props) {
  // const tileToText = ({ color, char, bright, bg }: Tile) =>
  //   `${bcolor(char, color, bright, bg)}`

  // fg={c.color ?? "white"}
  // const griditems = tiles.map((row, y) =>
  //   row.map((c, x) => (
  //     <element
  //       left={x}
  //       top={y}
  //       key={`${x},${y}`}
  //       content={`${ecolor(c.color, c.bright)}${c.char}`}
  //     />
  //   ))
  // ).reduce((acc, curr) => acc.concat(curr))

  // content={`${ecolor(c.color, c.bright)}${c.char}`}
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
// {tiles.map((row) => row.map(tileToText).join("")).join("\n")}
