import { World } from "@flaghack/domain/schemas"
import { Map } from "immutable"
import React from "react"

type World = typeof World.Type
type Props = {
  inventory: World
}

export default function Inventory({ inventory }: Props) {
  const invMap = Map(inventory)
  return (
    <box
      bottom={0}
      right={0}
      border="line"
      height={22}
      width={15}
      label="inventory"
    >
      {invMap.valueSeq().toArray().map((item, i) => (
        <box key={i}>
          {item._tag}
        </box>
      ))}
    </box>
  )
}
