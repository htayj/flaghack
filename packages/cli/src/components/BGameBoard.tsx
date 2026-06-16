// import { Match } from "effect"
import type { Tile } from "@flaghack/domain/display"
import React from "react"
// import blessed from "react-blessed"
import { tilesToText } from "../util.js"
import {
  MESSAGE_LOG_HEIGHT,
  PLAY_AREA_HEIGHT,
  PLAY_AREA_WIDTH
} from "./layout.js"

type Props = {
  tiles: Tiles
}
export type Tiles = ReadonlyArray<ReadonlyArray<Tile>>

export default function({ tiles }: Props) {
  const content = tilesToText(tiles)
  return (
    <box
      top={MESSAGE_LOG_HEIGHT}
      left={0}
      height={PLAY_AREA_HEIGHT}
      width={PLAY_AREA_WIDTH}
      border="line"
      fg={"brightblack"}
      // children={griditems}
    >
      {content}
    </box>
  )
}
