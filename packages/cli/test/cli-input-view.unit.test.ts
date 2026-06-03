import { describe, expect, it } from "@effect/vitest"
import { List } from "immutable"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import * as ts from "typescript"
import { prependMessage } from "../src/components/BPlaying.js"
import { MAX_VISIBLE_MESSAGES } from "../src/components/Messages.js"

const bPlayingSourcePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../src/components/BPlaying.tsx"
)

const readBPlayingSource = () => readFileSync(bPlayingSourcePath, "utf8")

const parseInputSignature =
  /const\s+parseInput\s*=\s*\(\s*input\s*:\s*string\s*\)\s*:\s*Option\.Option\s*<\s*Action\s*>\s*=>\s*{/
const parseInputAnySignature =
  /const\s+parseInput\s*=\s*\(\s*input\s*:\s*any\s*\)/
const parseInputDefaultNoop =
  /default\s*:\s*return\s+EAction\.noop\s*\(\s*\)/
const parseInputDefaultUndefined = /default\s*:\s*return\s+undefined\b/
const parseInputDefaultNone =
  /default\s*:\s*return\s+Option\.none\s*\(\s*\)/
const handleGameKeySignature =
  /const\s+handleGameKey\s*=\s*\(\s*input\s*:\s*string\s*\)\s*=>\s*{/
const onDoPickupSignature =
  /const\s+onDoPickup\s*=\s*\(\s*pickupItems\s*:\s*ReadonlyArray\s*<\s*Key\s*>\s*\)\s*=>\s*{/
const onDoDropSignature =
  /const\s+onDoDrop\s*=\s*\(\s*dropItems\s*:\s*ReadonlyArray\s*<\s*Key\s*>\s*\)\s*=>\s*{/
const noActionGuardBeforeApiPattern =
  /const\s+action\s*=\s*parseInput\s*\(\s*input\s*\)\s*if\s*\(\s*Option\.isNone\s*\(\s*action\s*\)\s*\)\s*{\s*return\s*}/
const modeUseStateInitializer =
  /useState\s*<\s*Mode\s*>\s*\(\s*"normal"\s*\)/
const modeUseStateBinding =
  /const\s*\[\s*mode\b[\s\S]*?\]\s*=\s*useState\b/
const modeTypeAlias = /\btype\s+Mode\s*=/
const modeConstDeclaration = /\bconst\s+mode\b[^=\n]*=/
const modeIncludesConditional = /\.includes\s*\(\s*mode\s*\)/

type ForbiddenEffectAndThenUiSideEffect = {
  file: string
  line: number
  snippet: string
  text: string
}

const parseBPlayingSource = (source: string): ts.SourceFile =>
  ts.createSourceFile(
    "BPlaying.tsx",
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

const normalizedNodeText = (
  sourceFile: ts.SourceFile,
  node: ts.Node
): string => node.getText(sourceFile).replace(/\s+/g, "")

const isEffectAndThenCall = (
  sourceFile: ts.SourceFile,
  node: ts.Node
): node is ts.CallExpression =>
  ts.isCallExpression(node)
  && node.expression.getText(sourceFile) === "Effect.andThen"

const findForbiddenUiBoundaryReferences = (
  sourceFile: ts.SourceFile,
  root: ts.Node,
  forbiddenSetters: ReadonlySet<string>,
  forbiddenRefOperations: ReadonlySet<string>
): Array<ForbiddenEffectAndThenUiSideEffect> => {
  const findings: Array<ForbiddenEffectAndThenUiSideEffect> = []

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      if (
        ts.isIdentifier(node.expression)
        && forbiddenSetters.has(node.expression.text)
      ) {
        findings.push({
          file: "BPlaying.tsx",
          line: sourceLine(sourceFile, node),
          snippet: node.expression.text,
          text: nodeLineText(sourceFile, node)
        })
        return
      }

      const normalizedCall = normalizedNodeText(sourceFile, node)
      if (forbiddenRefOperations.has(normalizedCall)) {
        findings.push({
          file: "BPlaying.tsx",
          line: sourceLine(sourceFile, node),
          snippet: normalizedCall,
          text: nodeLineText(sourceFile, node)
        })
        return
      }
    } else if (
      ts.isIdentifier(node) && forbiddenSetters.has(node.text)
    ) {
      findings.push({
        file: "BPlaying.tsx",
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
): Array<ForbiddenEffectAndThenUiSideEffect> => {
  const sourceFile = parseBPlayingSource(source)
  const forbiddenSetters = new Set([
    "setWorld",
    "setInventory",
    "setPickupContents"
  ])
  const forbiddenRefOperations = new Set([
    "pickupRef.current?.hide()",
    "dropRef.current?.hide()",
    "gameref.current?.focus()"
  ])
  const findings: Array<ForbiddenEffectAndThenUiSideEffect> = []

  const visit = (node: ts.Node) => {
    if (isEffectAndThenCall(sourceFile, node)) {
      for (const argument of node.arguments) {
        if (
          ts.isIdentifier(argument)
          && forbiddenSetters.has(argument.text)
        ) {
          findings.push({
            file: "BPlaying.tsx",
            line: sourceLine(sourceFile, argument),
            snippet: argument.text,
            text: nodeLineText(sourceFile, argument)
          })
        } else if (!ts.isIdentifier(argument)) {
          const nestedFindings = findForbiddenUiBoundaryReferences(
            sourceFile,
            argument,
            forbiddenSetters,
            forbiddenRefOperations
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

describe("CLI message log", () => {
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

  it("keeps BPlaying message updates routed through the capping helper", () => {
    expect(readBPlayingSource()).not.toContain(
      "setMessages((messages) => messages.unshift("
    )
  })
})

describe("CLI input handling static guards", () => {
  it("keeps parseInput string-typed with an explicit Option no-action default", () => {
    const source = readBPlayingSource()
    const parseInputBody = extractArrowFunctionBody(
      source,
      parseInputSignature
    )

    expect(source).toMatch(parseInputSignature)
    expect(source).not.toMatch(parseInputAnySignature)
    expect(parseInputBody).not.toMatch(parseInputDefaultNoop)
    expect(parseInputBody).not.toMatch(parseInputDefaultUndefined)
    expect(parseInputBody).toMatch(parseInputDefaultNone)
    for (const dir of ["S", "W", "N", "E", "NW", "NE", "SW", "SE"]) {
      expect(parseInputBody).toContain(
        `Option.some(EAction.move({ dir: "${dir}" }))`
      )
    }
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
    expect(refreshSource).toContain("Effect.tap")
    expect(refreshSource).toContain("Effect.sync")
    expect(refreshSource).toMatch(/setWorld\s*\(\s*world\s*\)/)
    expect(refreshSource).toMatch(
      /setInventory\s*\(\s*inventory\s*\)/
    )
  })

  it("keeps UI state/ref side effects explicit inside Effect chains", () => {
    expect(findForbiddenEffectAndThenUiBoundaries(readBPlayingSource()))
      .toEqual([])
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
    indexAfter(
      handleGameKeyBody,
      "apiDoPlayerAction(action.value)",
      guardEnd
    )
    indexAfter(handleGameKeyBody, "refreshWorldAndInventory", guardEnd)
    expectRefreshAfterAction(
      handleGameKeyBody,
      "apiDoPlayerAction(action.value)"
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

  it("keeps the static UI mode out of React state and source", () => {
    const source = readBPlayingSource()

    expect(source).not.toMatch(modeUseStateInitializer)
    expect(source).not.toMatch(modeUseStateBinding)
    expect(source).not.toMatch(modeTypeAlias)
    expect(source).not.toMatch(modeConstDeclaration)
    expect(source).not.toMatch(modeIncludesConditional)
  })
})
