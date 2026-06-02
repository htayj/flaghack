import type { World as WorldSchema } from "@flaghack/domain/schemas"
import { Map } from "immutable"

type World = typeof WorldSchema.Type
type Props = {
  inventory: World
}

export default function Inventory({ inventory }: Props) {
  const invMap = Map(inventory)
  return (
    <section
      aria-labelledby="inventory-heading"
      style={{
        position: "absolute",
        right: 0,
        bottom: 0,
        border: "solid",
        width: "20em",
        height: "30em"
      }}
    >
      <h2
        id="inventory-heading"
        style={{ fontSize: "inherit", fontWeight: "inherit", margin: 0 }}
      >
        INVENTORY
      </h2>
      <div role="list">
        {invMap.valueSeq().toArray().map((item) => (
          <div role="listitem" style={{ display: "block" }} key={item.key}>
            {item._tag}
          </div>
        ))}
      </div>
    </section>
  )
}
