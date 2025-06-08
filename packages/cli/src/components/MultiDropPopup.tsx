import { Key, World } from "@flaghack/domain/schemas"
import { HashMap } from "effect"
import React from "react"
import { BoxElement } from "react-blessed"
import Popup from "./popup.js"

type Key = typeof Key.Type
type World = typeof World.Type
type Props = {
  world: World
  onDrop: (keys: Key[]) => void
  onCancel: () => void
  dropRef: React.RefObject<BoxElement | null>
}

export default function MultiDropPopup(
  { world, dropRef, onCancel, onDrop }: Props
) {
  // const player = world.pipe(HashMap.get("player")) // todo: use a real id for player
  const itemsHeld = world.pipe(HashMap.filter((e) => e.in === "player"))
  return (
    <Popup
      boxRef={dropRef}
      items={itemsHeld}
      onSubmit={onDrop}
      onCancel={onCancel}
      label={"Drop What?"}
    />
  )
}

// bottom={5}
// left={5}
// border="line"
// height={10}
// width={30}
// label="pickup what?"
