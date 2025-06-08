import { Key, World } from "@flaghack/domain/schemas"
// import { HashMap } from "effect"
import { Map } from "immutable"
import React, { useCallback, useEffect, useMemo, useState } from "react"
import { BoxElement, DetailedBlessedProps } from "react-blessed"

type Key = typeof Key.Type
type World = typeof World.Type
type Props = {
  items: World
  onSubmit: (keys: Key[]) => void
  onCancel: () => void
  boxRef: React.RefObject<BoxElement | null>
} & DetailedBlessedProps<BoxElement>

export default function Popup(
  props: Props
) {
  const { items, onSubmit, onCancel, boxRef, ...boxProps } = props
  const [marked, setMarked] = useState<Key[]>(["asdf"])
  const itemMap = useMemo(() => Map(items), [items])
  const markAll = useCallback(() =>
    setMarked(
      () => {
        const values = itemMap.valueSeq()
        const arr = values.toArray().map((e) => e.key)
        return arr
      }
    ), [marked, itemMap, setMarked])
  useEffect(() => {
    ;["q", "r", ","].forEach((key) =>
      boxRef.current?.unkey(
        key,
        () => undefined
      )
    )
    boxRef.current?.key(
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
  }, [itemMap])
  useEffect(() => {
    ;[" ", "space"].forEach((key) =>
      boxRef.current?.unkey(
        key,
        () => undefined
      )
    )
    boxRef.current?.key(
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
      ref={boxRef}
      bottom={5}
      left={5}
      border="line"
      height={10}
      width={30}
      label="pickup what?"
      {...boxProps}
    >
      {itemMap.valueSeq().toArray().map((item, i) => (
        <box
          key={i}
          top={i}
          height={1}
          style={{
            inverse: marked?.includes(item.key)
          }}
          left={1}
          width={27} // todo: actual width
          content={item._tag}
        />
      ))}
    </box>
  )
}
