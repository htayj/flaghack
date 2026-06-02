import { describe, expect, it } from "@effect/vitest"
import { HashMap } from "effect"
import { List } from "immutable"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import GameBoard, { type Tiles } from "../src/GameBoard.tsx"
import Inventory from "../src/Inventory.tsx"
import Messages, { MAX_VISIBLE_MESSAGES } from "../src/Messages.tsx"
import PickupPopup from "../src/PickupPopup.tsx"

const testDirectory = dirname(fileURLToPath(import.meta.url))
const srcDirectory = join(testDirectory, "../src")

const readSource = (fileName: string) =>
  readFileSync(join(srcDirectory, fileName), "utf8")

const sampleItem = {
  _tag: "poptart",
  key: "poptart-1",
  at: { x: 0, y: 0, z: 0 },
  in: "inventory"
} as const

const sampleWorld = HashMap.fromIterable([[sampleItem.key, sampleItem]])

const renderPickupPopup = (open: boolean) =>
  renderToStaticMarkup(
    React.createElement(PickupPopup, {
      items: sampleWorld,
      open,
      onCancel: () => undefined,
      onSubmit: () => undefined,
      pickupRef: React.createRef<HTMLElement | null>(),
      log: () => undefined
    })
  )

describe("web accessibility semantics", () => {
  it("keeps baseline semantics present in component source", () => {
    const gameBoardSource = readSource("GameBoard.tsx")
    const messagesSource = readSource("Messages.tsx")
    const inventorySource = readSource("Inventory.tsx")
    const pickupPopupSource = readSource("PickupPopup.tsx")

    expect(gameBoardSource).toContain("role=\"region\"")
    expect(gameBoardSource).toContain("aria-label=\"Game map\"")

    expect(messagesSource).toContain("role=\"log\"")
    expect(messagesSource).toContain("aria-live=\"polite\"")
    expect(messagesSource).toContain("aria-label=\"Messages\"")
    expect(messagesSource).toContain("role=\"list\"")
    expect(messagesSource).toContain("role=\"listitem\"")
    expect(messagesSource).toContain("MAX_VISIBLE_MESSAGES")
    expect(messagesSource).not.toContain("messages.join(")

    expect(inventorySource).toContain("<section")
    expect(inventorySource).toContain(
      "aria-labelledby=\"inventory-heading\""
    )
    expect(inventorySource).toContain("id=\"inventory-heading\"")
    expect(inventorySource).toContain("role=\"list\"")
    expect(inventorySource).toContain("role=\"listitem\"")
    expect(inventorySource).toContain("key={item.key}")

    expect(pickupPopupSource).toContain("role=\"dialog\"")
    expect(pickupPopupSource).toContain("aria-label=\"Pick up items\"")
    expect(pickupPopupSource).toContain("aria-hidden={!open}")
    expect(pickupPopupSource).toContain("role=\"list\"")
    expect(pickupPopupSource).toContain("role=\"listitem\"")
    expect(pickupPopupSource).not.toMatch(/\baria-modal\b/)
    expect(pickupPopupSource).not.toMatch(
      /role\s*=\s*["']listbox["']/
    )
  })

  it("renders the game map as a named region without changing map text", () => {
    const tiles: Tiles = [
      [{ char: "@", color: "white" }, { char: " ", color: "cyan" }],
      [{ char: ".", color: "yellow" }]
    ]
    const markup = renderToStaticMarkup(
      React.createElement(GameBoard, { tiles })
    )

    expect(markup).toContain("role=\"region\"")
    expect(markup).toContain("aria-label=\"Game map\"")
    expect(markup).toContain("@")
    expect(markup).toContain(" ")
    expect(markup).toContain(".")
  })

  it("renders messages as bounded list entries inside a polite log", () => {
    const markup = renderToStaticMarkup(
      React.createElement(Messages, { messages: List(["hello", "world"]) })
    )

    expect(markup).toContain("role=\"log\"")
    expect(markup).toContain("aria-live=\"polite\"")
    expect(markup).toContain("aria-label=\"Messages\"")
    expect(markup).toContain("role=\"list\"")
    expect(markup).toContain("role=\"listitem\"")
    expect(markup).toContain("hello")
    expect(markup).toContain("world")
    expect(markup).not.toContain("hello\nworld")
  })

  it("renders only the newest visible messages first", () => {
    const messages = List(
      Array.from(
        { length: MAX_VISIBLE_MESSAGES + 2 },
        (_, index) => `newest-${index}`
      )
    )
    const markup = renderToStaticMarkup(
      React.createElement(Messages, { messages })
    )

    const listItemCount = markup.match(/role="listitem"/g)?.length ?? 0
    expect(listItemCount).toBe(MAX_VISIBLE_MESSAGES)
    expect(markup).toContain("newest-0")
    expect(markup).toContain("newest-1")
    expect(markup).toContain(`newest-${MAX_VISIBLE_MESSAGES - 1}`)
    expect(markup.indexOf(">newest-0<")).toBeLessThan(
      markup.indexOf(">newest-1<")
    )
    expect(markup).not.toContain(`newest-${MAX_VISIBLE_MESSAGES}`)
    expect(markup).not.toContain(`newest-${MAX_VISIBLE_MESSAGES + 1}`)
  })

  it("renders inventory as a named region with list semantics", () => {
    const markup = renderToStaticMarkup(
      React.createElement(Inventory, { inventory: sampleWorld })
    )

    expect(markup).toContain("<section")
    expect(markup).toContain("aria-labelledby=\"inventory-heading\"")
    expect(markup).toContain("id=\"inventory-heading\"")
    expect(markup).toContain("role=\"list\"")
    expect(markup).toContain("role=\"listitem\"")
    expect(markup).toContain("INVENTORY")
    expect(markup).toContain(sampleItem._tag)
  })

  it("renders pickup popup dialog/list semantics while preserving display state", () => {
    const openMarkup = renderPickupPopup(true)
    const closedMarkup = renderPickupPopup(false)

    expect(openMarkup).toContain("role=\"dialog\"")
    expect(openMarkup).toContain("aria-label=\"Pick up items\"")
    expect(openMarkup).toContain("aria-hidden=\"false\"")
    expect(openMarkup).toContain("role=\"list\"")
    expect(openMarkup).toContain("role=\"listitem\"")
    expect(openMarkup).toContain(sampleItem._tag)
    expect(openMarkup).toMatch(/style="[^"]*display:inherit/)

    expect(closedMarkup).toContain("aria-hidden=\"true\"")
    expect(closedMarkup).toContain(sampleItem._tag)
    expect(closedMarkup).toMatch(/style="[^"]*display:none/)

    expect(openMarkup).not.toContain("aria-modal")
    expect(closedMarkup).not.toContain("aria-modal")
    expect(openMarkup).not.toContain("role=\"listbox\"")
    expect(closedMarkup).not.toContain("role=\"listbox\"")
  })
})
