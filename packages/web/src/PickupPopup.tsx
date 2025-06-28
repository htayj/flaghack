import { Key, World } from "@flaghack/domain/schemas"
import { Match } from "effect"
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
  const [marked, setMarked] = useState<Key[]>(["asdf"])
  const invMap = useMemo(() => Map(items), [items])
  const markAll = useCallback(() =>
    setMarked(
      () => {
        const values = invMap.valueSeq()
        const arr = values.toArray().map((e) => e.key)
        return arr
      }
    ), [marked, invMap, setMarked])
  // FIXME
  const handleKeyDown = (event: any) =>
    Match.value(event.keyCode).pipe(
      Match.when(32, () => onSubmit(marked)), // space
      Match.when(81, () => onCancel()), // q
      Match.when(188, () => markAll()) // ,
    )
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
      {invMap.valueSeq().toArray().map((item, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            height: "100%",
            width: "100%",
            background: marked?.includes(item.key) ? "#aaa" : "#000"
          }}
          content={item._tag}
        />
      ))}
    </div>
  )
}
