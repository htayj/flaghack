import type { World as WorldSchema } from "@flaghack/domain/schemas"
import { Map } from "immutable"

type World = typeof WorldSchema.Type
type Props = {
  inventory: World
}

export default function Inventory({ inventory }: Props) {
  const invMap = Map(inventory)
  return (
    <div
      style={{
        position: "absolute",
        right: 0,
        bottom: 0,
        border: "solid",
        width: "20em",
        height: "30em"
      }}
    >
      INVENTORY
      {invMap.valueSeq().toArray().map((item) => (
        <div style={{ display: "block" }} key={item.key}>
          {item._tag}
        </div>
      ))}
    </div>
  )
}
