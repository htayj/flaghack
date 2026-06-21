import type {
  Key as KeySchema,
  World as WorldSchema
} from "@flaghack/domain/schemas"
import { Map } from "immutable"
import React, { useCallback, useEffect, useMemo, useState } from "react"
import type { BoxElement } from "react-blessed"
import { MESSAGE_LOG_HEIGHT, PLAY_AREA_HEIGHT } from "./layout.js"

type Key = typeof KeySchema.Type
type World = typeof WorldSchema.Type
type LootMode = "take" | "put"

type Props = {
  containerName: string
  takeItems: World
  putItems: World
  onTake: (keys: ReadonlyArray<Key>) => void
  onPut: (keys: ReadonlyArray<Key>) => void
  onCancel: () => void
  lootRef: React.RefObject<BoxElement | null>
}

const controlKeys: Array<string> = ["q", "r", ",", "t", "p", "escape"]
const submitKeys: Array<string> = [" ", "space"]

export default function LootPopup(
  {
    containerName,
    lootRef,
    onCancel,
    onPut,
    onTake,
    putItems,
    takeItems
  }: Props
) {
  const [mode, setMode] = useState<LootMode>("take")
  const [marked, setMarked] = useState<ReadonlySet<Key>>(() => new Set())
  const itemMap = useMemo(
    () => Map(mode === "take" ? takeItems : putItems),
    [mode, putItems, takeItems]
  )
  const markAll = useCallback(() => {
    setMarked(
      new Set(itemMap.valueSeq().toArray().map((item) => item.key))
    )
  }, [itemMap])

  useEffect(() => {
    setMarked(new Set())
  }, [mode, putItems, takeItems])

  useEffect(() => {
    const popup = lootRef.current
    if (!popup) {
      return undefined
    }

    const handleControlKey = (input: string) => {
      if (input === "q" || input === "r" || input === "escape") {
        setMarked(new Set())
        onCancel()
        return
      }

      if (input === "t") {
        setMode("take")
        return
      }

      if (input === "p") {
        setMode("put")
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
  }, [lootRef, markAll, onCancel])

  useEffect(() => {
    const popup = lootRef.current
    if (!popup) {
      return undefined
    }

    const handleSubmitKey = (input: string) => {
      if (input === " " || input === "space") {
        const validMarked = Array.from(marked).filter((key) =>
          itemMap.has(key)
        )
        setMarked(new Set())
        if (mode === "take") {
          onTake(validMarked)
        } else {
          onPut(validMarked)
        }
      }
    }

    popup.key(submitKeys, handleSubmitKey)

    return () => {
      for (const key of submitKeys) {
        popup.removeListener(`key ${key}`, handleSubmitKey)
      }
    }
  }, [itemMap, lootRef, marked, mode, onPut, onTake])

  const emptyLabel = mode === "take" ? "(empty)" : "(inventory empty)"

  return (
    <box
      ref={lootRef}
      top={MESSAGE_LOG_HEIGHT}
      right={0}
      border="line"
      height={PLAY_AREA_HEIGHT}
      width={15}
      label={`loot ${containerName}`}
    >
      <box
        top={0}
        left={1}
        height={1}
        width={13}
        content={mode === "take" ? "take" : "put"}
      />
      <box
        top={1}
        left={1}
        height={1}
        width={13}
        content="t take p put"
      />
      {itemMap.size === 0
        ? (
          <box
            top={2}
            left={1}
            height={1}
            width={13}
            content={emptyLabel}
          />
        )
        : itemMap.valueSeq().toArray().map((item, i) => (
          <box
            key={item.key}
            top={i + 2}
            height={1}
            style={{
              inverse: marked.has(item.key)
            }}
            left={1}
            width={13}
            content={item._tag}
          />
        ))}
    </box>
  )
}
