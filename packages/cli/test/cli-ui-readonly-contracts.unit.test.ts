import { describe, expect, it } from "@effect/vitest"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const testDirectory = dirname(fileURLToPath(import.meta.url))
const srcDirectory = join(testDirectory, "../src")
const componentDirectory = join(srcDirectory, "components")

const readSource = (path: string) => readFileSync(path, "utf8")

const readonlyTilesAlias =
  /export\s+type\s+Tiles\s*=\s*ReadonlyArray\s*<\s*ReadonlyArray\s*<\s*Tile\s*>\s*>/
const mutableTilesAlias =
  /export\s+type\s+Tiles\s*=\s*(?:Array\s*<\s*Array\s*<\s*Tile\s*>\s*>|Tile\s*\[\]\s*\[\])/
const readonlyOnSubmitKeys =
  /onSubmit\s*:\s*\(\s*keys\s*:\s*ReadonlyArray\s*<\s*Key\s*>\s*\)\s*=>\s*void/
const readonlyOnDropKeys =
  /onDrop\s*:\s*\(\s*keys\s*:\s*ReadonlyArray\s*<\s*Key\s*>\s*\)\s*=>\s*void/
const mutablePopupKeyCallback =
  /on(?:Submit|Drop)\s*:\s*\(\s*keys\s*:\s*(?:Array\s*<\s*Key\s*>|Key\s*\[\])\s*\)\s*=>\s*void/

describe("CLI readonly UI contracts", () => {
  it("exports board tile matrices as nested ReadonlyArray contracts", () => {
    const paths = [
      join(componentDirectory, "BGameBoard.tsx"),
      join(srcDirectory, "util.ts")
    ] as const

    for (const path of paths) {
      const source = readSource(path)

      expect(source).toMatch(readonlyTilesAlias)
      expect(source).not.toMatch(mutableTilesAlias)
    }
  })

  it("centralizes BGameBoard tile rendering through CLI tilesToText", () => {
    const source = readSource(join(componentDirectory, "BGameBoard.tsx"))

    expect(source).toMatch(
      /import\s*{\s*tilesToText\s*}\s*from\s*["']\.\.\/util\.js["']/
    )
    expect(source).toContain("tilesToText(tiles)")
    expect(source).not.toMatch(/\bconst\s+tileToText\b/)
    expect(source).not.toMatch(/\bconst\s+ecolor\b/)
    expect(source).not.toContain("colorNumMap")
  })

  it("accepts readonly key arrays at popup selection boundaries", () => {
    const sources = [
      readSource(join(componentDirectory, "PickupPopup.tsx")),
      readSource(join(componentDirectory, "popup.tsx"))
    ] as const
    const multiDropSource = readSource(
      join(componentDirectory, "MultiDropPopup.tsx")
    )

    for (const source of sources) {
      expect(source).toMatch(readonlyOnSubmitKeys)
      expect(source).not.toMatch(mutablePopupKeyCallback)
    }

    expect(multiDropSource).toMatch(readonlyOnDropKeys)
    expect(multiDropSource).not.toMatch(mutablePopupKeyCallback)
  })

  it("renders the playing app directly without static mode state", () => {
    const source = readSource(join(srcDirectory, "BApp.tsx"))

    expect(source).toMatch(/<BPlaying[\s\S]*username=["']test["']/)
    expect(source).toContain("debugMessages={debugMessages}")
    expect(source).toContain("onQuit={onQuit}")
    expect(source).not.toMatch(/\buseState\b/)
    expect(source).not.toMatch(/\bmode\s*===\s*["']playing["']/)
    expect(source).not.toContain("BModeError")
  })
})
