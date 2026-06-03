import { describe, expect, it } from "@effect/vitest"
import { type Action, EAction } from "@flaghack/domain/schemas"
import { Option } from "effect"
import { List } from "immutable"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import * as ts from "typescript"
import { MAX_VISIBLE_MESSAGES } from "../src/Messages.tsx"
import { parseInput, prependMessage } from "../src/Playing.tsx"

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
const modeTypeAlias = /\btype\s+Mode\s*=/
const modeConstDeclaration = /\bconst\s+mode\b[^=\n]*=/
const modeIncludesConditional = /\.includes\s*\(\s*mode\s*\)/

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

const parsePlayingSource = (source: string): ts.SourceFile =>
  ts.createSourceFile(
    "Playing.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  )

const sourceLine = (sourceFile: ts.SourceFile, node: ts.Node): number =>
  sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line
  + 1

const nodeLineText = (sourceFile: ts.SourceFile, node: ts.Node): string =>
  node.getText(sourceFile).split(/\r?\n/, 1)[0]?.trim() ?? ""

const isEffectAndThenCall = (
  sourceFile: ts.SourceFile,
  node: ts.Node
): node is ts.CallExpression =>
  ts.isCallExpression(node)
  && node.expression.getText(sourceFile) === "Effect.andThen"

const findForbiddenUiBoundarySetterReferences = (
  sourceFile: ts.SourceFile,
  root: ts.Node,
  forbiddenSetters: ReadonlySet<string>
): Array<SourceFinding> => {
  const findings: Array<SourceFinding> = []

  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && forbiddenSetters.has(node.expression.text)
    ) {
      findings.push({
        file: "Playing.tsx",
        line: sourceLine(sourceFile, node),
        snippet: node.expression.text,
        text: nodeLineText(sourceFile, node)
      })
      return
    }

    if (ts.isIdentifier(node) && forbiddenSetters.has(node.text)) {
      findings.push({
        file: "Playing.tsx",
        line: sourceLine(sourceFile, node),
        snippet: node.text,
        text: nodeLineText(sourceFile, node)
      })
      return
    }

    ts.forEachChild(node, visit)
  }

  visit(root)
  return findings
}

const findForbiddenEffectAndThenUiBoundaries = (
  source: string
): Array<SourceFinding> => {
  const sourceFile = parsePlayingSource(source)
  const forbiddenSetters = new Set([
    "setWorld",
    "setInventory",
    "setPickupContents",
    "setShowPickup"
  ])
  const findings: Array<SourceFinding> = []

  const visit = (node: ts.Node) => {
    if (isEffectAndThenCall(sourceFile, node)) {
      for (const argument of node.arguments) {
        if (
          ts.isIdentifier(argument)
          && forbiddenSetters.has(argument.text)
        ) {
          findings.push({
            file: "Playing.tsx",
            line: sourceLine(sourceFile, argument),
            snippet: argument.text,
            text: nodeLineText(sourceFile, argument)
          })
        } else if (!ts.isIdentifier(argument)) {
          const nestedFindings = findForbiddenUiBoundarySetterReferences(
            sourceFile,
            argument,
            forbiddenSetters
          )
          for (const finding of nestedFindings) {
            findings.push(finding)
          }
        }
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return findings
}

const onDoPickupSignature =
  /const\s+onDoPickup\s*=\s*\(\s*pickupItems\s*:\s*ReadonlyArray\s*<\s*Key\s*>\s*\)\s*=>\s*{/
const onCancelPickupSignature =
  /const\s+onCancelPickup\s*=\s*\(\s*\)\s*=>\s*{/

const indexOfMatch = (
  source: string,
  pattern: RegExp,
  startIndex = 0
): number => {
  const relativeIndex = source.slice(startIndex).search(pattern)

  return relativeIndex === -1 ? -1 : startIndex + relativeIndex
}

const extractHandleKeyDownSource = (source: string): string => {
  const start = source.indexOf("const handleKeyDown =")
  const end = source.indexOf("\n  // useEffect", start)

  if (start === -1 || end === -1) {
    throw new Error("Unable to locate handleKeyDown source")
  }

  return source.slice(start, end)
}

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

  return refreshIndex
}

const expectSomeAction = (
  actual: Option.Option<Action>,
  expected: Action
) => {
  expect(Option.isSome(actual)).toBe(true)
  if (Option.isSome(actual)) {
    expect(actual.value).toEqual(expected)
  }
}

describe("web input parsing", () => {
  it("maps vi movement keys to domain actions", () => {
    const movementCases = [
      ["j", "S"],
      ["h", "W"],
      ["k", "N"],
      ["l", "E"],
      ["y", "NW"],
      ["u", "NE"],
      ["b", "SW"],
      ["n", "SE"]
    ] as const

    for (const [input, dir] of movementCases) {
      expectSomeAction(parseInput(input), EAction.move({ dir }))
    }
  })

  it("maps unknown keys to no action", () => {
    for (const input of ["?", "d"] as const) {
      const action = parseInput(input)

      expect(Option.isNone(action)).toBe(true)
      expect(action).not.toEqual(Option.some(EAction.noop()))
    }
  })
})

describe("web message log", () => {
  it("prepends new messages, caps stored state, and drops oldest tail entries", () => {
    const previousMessages = List(
      Array.from(
        { length: MAX_VISIBLE_MESSAGES },
        (_, index) => `message-${index}`
      )
    )
    const result = prependMessage("newest")(previousMessages)
    const expectedMessages = [
      "newest",
      ...previousMessages.take(MAX_VISIBLE_MESSAGES - 1).toArray()
    ]

    expect(result.first()).toBe("newest")
    expect(result.size).toBe(MAX_VISIBLE_MESSAGES)
    expect(result.toArray()).toEqual(expectedMessages)
    expect(result.includes(`message-${MAX_VISIBLE_MESSAGES - 1}`)).toBe(
      false
    )
  })
})

describe("web input/view source guards", () => {
  it("defines an authoritative world/inventory refresh effect", () => {
    const refreshSource = extractConstInitializerSource(
      readFileSync(playingPath, "utf8"),
      "refreshWorldAndInventory"
    )

    expect(refreshSource).toContain("Effect.all")
    expect(refreshSource).toMatch(/world\s*:\s*getWorld\b/)
    expect(refreshSource).toMatch(/inventory\s*:\s*getInventory\b/)
    expect(refreshSource).toContain("Effect.tap")
    expect(refreshSource).toContain("Effect.sync")
    expect(refreshSource).toMatch(/setWorld\s*\(\s*world\s*\)/)
    expect(refreshSource).toMatch(
      /setInventory\s*\(\s*inventory\s*\)/
    )
  })

  it("keeps UI state side effects explicit inside Effect chains", () => {
    expect(
      findForbiddenEffectAndThenUiBoundaries(
        readFileSync(playingPath, "utf8")
      )
    ).toEqual([])
  })

  it("gates player actions and refreshes after movement actions", () => {
    const handleKeyDownSource = extractHandleKeyDownSource(
      readFileSync(playingPath, "utf8")
    )
    const parseIndex = handleKeyDownSource.indexOf(
      "const action = parseInput(input)"
    )
    const guardIndex = handleKeyDownSource.search(
      /if\s*\(\s*Option\.isNone\s*\(\s*action\s*\)\s*\)\s*\{\s*return\s*\}/
    )
    const doActionIndex = handleKeyDownSource.indexOf(
      "doPlayerAction(action.value)"
    )
    const refreshIndex = handleKeyDownSource.indexOf(
      "Effect.andThen(refreshWorldAndInventory)",
      doActionIndex
    )

    expect(parseIndex).toBeGreaterThanOrEqual(0)
    expect(guardIndex).toBeGreaterThan(parseIndex)
    expect(doActionIndex).toBeGreaterThan(guardIndex)
    expect(refreshIndex).toBeGreaterThan(doActionIndex)
    expect(handleKeyDownSource).not.toContain("Effect.andThen(getWorld)")
    expect(handleKeyDownSource).not.toContain("getInventory.pipe(")
  })

  it("refreshes before closing and refocusing after pickup actions", () => {
    const onDoPickupBody = extractArrowFunctionBody(
      readFileSync(playingPath, "utf8"),
      onDoPickupSignature
    )
    const refreshIndex = expectRefreshAfterAction(
      onDoPickupBody,
      "doPlayerAction(EAction.pickupMulti"
    )
    const hideIndex = indexOfMatch(
      onDoPickupBody,
      /setShowPickup\s*\(\s*false\s*\)/,
      refreshIndex
    )
    const focusIndex = indexOfMatch(
      onDoPickupBody,
      /gameref\.current\s*\?\.\s*focus\s*\(\s*\)/,
      hideIndex
    )

    expect(hideIndex).toBeGreaterThan(refreshIndex)
    expect(focusIndex).toBeGreaterThan(hideIndex)
  })

  it("closes pickup cancellation before restoring game root focus", () => {
    const onCancelPickupBody = extractArrowFunctionBody(
      readFileSync(playingPath, "utf8"),
      onCancelPickupSignature
    )
    const cancelMessageIndex = indexOfMatch(
      onCancelPickupBody,
      /setMessages\s*\(\s*prependMessage\s*\(\s*"canceling pickup"\s*\)\s*\)/
    )
    const hideIndex = indexOfMatch(
      onCancelPickupBody,
      /setShowPickup\s*\(\s*false\s*\)/,
      cancelMessageIndex
    )
    const focusIndex = indexOfMatch(
      onCancelPickupBody,
      /gameref\.current\s*\?\.\s*focus\s*\(\s*\)/,
      hideIndex
    )

    expect(cancelMessageIndex).toBeGreaterThanOrEqual(0)
    expect(hideIndex).toBeGreaterThan(cancelMessageIndex)
    expect(focusIndex).toBeGreaterThan(hideIndex)
  })

  it("keeps the static UI mode out of React state and source", () => {
    const playingSource = readFileSync(playingPath, "utf8")

    expect(playingSource).not.toMatch(modeUseStateInitializer)
    expect(playingSource).not.toMatch(modeUseStateBinding)
    expect(playingSource).not.toMatch(modeTypeAlias)
    expect(playingSource).not.toMatch(modeConstDeclaration)
    expect(playingSource).not.toMatch(modeIncludesConditional)
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
