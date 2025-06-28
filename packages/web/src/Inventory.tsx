import { World } from "@flaghack/domain/schemas"
import { Map } from "immutable"
// @ts-ignore
import React from "react"

type World = typeof World.Type
type Props = {
  inventory: World
}

export default function Inventory({ inventory }: Props) {
  const invMap = Map(inventory)
  return (
    <div
      style={{
        right: 0,
        bottom: 0,
        border: "solid",
        height: 22,
        width: 22
      }}
    >
      {invMap.valueSeq().toArray().map((item, i) => (
        <div style={{ display: "block" }} key={i}>
          {item._tag}
        </div>
      ))}
    </div>
  )
}
