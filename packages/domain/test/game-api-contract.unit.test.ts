import { describe, expect, it } from "@effect/vitest"
import { readFileSync } from "node:fs"

const readGameApiSource = (): string =>
  readFileSync(new URL("../src/GameApi.ts", import.meta.url), "utf8")

const endpointBlock = (source: string, endpointName: string): string => {
  const endpointStart = source.indexOf(
    `HttpApiEndpoint.get("${endpointName}"`
  )

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
})
