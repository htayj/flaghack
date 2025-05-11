import { Key, World } from "@flaghack/domain/schemas"
// import { HashMap } from "effect"
import { Map } from "immutable"
import React, { useCallback, useEffect, useMemo, useState } from "react"
import { BoxElement } from "react-blessed"

type Key = typeof Key.Type
type World = typeof World.Type
type Props = {
  items: World
  onSubmit: (keys: Key[]) => void
  onCancel: () => void
  pickupRef: React.RefObject<BoxElement | null>
  log: (l: string) => void
}

export default function PickupPopup(
  { items, pickupRef, onCancel, onSubmit, log }: Props
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
  useEffect(() => {
    ;["q", "r", ","].forEach((key) =>
      pickupRef.current?.unkey(
        key,
        () => undefined
      )
    )
    pickupRef.current?.key(
      ["q", "r", ","],
      (input: string) => {
        if (["q", "r"].includes(input)) {
          setMarked([])
          onCancel()
        } else if ([" ", "space"].includes(input)) {
          onSubmit(marked)
        } else if ([","].includes(input)) markAll()
        else {
        }
      }
    )
  }, [invMap])
  useEffect(() => {
    ;[" ", "space"].forEach((key) =>
      pickupRef.current?.unkey(
        key,
        () => undefined
      )
    )
    pickupRef.current?.key(
      [" ", "space"],
      (input: string) => {
        if ([" ", "space"].includes(input)) {
          onSubmit(marked)
        }
      }
    )
  }, [marked])
  return (
    <box
      ref={pickupRef}
      bottom={20}
      right={0}
      border="line"
      height={22}
      width={15}
      label="pickup what?"
    >
      {invMap.valueSeq().toArray().map((item, i) => (
        <box
          key={i}
          top={i}
          height={1}
          left={1}
          width={"100%"}
        >
          {(marked?.includes(item.key) ? "***" : " ") + item._tag
            + item.key.slice(0, 2)}
        </box>
      ))}
      <box bottom={1} height={3} width={"100%"}>
        {marked.map((k) => k.slice(0, 2)).join("\n")}
      </box>
    </box>
  )
}
