import type {
  Key as KeySchema,
  World as WorldSchema
} from "@flaghack/domain/schemas"
import { HashMap } from "effect"
import React from "react"
import type { BoxElement } from "react-blessed"
import Popup from "./popup.js"

type Key = typeof KeySchema.Type
type World = typeof WorldSchema.Type
type Props = {
  world: World
  onDrop: (keys: ReadonlyArray<Key>) => void
  onCancel: () => void
  dropRef: React.RefObject<BoxElement | null>
}

export default function MultiDropPopup(
  { dropRef, onCancel, onDrop, world }: Props
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
