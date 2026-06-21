import type {
  Key as KeySchema,
  World as WorldSchema
} from "@flaghack/domain/schemas"
import { Map } from "immutable"
import React, { useCallback, useEffect, useMemo, useState } from "react"
import type { BoxElement } from "react-blessed"
import {
  assignItemLetters,
  itemLetterKeys,
  renderItemLabel,
  toggleLetterSelection
} from "./itemLetters.js"
import { MESSAGE_LOG_HEIGHT, PLAY_AREA_HEIGHT } from "./layout.js"

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
  const itemList = useMemo(() => invMap.valueSeq().toArray(), [invMap])
  const letterKeys = useMemo(() => itemLetterKeys(), [])
  const markAll = useCallback(() => {
    setMarked(new Set(itemList.map((item) => item.key)))
  }, [itemList])

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

  useEffect(() => {
    const popup = pickupRef.current
    if (!popup) {
      return undefined
    }

    const handleLetterKey = (input: string) => {
      setMarked((current) =>
        toggleLetterSelection(itemList, current, input)
      )
    }

    popup.key(letterKeys, handleLetterKey)

    return () => {
      for (const key of letterKeys) {
        popup.removeListener(`key ${key}`, handleLetterKey)
      }
    }
  }, [itemList, letterKeys, pickupRef])

  return (
    <box
      ref={pickupRef}
      top={MESSAGE_LOG_HEIGHT}
      right={0}
      border="line"
      height={PLAY_AREA_HEIGHT}
      width={15}
      label="pickup what?"
    >
      {assignItemLetters(itemList).map((entry, i) => (
        <box
          key={entry.item.key}
          top={i}
          height={1}
          style={{
            inverse: marked.has(entry.item.key)
          }}
          left={1}
          width={13}
          content={renderItemLabel(entry)}
        />
      ))}
    </box>
  )
}
