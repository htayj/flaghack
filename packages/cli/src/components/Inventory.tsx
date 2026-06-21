import type { World as WorldSchema } from "@flaghack/domain/schemas"
import { Map } from "immutable"
import React from "react"
import { assignItemLetters, renderItemLabel } from "./itemLetters.js"
import { MESSAGE_LOG_HEIGHT, PLAY_AREA_HEIGHT } from "./layout.js"

type World = typeof WorldSchema.Type
type Props = {
  inventory: World
}

export default function Inventory({ inventory }: Props) {
  const invMap = Map(inventory)
  return (
    <box
      top={MESSAGE_LOG_HEIGHT}
      right={0}
      border="line"
      height={PLAY_AREA_HEIGHT}
      width={15}
      label="inventory"
    >
      {assignItemLetters(invMap.valueSeq().toArray()).map((entry, i) => (
        <box key={entry.item.key} top={i}>
          {renderItemLabel(entry)}
        </box>
      ))}
    </box>
  )
}
