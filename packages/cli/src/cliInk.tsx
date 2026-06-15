import type { Entity as EntitySchema } from "@flaghack/domain/schemas"
import { HashMap } from "effect"
import { Box, render, Text, useApp, useInput } from "ink"
import React, { useEffect, useMemo, useState } from "react"
import {
  AlternateTuiController,
  type AlternateTuiSnapshot
} from "./tuiController.js"
import { drawWorld } from "./tuiGame.js"

type Entity = typeof EntitySchema.Type

type InkKey = {
  readonly backspace?: boolean | undefined
  readonly ctrl?: boolean | undefined
  readonly escape?: boolean | undefined
  readonly return?: boolean | undefined
}

const entityList = (
  world: AlternateTuiSnapshot["inventory"]
): ReadonlyArray<Entity> => Array.from(world.pipe(HashMap.values))

export const normalizeInkInput = (input: string, key: InkKey): string => {
  if (key.escape === true) return "escape"
  if (key.return === true) return "enter"
  if (key.backspace === true) return "C-h"
  if (key.ctrl === true && input.length === 1) {
    return `C-${input.toLowerCase()}`
  }
  return input
}

const Board = (
  { snapshot }: { readonly snapshot: AlternateTuiSnapshot }
) => {
  const tiles = drawWorld(snapshot.world, snapshot.travelTarget)
  return (
    <Box flexDirection="column">
      {tiles.map((row, y) => (
        <Text key={y}>{row.map((tile) => tile.char).join("")}</Text>
      ))}
    </Box>
  )
}

const Inventory = (
  { snapshot }: { readonly snapshot: AlternateTuiSnapshot }
) => {
  const inventory = entityList(snapshot.inventory)
  return (
    <Box
      borderStyle="single"
      flexDirection="column"
      marginLeft={2}
      minWidth={18}
      paddingX={1}
    >
      <Text bold>inventory</Text>
      {inventory.length === 0
        ? <Text dimColor>(empty)</Text>
        : inventory.map((item) => <Text key={item.key}>{item._tag}</Text>)}
    </Box>
  )
}

const Messages = (
  { snapshot }: { readonly snapshot: AlternateTuiSnapshot }
) => (
  <Box borderStyle="single" flexDirection="column" paddingX={1}>
    {snapshot.messages.slice(0, 10).map((message, index) => (
      <Text key={`${index}:${message}`}>{message}</Text>
    ))}
  </Box>
)

const Popup = (
  { snapshot }: { readonly snapshot: AlternateTuiSnapshot }
) => {
  const popup = snapshot.popup
  if (popup === undefined) return null

  return (
    <Box
      borderStyle="round"
      flexDirection="column"
      marginTop={1}
      paddingX={1}
    >
      <Text bold>{popup.title}</Text>
      <Text dimColor>, marks all, space submits, q/r/Esc cancels</Text>
      {popup.items.length === 0
        ? <Text dimColor>(nothing available)</Text>
        : popup.items.map((item) => (
          <Text key={item.key} inverse={popup.marked.has(item.key)}>
            {popup.marked.has(item.key) ? "* " : "  "}
            {item._tag}
          </Text>
        ))}
    </Box>
  )
}

const Controls = () => (
  <Text dimColor>
    hjklyubn move · Shift-dir/Ctrl-dir/g/G/m/M run variants · _ travel · ,
    pickup · d drop · #quit
  </Text>
)

const App = () => {
  const { exit } = useApp()
  const controller = useMemo(
    () => new AlternateTuiController({ onQuit: () => exit() }),
    [exit]
  )
  const [snapshot, setSnapshot] = useState<AlternateTuiSnapshot>(() =>
    controller.snapshot()
  )

  useEffect(() => {
    const unsubscribe = controller.subscribe(setSnapshot)
    controller.start()
    return unsubscribe
  }, [controller])

  useInput((input, key) => {
    if (key.ctrl === true && input === "c") {
      exit()
      return
    }
    controller.handleInput(normalizeInkInput(input, key))
  })

  return (
    <Box flexDirection="column">
      <Controls />
      <Box flexDirection="row">
        <Board snapshot={snapshot} />
        <Inventory snapshot={snapshot} />
      </Box>
      <Popup snapshot={snapshot} />
      <Messages snapshot={snapshot} />
    </Box>
  )
}

render(<App />)
