import type { Entity as EntitySchema } from "@flaghack/domain/schemas"
import { HashMap } from "effect"
import { createRequire } from "node:module"
import { resolveCliDebugMessages } from "./config.js"
import {
  AlternateTuiController,
  type AlternateTuiSnapshot
} from "./tuiController.js"
import { drawWorld } from "./tuiGame.js"

type Entity = typeof EntitySchema.Type
type KeyListener = (
  name: string,
  matches: ReadonlyArray<string>,
  data: unknown
) => void
type ResizeListener = (width: number, height: number) => void
type Terminal = {
  readonly height: number
  readonly width: number
  (text?: string, ...args: ReadonlyArray<unknown>): Terminal
  clear(): Terminal
  eraseLine(): Terminal
  fullscreen(enabled?: boolean): Terminal
  grabInput(
    options: boolean | {
      readonly focus?: boolean
      readonly mouse?: string
    }
  ): Terminal
  hideCursor(enabled?: boolean): Terminal
  moveTo(
    x: number,
    y: number,
    text?: string,
    ...args: ReadonlyArray<unknown>
  ): Terminal
  off(event: "key", listener: KeyListener): Terminal
  off(event: "resize", listener: ResizeListener): Terminal
  on(event: "key", listener: KeyListener): Terminal
  on(event: "resize", listener: ResizeListener): Terminal
  processExit(code?: number): never
  styleReset(): Terminal
}
type TerminalKitModule = {
  readonly terminal: Terminal
}

const require = createRequire(import.meta.url)
const terminalKit = require("terminal-kit") as TerminalKitModule

const term = terminalKit.terminal

const entityList = (
  world: AlternateTuiSnapshot["inventory"]
): ReadonlyArray<Entity> => Array.from(world.pipe(HashMap.values))

const truncate = (value: string, width: number): string =>
  value.length <= width ? value : value.slice(0, Math.max(0, width - 1))

const line = (
  x: number,
  y: number,
  text: string,
  width = term.width - x + 1
) => {
  term.moveTo(x, y, truncate(text, width).padEnd(width, " "))
}

export const normalizeTerminalKitInput = (name: string): string => {
  if (name === "ENTER" || name === "KP_ENTER") return "enter"
  if (name === "ESCAPE") return "escape"
  if (name === "BACKSPACE" || name === "DELETE") return "C-h"
  if (name === "SPACE") return " "

  const ctrlMatch = /^CTRL_([A-Z])$/u.exec(name)
  if (ctrlMatch?.[1] !== undefined) {
    return `C-${ctrlMatch[1].toLowerCase()}`
  }

  return name.length === 1 ? name : name.toLowerCase()
}

const renderInventory = (snapshot: AlternateTuiSnapshot) => {
  const x = 84
  line(x, 2, "inventory", 24)
  const inventory = entityList(snapshot.inventory)
  if (inventory.length === 0) {
    line(x, 3, "(empty)", 24)
    return
  }
  inventory.slice(0, 16).forEach((item, index) => {
    line(x, 3 + index, item._tag, 24)
  })
}

const renderMessages = (snapshot: AlternateTuiSnapshot) => {
  const y = 24
  line(1, y, "messages")
  snapshot.messages.slice(0, 10).forEach((message, index) => {
    line(1, y + 1 + index, message)
  })
}

const renderPopup = (snapshot: AlternateTuiSnapshot) => {
  const popup = snapshot.popup
  if (popup === undefined) return

  const y = 15
  line(84, y, popup.title, 32)
  line(84, y + 1, ", marks all; space submits", 32)
  line(84, y + 2, "q/r/Esc cancels", 32)
  if (popup.items.length === 0) {
    line(84, y + 3, "(nothing available)", 32)
    return
  }
  popup.items.slice(0, 10).forEach((item, index) => {
    const mark = popup.marked.has(item.key) ? "*" : " "
    line(84, y + 3 + index, `${mark} ${item._tag}`, 32)
  })
}

const renderSnapshot = (snapshot: AlternateTuiSnapshot) => {
  term.clear()
  line(
    1,
    1,
    "Flag Hack terminal-kit UI · hjklyubn move · Shift/Ctrl/g/G/m/M run · _ travel · , pickup · d drop · #quit"
  )

  const tiles = drawWorld(snapshot.world, snapshot.travelTarget)
  tiles.forEach((row, index) => {
    line(1, 2 + index, row.map((tile) => tile.char).join(""), 80)
  })

  renderInventory(snapshot)
  renderPopup(snapshot)
  renderMessages(snapshot)
}

let cleanedUp = false
let latestSnapshot: AlternateTuiSnapshot | undefined

const cleanup = () => {
  if (cleanedUp) return
  cleanedUp = true
  term.grabInput(false)
  term.hideCursor(false)
  term.styleReset()
}

const exit = () => {
  cleanup()
  process.exit(0)
}

const controller = new AlternateTuiController({
  debugMessages: resolveCliDebugMessages(
    process.argv.slice(2),
    process.env
  ),
  onQuit: exit
})

const keyListener: KeyListener = (name) => {
  if (name === "CTRL_C") {
    exit()
    return
  }
  controller.handleInput(normalizeTerminalKitInput(name))
}

const resizeListener: ResizeListener = () => {
  if (latestSnapshot !== undefined) {
    renderSnapshot(latestSnapshot)
  }
}

term.hideCursor(true)
term.grabInput({ focus: true })
term.on("key", keyListener)
term.on("resize", resizeListener)
process.once("exit", cleanup)

controller.subscribe((snapshot) => {
  latestSnapshot = snapshot
  renderSnapshot(snapshot)
})
controller.start()
