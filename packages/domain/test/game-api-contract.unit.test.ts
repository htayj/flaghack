import { describe, expect, it } from "@effect/vitest"
import { readFileSync } from "node:fs"

const readGameApiSource = (): string =>
  readFileSync(new URL("../src/GameApi.ts", import.meta.url), "utf8")

const endpointBlock = (source: string, endpointName: string): string => {
  const compactStart = source.indexOf(
    `HttpApiEndpoint.get("${endpointName}"`
  )
  const multilineStart = source.indexOf(
    `HttpApiEndpoint.get(\n      "${endpointName}"`
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
})
