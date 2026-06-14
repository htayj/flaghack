// import { Match } from "effect"
import type { Tile } from "@flaghack/domain/display"
import React from "react"
// import blessed from "react-blessed"
import { tilesToText } from "../util.js"

type Props = {
  tiles: Tiles
}
export type Tiles = ReadonlyArray<ReadonlyArray<Tile>>

export default function({ tiles }: Props) {
  const content = tilesToText(tiles)
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
