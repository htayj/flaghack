import { describe, expect, it } from "@effect/vitest"
import { nullMatrix, tilesToText } from "@flaghack/web/util"

describe("web workspace smoke", () => {
  it("renders small utility matrices without a DOM", () => {
    expect(nullMatrix(2, 3).size).toBe(2)
    expect(tilesToText([[{ char: "@", color: "white" }]])).toContain("@")
  })
})
