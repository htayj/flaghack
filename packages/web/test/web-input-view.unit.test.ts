import { describe, expect, it } from "@effect/vitest"
import { EAction } from "@flaghack/domain/schemas"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { parseInput } from "../src/Playing.tsx"

const playingPath = fileURLToPath(
  new URL("../src/Playing.tsx", import.meta.url)
)
const inventoryPath = fileURLToPath(
  new URL("../src/Inventory.tsx", import.meta.url)
)

type SourceGuard = {
  file: string
  source: string
  snippet: string
  pattern: RegExp
}

type SourceFinding = {
  file: string
  line: number
  snippet: string
  text: string
}

const findForbiddenSource = (
  guards: Array<SourceGuard>
): Array<SourceFinding> =>
  guards.flatMap(({ file, pattern, snippet, source }) =>
    source.split(/\r?\n/).flatMap((text, index) =>
      pattern.test(text)
        ? [{ file, line: index + 1, snippet, text: text.trim() }]
        : []
    )
  )

describe("web input parsing", () => {
  it("maps vi movement keys to domain actions", () => {
    expect(parseInput("j")).toEqual(EAction.move({ dir: "S" }))
  })

  it("maps unknown keys to noop", () => {
    expect(parseInput("?")).toEqual(EAction.noop())
  })
})

describe("web input/view source guards", () => {
  it("keeps bounded input and view cleanup regressions out", () => {
    const playingSource = readFileSync(playingPath, "utf8")
    const inventorySource = readFileSync(inventoryPath, "utf8")

    expect(
      findForbiddenSource([
        {
          file: "Playing.tsx",
          source: playingSource,
          snippet: "parseInput = (input: any)",
          pattern: /parseInput\s*=\s*\(\s*input\s*:\s*any\s*\)/
        },
        {
          file: "Playing.tsx",
          source: playingSource,
          snippet: "console.log(\"parsing input for input of:",
          pattern: /console\.log\(\s*"parsing input for input of:/
        },
        {
          file: "Playing.tsx",
          source: playingSource,
          snippet: "console.log(\"in handle key down:",
          pattern: /console\.log\(\s*"in handle key down:/
        },
        {
          file: "Playing.tsx",
          source: playingSource,
          snippet: "console.log(\"clicked\")",
          pattern: /console\.log\(\s*"clicked"\s*\)/
        },
        {
          file: "Inventory.tsx",
          source: inventorySource,
          snippet: "key={i}",
          pattern: /key=\{\s*i\s*\}/
        }
      ])
    ).toEqual([])
  })
})
