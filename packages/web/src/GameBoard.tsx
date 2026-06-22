type Props = {
  tiles: Tiles
}
export type Tile = {
  char: string
  color?: Color
  bright?: boolean
  bg?: boolean
}
export type Tiles = ReadonlyArray<ReadonlyArray<Tile>>

type Color =
  | "black"
  | "red"
  | "green"
  | "yellow"
  | "blue"
  | "magenta"
  | "cyan"
  | "white"
const cssColor = (color: Color = "white", bright?: boolean): string =>
  color === "yellow" && bright !== true ? "#aa5500" : color

const hcolor = ({ bright, char, color }: Tile, key: string) => (
  <span style={{ color: cssColor(color, bright) }} key={key}>
    {`${char === " " ? " " : char}`}
  </span>
)

const tileToText = (tile: Tile, key: string) => hcolor(tile, key)
export default function({ tiles }: Props) {
  // const content = tiles.map((row) => row.map(tileToText).join("")).join(
  //   "\n"
  // )
  const content = tiles.map((row, y) =>
    row.map((t, x) => tileToText(t, `${x},${y}`)).concat([
      <br key={`br${y}`} />
    ])
  )
  return (
    <div
      role="region"
      aria-label="Game map"
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
