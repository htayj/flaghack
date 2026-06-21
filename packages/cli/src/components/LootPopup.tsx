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
type LootMode = "take" | "put"
type LootStage = "action" | "items"

type Props = {
  containerName: string
  takeItems: World
  putItems: World
  promptSerial: number
  onTake: (keys: ReadonlyArray<Key>) => void
  onPut: (keys: ReadonlyArray<Key>) => void
  onCancel: () => void
  lootRef: React.RefObject<BoxElement | null>
}

const controlKeys: Array<string> = ["q", "r", ",", "escape"]
const actionKeys: Array<string> = ["t", "p"]
const submitKeys: Array<string> = [" ", "space"]

export default function LootPopup(
  {
    containerName,
    lootRef,
    onCancel,
    onPut,
    onTake,
    promptSerial,
    putItems,
    takeItems
  }: Props
) {
  const [stage, setStage] = useState<LootStage>("action")
  const [mode, setMode] = useState<LootMode>("take")
  const [marked, setMarked] = useState<ReadonlySet<Key>>(() => new Set())
  const itemMap = useMemo(
    () => Map(mode === "take" ? takeItems : putItems),
    [mode, putItems, takeItems]
  )
  const itemList = useMemo(() => itemMap.valueSeq().toArray(), [itemMap])
  const letterKeys = useMemo(() => itemLetterKeys(), [])
  const markAll = useCallback(() => {
    setMarked(new Set(itemList.map((item) => item.key)))
  }, [itemList])

  useEffect(() => {
    setStage("action")
    setMode("take")
    setMarked(new Set())
  }, [promptSerial])

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

      if (input === "," && stage === "items") {
        markAll()
      }
    }

    popup.key(controlKeys, handleControlKey)

    return () => {
      for (const key of controlKeys) {
        popup.removeListener(`key ${key}`, handleControlKey)
      }
    }
  }, [lootRef, markAll, onCancel, stage])

  useEffect(() => {
    const popup = lootRef.current
    if (!popup) {
      return undefined
    }

    const handleActionKey = (input: string) => {
      if (stage !== "action") return
      if (input === "t") {
        setMode("take")
        setMarked(new Set())
        setStage("items")
      }
      if (input === "p") {
        setMode("put")
        setMarked(new Set())
        setStage("items")
      }
    }

    popup.key(actionKeys, handleActionKey)

    return () => {
      for (const key of actionKeys) {
        popup.removeListener(`key ${key}`, handleActionKey)
      }
    }
  }, [lootRef, stage])

  useEffect(() => {
    const popup = lootRef.current
    if (!popup) {
      return undefined
    }

    const handleSubmitKey = (input: string) => {
      if (stage === "items" && (input === " " || input === "space")) {
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
  }, [itemMap, lootRef, marked, mode, onPut, onTake, stage])

  useEffect(() => {
    const popup = lootRef.current
    if (!popup) {
      return undefined
    }

    const handleLetterKey = (input: string) => {
      if (stage !== "items") return
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
  }, [itemList, letterKeys, lootRef, stage])

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
      {stage === "action"
        ? (
          <>
            <box
              top={0}
              left={1}
              height={1}
              width={13}
              content="choose action"
            />
            <box
              top={1}
              left={1}
              height={1}
              width={13}
              content="t - take"
            />
            <box
              top={2}
              left={1}
              height={1}
              width={13}
              content="p - put"
            />
          </>
        )
        : (
          <>
            <box
              top={0}
              left={1}
              height={1}
              width={13}
              content={mode === "take" ? "take" : "put"}
            />
            {itemMap.size === 0
              ? (
                <box
                  top={1}
                  left={1}
                  height={1}
                  width={13}
                  content={emptyLabel}
                />
              )
              : assignItemLetters(itemList).map((entry, i) => (
                <box
                  key={entry.item.key}
                  top={i + 1}
                  height={1}
                  style={{
                    inverse: marked.has(entry.item.key)
                  }}
                  left={1}
                  width={13}
                  content={renderItemLabel(entry)}
                />
              ))}
          </>
        )}
    </box>
  )
}
