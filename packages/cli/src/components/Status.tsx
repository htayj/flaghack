import React from "react"
import { formatStatusLines, type World } from "../tuiGame.js"
import {
  STATUS_BOX_HEIGHT,
  STATUS_BOX_TOP,
  STATUS_BOX_WIDTH
} from "./layout.js"

type Props = {
  world: World
}

export default function Status({ world }: Props) {
  const content = formatStatusLines(world).join("\n")
  return (
    <box
      top={STATUS_BOX_TOP}
      left={0}
      border="line"
      height={STATUS_BOX_HEIGHT}
      width={STATUS_BOX_WIDTH}
      label="status"
    >
      {content}
    </box>
  )
}
