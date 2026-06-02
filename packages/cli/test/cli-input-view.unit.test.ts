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
const onDoPickupSignature =
  /const\s+onDoPickup\s*=\s*\(\s*pickupItems\s*:\s*Array\s*<\s*Key\s*>\s*\)\s*=>\s*{/
const onDoDropSignature =
  /const\s+onDoDrop\s*=\s*\(\s*dropItems\s*:\s*Array\s*<\s*Key\s*>\s*\)\s*=>\s*{/
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

const extractConstInitializerSource = (
  source: string,
  identifier: string
): string => {
  const declaration = `const ${identifier} =`
  const declarationIndex = source.indexOf(declaration)
  expect(declarationIndex).toBeGreaterThanOrEqual(0)

  const initializerIndex = declarationIndex + declaration.length
  let depth = 0
  let started = false

  for (let index = initializerIndex; index < source.length; index += 1) {
    const char = source[index]
    if (char === "(" || char === "{" || char === "[") {
      depth += 1
      started = true
    } else if (char === ")" || char === "}" || char === "]") {
      depth -= 1
    } else if (char === "\n" && started && depth === 0) {
      return source.slice(declarationIndex, index)
    }
  }

  throw new Error(`Could not find initializer for ${identifier}`)
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

const expectRefreshAfterAction = (
  source: string,
  actionCall: string
) => {
  const actionIndex = source.indexOf(actionCall)
  expect(actionIndex, `${actionCall} should exist`).toBeGreaterThanOrEqual(
    0
  )

  const refreshIndex = source.indexOf(
    "Effect.andThen(refreshWorldAndInventory)",
    actionIndex
  )
  expect(
    refreshIndex,
    "refreshWorldAndInventory should run after the player action"
  ).toBeGreaterThan(actionIndex)
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

  it("defines an authoritative world/inventory refresh effect", () => {
    const source = readBPlayingSource()
    const refreshSource = extractConstInitializerSource(
      source,
      "refreshWorldAndInventory"
    )

    expect(refreshSource).toContain("Effect.all")
    expect(refreshSource).toMatch(/world\s*:\s*apiGetWorld\b/)
    expect(refreshSource).toMatch(/inventory\s*:\s*apiGetInventory\b/)
    expect(refreshSource).toMatch(/setWorld\s*\(\s*world\s*\)/)
    expect(refreshSource).toMatch(
      /setInventory\s*\(\s*inventory\s*\)/
    )
  })

  it("returns before action APIs and refreshes after movement actions", () => {
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
    indexAfter(handleGameKeyBody, "refreshWorldAndInventory", guardEnd)
    expectRefreshAfterAction(
      handleGameKeyBody,
      "apiDoPlayerAction(action)"
    )
    expect(handleGameKeyBody).not.toContain("Effect.andThen(apiGetWorld)")
    expect(handleGameKeyBody).not.toContain("apiGetInventory.pipe(")
  })

  it("refreshes world and inventory after pickup/drop actions", () => {
    const source = readBPlayingSource()
    const onDoPickupBody = extractArrowFunctionBody(
      source,
      onDoPickupSignature
    )
    const onDoDropBody = extractArrowFunctionBody(
      source,
      onDoDropSignature
    )

    expectRefreshAfterAction(
      onDoPickupBody,
      "apiDoPlayerAction(EAction.pickupMulti"
    )
    expectRefreshAfterAction(
      onDoDropBody,
      "apiDoPlayerAction(EAction.dropMulti"
    )
  })
})
