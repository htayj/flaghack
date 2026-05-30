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
const modeUseStateInitializer =
  /useState\s*<\s*Mode\s*>\s*\(\s*"normal"\s*\)/
const modeUseStateBinding =
  /const\s*\[\s*mode\b[\s\S]*?\]\s*=\s*useState\b/

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

const extractHandleKeyDownSource = (source: string): string => {
  const start = source.indexOf("const handleKeyDown =")
  const end = source.indexOf("\n  // useEffect", start)

  if (start === -1 || end === -1) {
    throw new Error("Unable to locate handleKeyDown source")
  }

  return source.slice(start, end)
}

describe("web input parsing", () => {
  it("maps vi movement keys to domain actions", () => {
    expect(parseInput("j")).toEqual(EAction.move({ dir: "S" }))
  })

  it("maps unknown keys to no action", () => {
    const action = parseInput("?")

    expect(action).toBeUndefined()
    expect(action).not.toEqual(EAction.noop())
  })
})

describe("web input/view source guards", () => {
  it("gates player actions behind a parsed-input no-action guard", () => {
    const handleKeyDownSource = extractHandleKeyDownSource(
      readFileSync(playingPath, "utf8")
    )
    const parseIndex = handleKeyDownSource.indexOf(
      "const action = parseInput(input)"
    )
    const guardIndex = handleKeyDownSource.search(
      /if\s*\(\s*action\s*===\s*undefined\s*\)\s*\{\s*return\s*\}/
    )
    const doActionIndex = handleKeyDownSource.indexOf(
      "doPlayerAction(action)"
    )
    const worldIndex = handleKeyDownSource.indexOf("getWorld")
    const inventoryIndex = handleKeyDownSource.indexOf("getInventory")

    expect(parseIndex).toBeGreaterThanOrEqual(0)
    expect(guardIndex).toBeGreaterThan(parseIndex)
    expect(doActionIndex).toBeGreaterThan(guardIndex)
    expect(worldIndex).toBeGreaterThan(guardIndex)
    expect(inventoryIndex).toBeGreaterThan(guardIndex)
  })

  it("keeps the static UI mode out of React state", () => {
    const playingSource = readFileSync(playingPath, "utf8")

    expect(playingSource).not.toMatch(modeUseStateInitializer)
    expect(playingSource).not.toMatch(modeUseStateBinding)
  })

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
