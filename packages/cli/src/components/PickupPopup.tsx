import type {
  Key as KeySchema,
  World as WorldSchema
} from "@flaghack/domain/schemas"
import { Map } from "immutable"
import React, { useCallback, useEffect, useMemo, useState } from "react"
import type { BoxElement } from "react-blessed"

type Key = typeof KeySchema.Type
type World = typeof WorldSchema.Type
type Props = {
  items: World
  onSubmit: (keys: ReadonlyArray<Key>) => void
  onCancel: () => void
  pickupRef: React.RefObject<BoxElement | null>
  log: (l: string) => void
}

const controlKeys: Array<string> = ["q", "r", ",", "escape"]
const submitKeys: Array<string> = [" ", "space"]

export default function PickupPopup(
  { items, log: _log, onCancel, onSubmit, pickupRef }: Props
) {
  const [marked, setMarked] = useState<ReadonlySet<Key>>(() => new Set())
  const invMap = useMemo(() => Map(items), [items])
  const markAll = useCallback(() => {
    setMarked(
      new Set(invMap.valueSeq().toArray().map((item) => item.key))
    )
  }, [invMap])

  useEffect(() => {
    const popup = pickupRef.current
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
  }, [markAll, onCancel, pickupRef])

  useEffect(() => {
    setMarked(new Set())
  }, [items])

  useEffect(() => {
    const popup = pickupRef.current
    if (!popup) {
      return undefined
    }

    const handleSubmitKey = (input: string) => {
      if (input === " " || input === "space") {
        const validMarked = Array.from(marked).filter((key) =>
          invMap.has(key)
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
  }, [invMap, marked, onSubmit, pickupRef])

  return (
    <box
      ref={pickupRef}
      bottom={5}
      left={5}
      border="line"
      height={10}
      width={30}
      label="pickup what?"
    >
      {invMap.valueSeq().toArray().map((item, i) => (
        <box
          key={item.key}
          top={i}
          height={1}
          style={{
            inverse: marked.has(item.key)
          }}
          left={1}
          width={27}
          content={item._tag}
        />
      ))}
    </box>
  )
}
