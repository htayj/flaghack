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
const hcolor = (color: Color = "white") => (char: string, key: string) => (
  <span style={{ color }} key={key}>
    {`${char === " " ? " " : char}`}
  </span>
)

const tileToText = ({ char, color }: Tile, key: string) =>
  hcolor(color)(char, key)
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
