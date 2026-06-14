import { describe, expect, it } from "@effect/vitest"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const testDirectory = dirname(fileURLToPath(import.meta.url))
const srcDirectory = join(testDirectory, "../src")

const readSource = (path: string) => readFileSync(path, "utf8")

const readonlyTilesAlias =
  /export\s+type\s+Tiles\s*=\s*ReadonlyArray\s*<\s*ReadonlyArray\s*<\s*Tile\s*>\s*>/
const mutableTilesAlias =
  /export\s+type\s+Tiles\s*=\s*(?:Array\s*<\s*Array\s*<\s*Tile\s*>\s*>|Tile\s*\[\]\s*\[\])/
const readonlyOnSubmitKeys =
  /onSubmit\s*:\s*\(\s*keys\s*:\s*ReadonlyArray\s*<\s*Key\s*>\s*\)\s*=>\s*void/
const mutableOnSubmitKeys =
  /onSubmit\s*:\s*\(\s*keys\s*:\s*(?:Array\s*<\s*Key\s*>|Key\s*\[\])\s*\)\s*=>\s*void/
const readonlyOnDoPickup =
  /const\s+onDoPickup\s*=\s*\(\s*pickupItems\s*:\s*ReadonlyArray\s*<\s*Key\s*>\s*\)\s*=>\s*{/

describe("web readonly UI contracts", () => {
  it("exports board tile matrices as nested ReadonlyArray contracts", () => {
    const paths = [
      join(srcDirectory, "GameBoard.tsx"),
      join(srcDirectory, "util.ts")
    ] as const

    for (const path of paths) {
      const source = readSource(path)

      expect(source).toMatch(readonlyTilesAlias)
      expect(source).not.toMatch(mutableTilesAlias)
    }
  })

  it("accepts readonly key arrays at pickup selection boundaries", () => {
    const pickupPopupSource = readSource(
      join(srcDirectory, "PickupPopup.tsx")
    )
    const playingSource = readSource(join(srcDirectory, "Playing.tsx"))

    expect(pickupPopupSource).toMatch(readonlyOnSubmitKeys)
    expect(pickupPopupSource).not.toMatch(mutableOnSubmitKeys)
    expect(playingSource).toMatch(readonlyOnDoPickup)
  })
})
