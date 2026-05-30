import { Key, World } from "@flaghack/domain/schemas"
// import { HashMap } from "effect"
import { Map } from "immutable"
import React, { useCallback, useMemo, useState } from "react"

type Key = typeof Key.Type
type World = typeof World.Type
type Props = {
  items: World
  open: boolean
  onSubmit: (keys: Key[]) => void
  onCancel: () => void
  pickupRef: React.RefObject<HTMLElement | null>
  log: (l: string) => void
}

export default function PickupPopup(
  { items, onCancel, onSubmit, open }: Props
) {
  const [marked, setMarked] = useState<ReadonlySet<Key>>(
    () => new Set<Key>()
  )
  const invMap = useMemo(() => Map(items), [items])
  const markAll = useCallback(() =>
    setMarked(
      () =>
        new Set<Key>(
          invMap.valueSeq().toArray().map((e) => e.key)
        )
    ), [invMap])
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === " ") {
      onSubmit(Array.from(marked))
      return
    }
    if (event.key.toLowerCase() === "q") {
      onCancel()
      return
    }
    if (event.key === ",") {
      markAll()
    }
  }
  return (
    <div
      style={{
        position: "absolute",
        left: "25vw",
        right: "55vw",
        top: "25vh",
        bottom: "55vh",
        border: "solid",
        display: open ? "inherit" : "none"
      }}
      onKeyDown={handleKeyDown}
    >
      {invMap.valueSeq().toArray().map((item) => (
        <div
          key={item.key}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            height: "100%",
            width: "100%",
            background: marked.has(item.key) ? "#aaa" : "#000"
          }}
        >
          {item._tag}
        </div>
      ))}
    </div>
  )
}
