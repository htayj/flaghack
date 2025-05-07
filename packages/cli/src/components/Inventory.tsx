import { Entity } from "@flaghack/domain/schemas"
import { Map } from "immutable"
import React from "react"

type Props = {
  inventory: Map<string, typeof Entity>
}

export default function Inventory({ inventory }: Props) {
  return (
    <box height={22} width={15}>
      <box top={0} height={1}>INVENTORY</box>
      {inventory.valueSeq().toArray().map((item, i) => (
        <box key={i}>
          {item.name}
        </box>
      ))}
    </box>
  )
}
