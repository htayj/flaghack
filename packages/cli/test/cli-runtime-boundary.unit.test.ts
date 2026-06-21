import { describe, expect, it } from "@effect/vitest"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import * as ts from "typescript"

const testDir = dirname(fileURLToPath(import.meta.url))
const sourcePath = (fileName: string) => join(testDir, "../src", fileName)

const bPlayingSourcePath = sourcePath("components/BPlaying.tsx")
const binSourcePath = sourcePath("bin.ts")
const runtimeSourcePath = sourcePath("runtime.ts")

const importMainLiveFromBin =
  /import\s*{\s*MainLive\s*}\s*from\s*["']\.\.\/bin(?:\.js)?["']/
const importMainLiveFromRuntime =
  /import\s*{\s*MainLive\s*}\s*from\s*["']\.\.\/runtime\.js["']/
const importLiveRuntimeFromRuntime =
  /import\s*{\s*LiveRuntime\s*}\s*from\s*["']\.\.\/runtime\.js["']/
const importMainLiveFromRuntimeInBin =
  /import\s*{\s*MainLive\s*}\s*from\s*["']\.\/runtime\.js["']/
const executableMain =
  /cli\s*\(\s*process\.argv\s*\)\s*\.pipe\([\s\S]*NodeRuntime\.runMain[\s\S]*\)/
const runtimeForbiddenTerms = [
  "cli(process.argv)",
  "NodeRuntime.runMain",
  "process.argv"
] as const

const runtimeForbiddenImports = [
  /from\s*["']\.\/Cli\.js["']/,
  /from\s*["']\.\/cliBlessed\.js["']/
] as const

const runtimeLiveRuntimeExport =
  /export\s+const\s+LiveRuntime\s*=\s*ManagedRuntime\.make\(\s*MainLive\s*\)/

const readBPlayingSource = () => readFileSync(bPlayingSourcePath, "utf8")

const parseSource = (
  path: string,
  source: string,
  scriptKind: ts.ScriptKind
) =>
  ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind
  )

const parseBPlayingSource = (source: string) =>
  parseSource(bPlayingSourcePath, source, ts.ScriptKind.TSX)

const isNamedPropertyAccess = (
  node: ts.Node,
  objectName: string,
  propertyName: string
): node is ts.PropertyAccessExpression =>
  ts.isPropertyAccessExpression(node)
  && ts.isIdentifier(node.expression)
  && node.expression.text === objectName
  && node.name.text === propertyName

const findPropertyAccesses = (
  sourceFile: ts.SourceFile,
  objectName: string,
  propertyName: string
) => {
  const matches: Array<ts.PropertyAccessExpression> = []

  const visit = (node: ts.Node): void => {
    if (isNamedPropertyAccess(node, objectName, propertyName)) {
      matches.push(node)
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return matches
}

const findCalls = (
  sourceFile: ts.SourceFile,
  objectName: string,
  propertyName: string
) => {
  const matches: Array<ts.CallExpression> = []

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node)
      && isNamedPropertyAccess(node.expression, objectName, propertyName)
    ) {
      matches.push(node)
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return matches
}

const findEffectProvideMainLiveCalls = (sourceFile: ts.SourceFile) =>
  findCalls(sourceFile, "Effect", "provide").filter((call) => {
    const [firstArgument] = call.arguments

    return firstArgument !== undefined
      && ts.isIdentifier(firstArgument)
      && firstArgument.text === "MainLive"
  })

const liveRuntimeCallClassification = (
  call: ts.CallExpression,
  sourceFile: ts.SourceFile
) => {
  const argumentSource = call.arguments[0]?.getText(sourceFile) ?? ""

  if (/refreshWorldAndInventory\s*\.pipe\s*\(/.test(argumentSource)) {
    return "initial refreshWorldAndInventory"
  }
  if (/apiGetWorld\s*\.pipe\s*\(/.test(argumentSource)) {
    return "initial apiGetWorld"
  }
  if (/apiGetPickupItemsFor\s*\(\s*"player"\s*\)/.test(argumentSource)) {
    return "comma apiGetPickupItemsFor player"
  }
  if (
    /apiGetLootContainersFor\s*\(\s*"player"\s*\)/.test(argumentSource)
  ) {
    return "loot apiGetLootContainersFor player"
  }
  if (/apiDoPlayerAction\s*\(\s*action\.value\s*\)/.test(argumentSource)) {
    return "movement apiDoPlayerAction action value"
  }
  if (
    /runTravelToTarget\s*\(\s*target\s*,\s*autoMoveId\s*\)\s*\.pipe\s*\(/
      .test(argumentSource)
  ) {
    return "travel runTravelToTarget target"
  }
  if (
    /runDirectionalMovement\s*\(\s*\{[\s\S]*moveAndRefresh/u.test(
      argumentSource
    )
  ) {
    return "directional runDirectionalMovement"
  }
  if (
    /apiDoPlayerAction\s*\(\s*EAction\.pickupMulti\s*\(\s*{\s*keys\s*:\s*pickupItems\s*}\s*\)\s*\)/
      .test(argumentSource)
  ) {
    return "pickup apiDoPlayerAction pickupMulti"
  }
  if (
    /apiDoPlayerAction\s*\(\s*EAction\.dropMulti\s*\(\s*{\s*keys\s*:\s*dropItems\s*}\s*\)\s*\)/
      .test(argumentSource)
  ) {
    return "drop apiDoPlayerAction dropMulti"
  }
  if (
    /apiDoPlayerAction\s*\(\s*EAction\.eatMulti\s*\(\s*{\s*keys\s*:\s*eatItems\s*}\s*\)\s*\)/
      .test(argumentSource)
  ) {
    return "eat apiDoPlayerAction eatMulti"
  }
  if (
    /apiDoPlayerAction\s*\(\s*EAction\.quaffMulti\s*\(\s*{\s*keys\s*:\s*quaffItems\s*}\s*\)\s*\)/
      .test(argumentSource)
  ) {
    return "quaff apiDoPlayerAction quaffMulti"
  }
  if (/EAction\.lootTakeMulti\s*\(/.test(argumentSource)) {
    return "loot apiDoPlayerAction lootTakeMulti"
  }
  if (/EAction\.lootPutMulti\s*\(/.test(argumentSource)) {
    return "loot apiDoPlayerAction lootPutMulti"
  }

  return "unclassified"
}

describe("CLI runtime boundary", () => {
  it("keeps BPlaying on the CLI managed runtime instead of importing the executable or layer", () => {
    const bPlayingSource = readBPlayingSource()

    expect(bPlayingSource).not.toMatch(importMainLiveFromBin)
    expect(bPlayingSource).not.toMatch(importMainLiveFromRuntime)
    expect(bPlayingSource).toMatch(importLiveRuntimeFromRuntime)
  })

  it("keeps MainLive and LiveRuntime in a non-executable runtime module", () => {
    const runtimeSource = readFileSync(runtimeSourcePath, "utf8")

    expect(runtimeSource).toMatch(/export\s+const\s+MainLive\s*=/)
    expect(runtimeSource).toMatch(runtimeLiveRuntimeExport)
    for (const forbiddenTerm of runtimeForbiddenTerms) {
      expect(runtimeSource).not.toContain(forbiddenTerm)
    }
    for (const forbiddenImport of runtimeForbiddenImports) {
      expect(runtimeSource).not.toMatch(forbiddenImport)
    }
  })

  it("keeps BPlaying Effect launches on LiveRuntime.runPromise", () => {
    const bPlayingSource = readBPlayingSource()
    const sourceFile = parseBPlayingSource(bPlayingSource)
    const liveRuntimeCalls = findCalls(
      sourceFile,
      "LiveRuntime",
      "runPromise"
    )

    expect(
      findPropertyAccesses(sourceFile, "Effect", "runPromise")
    ).toHaveLength(0)
    expect(findEffectProvideMainLiveCalls(sourceFile)).toHaveLength(0)
    expect(liveRuntimeCalls).toHaveLength(12)
    expect(
      liveRuntimeCalls.map((call) =>
        liveRuntimeCallClassification(call, sourceFile)
      )
    ).toEqual([
      "initial refreshWorldAndInventory",
      "travel runTravelToTarget target",
      "loot apiGetLootContainersFor player",
      "comma apiGetPickupItemsFor player",
      "directional runDirectionalMovement",
      "movement apiDoPlayerAction action value",
      "pickup apiDoPlayerAction pickupMulti",
      "drop apiDoPlayerAction dropMulti",
      "eat apiDoPlayerAction eatMulti",
      "quaff apiDoPlayerAction quaffMulti",
      "loot apiDoPlayerAction lootTakeMulti",
      "loot apiDoPlayerAction lootPutMulti"
    ])
  })

  it("keeps bin wired to the runtime layer and executable entrypoint", () => {
    const binSource = readFileSync(binSourcePath, "utf8")
    const binSourceFile = parseSource(
      binSourcePath,
      binSource,
      ts.ScriptKind.TS
    )

    expect(binSource).toMatch(importMainLiveFromRuntimeInBin)
    expect(
      findEffectProvideMainLiveCalls(binSourceFile).map((call) =>
        call.getText(binSourceFile)
      )
    ).toEqual(["Effect.provide(MainLive)"])
    expect(binSource).toMatch(executableMain)
    expect(binSource).not.toMatch(/LiveRuntime/)
  })
})
