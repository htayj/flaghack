import { describe, expect, it } from "@effect/vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import * as ts from "typescript"

const gameClientPath = fileURLToPath(
  new URL("../src/GameClient.ts", import.meta.url)
)
const playingPath = fileURLToPath(
  new URL("../src/Playing.tsx", import.meta.url)
)

const readSource = (path: string): string => readFileSync(path, "utf8")

const parseSource = (
  path: string,
  source: string,
  scriptKind: ts.ScriptKind
): ts.SourceFile =>
  ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind
  )

const hasExportModifier = (statement: ts.VariableStatement): boolean =>
  statement.modifiers?.some(
    (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
  ) ?? false

const exportedInitializers = (
  sourceFile: ts.SourceFile
): Map<string, string> => {
  const exports = new Map<string, string>()

  for (const statement of sourceFile.statements) {
    if (
      !ts.isVariableStatement(statement) || !hasExportModifier(statement)
    ) {
      continue
    }

    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
        continue
      }

      exports.set(
        declaration.name.text,
        declaration.initializer.getText(sourceFile)
      )
    }
  }

  return exports
}

const findCallsByCallee = (
  sourceFile: ts.SourceFile,
  callee: string
): Array<ts.CallExpression> => {
  const calls: Array<ts.CallExpression> = []

  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node)
      && node.expression.getText(sourceFile) === callee
    ) {
      calls.push(node)
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return calls
}

const findPropertyAccesses = (
  sourceFile: ts.SourceFile,
  propertyAccess: string
): Array<string> => {
  const accesses: Array<string> = []

  const visit = (node: ts.Node) => {
    if (
      ts.isPropertyAccessExpression(node)
      && node.getText(sourceFile) === propertyAccess
    ) {
      accesses.push(node.getText(sourceFile))
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return accesses
}

const hasNamedImport = (
  sourceFile: ts.SourceFile,
  moduleSpecifier: string,
  importedName: string
): boolean =>
  sourceFile.statements.some((statement) => {
    if (!ts.isImportDeclaration(statement)) {
      return false
    }

    if (
      !ts.isStringLiteral(statement.moduleSpecifier)
      || statement.moduleSpecifier.text !== moduleSpecifier
    ) {
      return false
    }

    const namedBindings = statement.importClause?.namedBindings
    if (!namedBindings || !ts.isNamedImports(namedBindings)) {
      return false
    }

    return namedBindings.elements.some(
      (element) => element.name.text === importedName
    )
  })

const normalizeSource = (source: string): string =>
  source.replace(/\s+/g, " ").trim()

const classifyRuntimeLaunch = (source: string): string => {
  const normalized = normalizeSource(source)

  if (/^getWorld\.pipe\b/.test(normalized)) {
    return "initial getWorld"
  }

  if (/^getPickupItemsFor\(\s*"player"\s*\)\.pipe\b/.test(normalized)) {
    return "comma getPickupItemsFor"
  }

  if (normalized === "refreshWorldAndInventory") {
    return "stream fallback refresh"
  }

  if (/^doPlayerAction\(\s*action\s*\)\.pipe\b/.test(normalized)) {
    return "player action doPlayerAction"
  }

  if (/^doPlayerAction\(\s*action\.value\s*\)\.pipe\b/.test(normalized)) {
    return "movement doPlayerAction"
  }

  if (/^doPlayerAction\(\s*EAction\.pickupMulti\(/.test(normalized)) {
    return "pickup doPlayerAction"
  }

  if (/^saveGame\.pipe\b/.test(normalized)) {
    return "save saveGame"
  }

  if (/^quitGame\.pipe\b/.test(normalized)) {
    return "quit quitGame"
  }

  return `unexpected: ${normalized}`
}

describe("web Effect runtime boundary", () => {
  it("defines LiveRuntime as the app-scoped ManagedRuntime", () => {
    const gameClientSource = readSource(gameClientPath)

    expect(gameClientSource).toMatch(
      /export\s+const\s+LiveRuntime\s*=\s*ManagedRuntime\.make\s*\(\s*MainLive\s*\)/
    )
  })

  it("exports contextful GameClient accessors without MainLive wrappers", () => {
    const gameClientSourceFile = parseSource(
      gameClientPath,
      readSource(gameClientPath),
      ts.ScriptKind.TS
    )
    const exports = exportedInitializers(gameClientSourceFile)

    expect(Object.fromEntries(exports)).toMatchObject({
      doPlayerAction: "GameClient.doPlayerAction",
      getInventory: "GameClient.getInventory",
      getLogs: "GameClient.getLogs",
      getPickupItemsFor: "GameClient.getPickupItemsFor",
      getWorld: "GameClient.getWorld"
    })
    expect(
      findCallsByCallee(gameClientSourceFile, "Effect.provide")
        .filter((call) =>
          call.arguments.some(
            (argument) =>
              argument.getText(gameClientSourceFile) === "MainLive"
          )
        )
        .map((call) => call.getText(gameClientSourceFile))
    ).toEqual([])
  })

  it("runs lifecycle and event effects through LiveRuntime", () => {
    const playingSourceFile = parseSource(
      playingPath,
      readSource(playingPath),
      ts.ScriptKind.TSX
    )

    expect(
      hasNamedImport(playingSourceFile, "./GameClient.js", "LiveRuntime")
    ).toBe(true)
    expect(findPropertyAccesses(playingSourceFile, "Effect.runPromise"))
      .toEqual([])

    const launchClassifications = findCallsByCallee(
      playingSourceFile,
      "LiveRuntime.runPromise"
    ).map((call) =>
      classifyRuntimeLaunch(
        call.arguments[0]?.getText(playingSourceFile) ?? ""
      )
    )

    expect(launchClassifications).toHaveLength(7)
    expect([...launchClassifications].sort()).toEqual([
      "comma getPickupItemsFor",
      "initial getWorld",
      "pickup doPlayerAction",
      "player action doPlayerAction",
      "quit quitGame",
      "save saveGame",
      "stream fallback refresh"
    ])
  })
})
