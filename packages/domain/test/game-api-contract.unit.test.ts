import { describe, expect, it } from "@effect/vitest"
import { readFileSync } from "node:fs"

const readGameApiSource = (): string =>
  readFileSync(new URL("../src/GameApi.ts", import.meta.url), "utf8")

const endpointBlock = (
  source: string,
  endpointName: string,
  method: "get" | "post" = "get"
): string => {
  const compactStart = source.indexOf(
    `HttpApiEndpoint.${method}("${endpointName}"`
  )
  const multilineStart = source.indexOf(
    `HttpApiEndpoint.${method}(\n      "${endpointName}"`
  )
  const endpointStart = compactStart >= 0 ? compactStart : multilineStart

  expect(endpointStart).toBeGreaterThanOrEqual(0)

  const nextEndpointStart = source.indexOf("\n  .add(", endpointStart + 1)
  const apiClassStart = source.indexOf("\n{}", endpointStart)
  const endpointEnd = nextEndpointStart === -1
    ? apiClassStart
    : nextEndpointStart

  expect(endpointEnd).toBeGreaterThan(endpointStart)

  return source.slice(endpointStart, endpointEnd)
}

describe("GameApi item-list success contracts", () => {
  it("keeps getWorld on the full World schema", () => {
    const block = endpointBlock(readGameApiSource(), "getWorld")

    expect(block).toMatch(/\.addSuccess\(\s*World\s*\)/)
  })

  it("narrows getInventory success to ItemCollection", () => {
    const block = endpointBlock(readGameApiSource(), "getInventory")

    expect(block).toMatch(/\.addSuccess\(\s*ItemCollection\s*\)/)
    expect(block).not.toMatch(/\.addSuccess\(\s*World\s*\)/)
  })

  it("adds a bounded client-state endpoint without changing full getWorld", () => {
    const block = endpointBlock(readGameApiSource(), "getClientState")

    expect(block).toMatch(/\/client-state/)
    expect(block).toMatch(/\.addSuccess\(\s*ClientState\s*\)/)
  })

  it("narrows getPickupItemsFor success to ItemCollection", () => {
    const block = endpointBlock(readGameApiSource(), "getPickupItemsFor")

    expect(block).toMatch(/\.addSuccess\(\s*ItemCollection\s*\)/)
    expect(block).not.toMatch(/\.addSuccess\(\s*World\s*\)/)
  })

  it("narrows loot query success contracts to container and item collections", () => {
    const containersBlock = endpointBlock(
      readGameApiSource(),
      "getLootContainersFor"
    )
    const itemsBlock = endpointBlock(
      readGameApiSource(),
      "getLootItemsFor"
    )

    expect(containersBlock).toMatch(
      /\.addSuccess\(\s*ContainerCollection\s*\)/
    )
    expect(containersBlock).not.toMatch(/\.addSuccess\(\s*World\s*\)/)
    expect(itemsBlock).toMatch(/\.addSuccess\(\s*ItemCollection\s*\)/)
    expect(itemsBlock).not.toMatch(/\.addSuccess\(\s*World\s*\)/)
  })

  it("adds setup role selection and confirmation endpoints", () => {
    const selectBlock = endpointBlock(
      readGameApiSource(),
      "selectRole",
      "post"
    )
    const confirmBlock = endpointBlock(
      readGameApiSource(),
      "confirmSetup",
      "post"
    )

    expect(selectBlock).toMatch(/\/setup\/role/)
    expect(selectBlock).toMatch(/roleId\s*:\s*RoleId/)
    expect(confirmBlock).toMatch(/\/setup\/confirm/)
    expect(confirmBlock).toMatch(/confirm\s*:\s*Schema\.Boolean/)
  })

  it("adds separate save, restore, and quit endpoints outside SAction", () => {
    const source = readGameApiSource()
    const saveBlock = endpointBlock(source, "saveGame", "post")
    const restoreBlock = endpointBlock(source, "restoreGame", "post")
    const quitBlock = endpointBlock(source, "quitGame", "post")

    expect(saveBlock).toMatch(/\/save/)
    expect(restoreBlock).toMatch(/\/restore/)
    expect(quitBlock).toMatch(/\/quit/)
    expect(saveBlock).not.toMatch(/SAction/)
    expect(restoreBlock).not.toMatch(/SAction/)
    expect(quitBlock).not.toMatch(/SAction/)
  })
})
