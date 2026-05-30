import { describe, expect, it } from "@effect/vitest"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const bPlayingSourcePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../src/components/BPlaying.tsx"
)

const readBPlayingSource = () => readFileSync(bPlayingSourcePath, "utf8")

const parseInputSignature =
  /const\s+parseInput\s*=\s*\(\s*input\s*:\s*string\s*\)\s*(?::\s*[^=]+)?=>\s*{/
const parseInputAnySignature =
  /const\s+parseInput\s*=\s*\(\s*input\s*:\s*any\s*\)/
const parseInputDefaultNoop =
  /default\s*:\s*return\s+EAction\.noop\s*\(\s*\)/
const parseInputDefaultUndefined = /default\s*:\s*return\s+undefined\b/
const handleGameKeySignature =
  /const\s+handleGameKey\s*=\s*\(\s*input\s*:\s*string\s*\)\s*=>\s*{/
const noActionGuardBeforeApiPattern =
  /const\s+action\s*=\s*parseInput\s*\(\s*input\s*\)\s*if\s*\(\s*action\s*===\s*undefined\s*\)\s*{\s*return\s*}/

const extractArrowFunctionBody = (
  source: string,
  signature: RegExp
): string => {
  const signatureMatch = source.match(signature)
  expect(signatureMatch).not.toBeNull()

  const signatureIndex = signatureMatch?.index ?? -1
  const openBraceIndex = source.indexOf("{", signatureIndex)
  expect(openBraceIndex).toBeGreaterThanOrEqual(0)

  let depth = 0
  for (let index = openBraceIndex; index < source.length; index += 1) {
    const char = source[index]
    if (char === "{") {
      depth += 1
    } else if (char === "}") {
      depth -= 1
      if (depth === 0) {
        return source.slice(openBraceIndex + 1, index)
      }
    }
  }

  throw new Error("Could not find arrow function body terminator")
}

const indexAfter = (
  source: string,
  token: string,
  minimumIndex: number
) => {
  const index = source.indexOf(token)
  expect(index, `${token} should exist`).toBeGreaterThanOrEqual(0)
  expect(index, `${token} should be after the no-action guard`)
    .toBeGreaterThan(
      minimumIndex
    )
}

describe("CLI input handling static guards", () => {
  it("keeps parseInput string-typed with an undefined no-action default", () => {
    const source = readBPlayingSource()
    const parseInputBody = extractArrowFunctionBody(
      source,
      parseInputSignature
    )

    expect(source).toMatch(parseInputSignature)
    expect(source).not.toMatch(parseInputAnySignature)
    expect(parseInputBody).not.toMatch(parseInputDefaultNoop)
    expect(parseInputBody).toMatch(parseInputDefaultUndefined)
  })

  it("returns before action APIs when parseInput yields no action", () => {
    const source = readBPlayingSource()
    const handleGameKeyBody = extractArrowFunctionBody(
      source,
      handleGameKeySignature
    )
    const guardMatch = handleGameKeyBody.match(
      noActionGuardBeforeApiPattern
    )

    expect(guardMatch).not.toBeNull()

    const guardEnd = (guardMatch?.index ?? 0)
      + (guardMatch?.[0].length ?? 0)
    indexAfter(handleGameKeyBody, "apiDoPlayerAction(action)", guardEnd)
    indexAfter(handleGameKeyBody, "apiGetWorld", guardEnd)
    indexAfter(handleGameKeyBody, "apiGetInventory", guardEnd)
  })
})
