import type {
  Key as KeySchema,
  World as WorldSchema
} from "@flaghack/domain/schemas"
import { Map } from "immutable"
import React, { useCallback, useEffect, useMemo, useState } from "react"
import type { BoxElement, DetailedBlessedProps } from "react-blessed"

type Key = typeof KeySchema.Type
type World = typeof WorldSchema.Type
type Props = {
  items: World
  onSubmit: (keys: ReadonlyArray<Key>) => void
  onCancel: () => void
  boxRef: React.RefObject<BoxElement | null>
} & DetailedBlessedProps<BoxElement>

const controlKeys: Array<string> = ["q", "r", ",", "escape"]
const submitKeys: Array<string> = [" ", "space"]

export default function Popup(
  props: Props
) {
  const { boxRef, items, onCancel, onSubmit, ...boxProps } = props
  const [marked, setMarked] = useState<ReadonlySet<Key>>(() => new Set())
  const itemMap = useMemo(() => Map(items), [items])
  const markAll = useCallback(() => {
    setMarked(
      new Set(itemMap.valueSeq().toArray().map((item) => item.key))
    )
  }, [itemMap])

  useEffect(() => {
    const popup = boxRef.current
    if (!popup) {
      return undefined
    }

    const handleControlKey = (input: string) => {
      if (input === "q" || input === "r" || input === "escape") {
        setMarked(new Set())
        onCancel()
        return
      }

      if (input === ",") {
        markAll()
      }
    }

    popup.key(controlKeys, handleControlKey)

    return () => {
      for (const key of controlKeys) {
        popup.removeListener(`key ${key}`, handleControlKey)
      }
    }
  }, [boxRef, markAll, onCancel])

  useEffect(() => {
    setMarked(new Set())
  }, [items])

  useEffect(() => {
    const popup = boxRef.current
    if (!popup) {
      return undefined
    }

    const handleSubmitKey = (input: string) => {
      if (input === " " || input === "space") {
        const validMarked = Array.from(marked).filter((key) =>
          itemMap.has(key)
        )
        setMarked(new Set())
        onSubmit(validMarked)
      }
    }

    popup.key(submitKeys, handleSubmitKey)

    return () => {
      for (const key of submitKeys) {
        popup.removeListener(`key ${key}`, handleSubmitKey)
      }
    }
  }, [boxRef, itemMap, marked, onSubmit])

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
          key={item.key}
          top={i}
          height={1}
          style={{
            inverse: marked.has(item.key)
          }}
          left={1}
          width={27} // todo: actual width
          content={item._tag}
        />
      ))}
    </box>
  )
}
