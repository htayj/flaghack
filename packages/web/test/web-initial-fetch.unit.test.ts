import { describe, expect, it } from "@effect/vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import * as ts from "typescript"

const playingPath = fileURLToPath(
  new URL("../src/Playing.tsx", import.meta.url)
)

type SourceFinding = {
  file: string
  line: number
  snippet: string
  text: string
}

const readPlayingSource = (): string => readFileSync(playingPath, "utf8")

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

const isBPlaying = (
  statement: ts.Statement
): statement is ts.FunctionDeclaration =>
  ts.isFunctionDeclaration(statement)
  && statement.name?.text === "BPlaying"

const hasInitialWorldEmptyCheck = (
  sourceFile: ts.SourceFile,
  node: ts.Node
): boolean => {
  const text = node.getText(sourceFile)

  return /world\s*===\s*undefined/.test(text)
    && /size\s*\(\s*world\s*\)\s*===\s*0/.test(text)
}

const hasGetWorldPipe = (
  sourceFile: ts.SourceFile,
  node: ts.Node
): boolean => /getWorld\s*\.\s*pipe/.test(node.getText(sourceFile))

const findRenderBodyInitialFetches = (
  sourceFile: ts.SourceFile
): Array<SourceFinding> => {
  const component = sourceFile.statements.find(isBPlaying)
  const statements = component?.body?.statements ?? []

  return statements.flatMap((statement) =>
    ts.isIfStatement(statement)
      && hasInitialWorldEmptyCheck(sourceFile, statement.expression)
      && hasGetWorldPipe(sourceFile, statement.thenStatement)
      ? [{
        file: "Playing.tsx",
        line: sourceLine(sourceFile, statement),
        snippet: "render-body getWorld initial fetch",
        text: statement.getText(sourceFile).split(/\r?\n/, 1)[0].trim()
      }]
      : []
  )
}

const hasLifecycleDrivenInitialFetch = (
  sourceFile: ts.SourceFile
): boolean => {
  let hasUseEffectGetWorld = false

  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node)
      && node.expression.getText(sourceFile) === "useEffect"
      && hasGetWorldPipe(sourceFile, node)
    ) {
      hasUseEffectGetWorld = true
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return hasUseEffectGetWorld
}

describe("web initial fetch lifecycle", () => {
  it("does not start the empty-world getWorld request in the render body", () => {
    const sourceFile = parsePlayingSource(readPlayingSource())

    expect(findRenderBodyInitialFetches(sourceFile)).toEqual([])
  })

  it("keeps the initial getWorld request lifecycle-driven", () => {
    const sourceFile = parsePlayingSource(readPlayingSource())

    expect(hasLifecycleDrivenInitialFetch(sourceFile)).toBe(true)
  })
})
