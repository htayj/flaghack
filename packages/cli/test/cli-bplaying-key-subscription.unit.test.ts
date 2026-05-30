import { describe, expect, it } from "@effect/vitest"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const bPlayingSourcePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../src/components/BPlaying.tsx"
)

const readBPlayingSource = () => readFileSync(bPlayingSourcePath, "utf8")

const capturedGameBox = /const\s+gameBox\s*=\s*gameref\.current/
const gameBoxFocus = /gameBox\?\.focus\s*\(\s*\)/
const gameKeysDeclaration = /const\s+gameKeys\s*=\s*\[([\s\S]*?)\]/
const namedGameKeyHandler =
  /const\s+handleGameKey\s*=\s*\(\s*input\s*:\s*string\s*\)\s*=>\s*{/
const registrationWithHandler =
  /gameBox\?\.key\s*\(\s*gameKeys\s*,\s*handleGameKey\s*\)/
const cleanupLoopOverGameKeys =
  /for\s*\(\s*const\s+key\s+of\s+gameKeys\s*\)/
const exactCleanupWithSameHandler =
  /\.removeListener\s*\(\s*`key \$\{key\}`\s*,\s*handleGameKey\s*\)/
const inlineKeyHandler =
  /\.key\s*\(\s*\[[\s\S]*?\]\s*,\s*\(\s*input\s*:\s*string\s*\)\s*=>/
const unkeyCleanup = /\.unkey\s*\(/
const unkeyAnonymousNoopCallback =
  /\.unkey\s*\([\s\S]*?\(\)\s*=>\s*undefined[\s\S]*?\)/
const removeListenerAnonymousNoopCallback =
  /\.removeListener\s*\([\s\S]*?\(\)\s*=>\s*undefined[\s\S]*?\)/
const modeUseStateInitializer =
  /useState\s*<\s*Mode\s*>\s*\(\s*"normal"\s*\)/
const modeUseStateBinding =
  /const\s*\[\s*mode\b[\s\S]*?\]\s*=\s*useState\b/
const drawWorldHelperSource =
  /const\s+drawWorld\s*=\s*\([\s\S]*?\n}\ntype\s+Mode\b/
const drawWorldWorldOnlySignature =
  /const\s+drawWorld\s*=\s*\(\s*world\s*:\s*World\s*\)\s*:\s*Tiles\s*=>\s*{/
const consoleLogReference = /console\s*\.\s*log/

const expectedGameKeys = [
  "j",
  "k",
  "l",
  "h",
  "y",
  "d",
  "u",
  "n",
  "b",
  ","
] as const

describe("CLI BPlaying key subscription static guards", () => {
  it("registers game keys with an effect-local stable handler", () => {
    const source = readBPlayingSource()

    expect(source).not.toMatch(inlineKeyHandler)
    expect(source).toMatch(capturedGameBox)
    expect(source).toMatch(gameBoxFocus)
    expect(source).toMatch(namedGameKeyHandler)
    expect(source).toMatch(registrationWithHandler)
  })

  it("cleans up game key listeners with exact event names and callback identity", () => {
    const source = readBPlayingSource()

    expect(source).not.toMatch(unkeyCleanup)
    expect(source).not.toMatch(unkeyAnonymousNoopCallback)
    expect(source).not.toMatch(removeListenerAnonymousNoopCallback)
    expect(source).toMatch(cleanupLoopOverGameKeys)
    expect(source).toMatch(exactCleanupWithSameHandler)
  })

  it("keeps comma in the registered game key list", () => {
    const source = readBPlayingSource()
    const match = source.match(gameKeysDeclaration)
    const gameKeysInitializer = match?.[1] ?? ""

    expect(match).not.toBeNull()
    for (const key of expectedGameKeys) {
      expect(gameKeysInitializer).toContain(`"${key}"`)
    }
  })

  it("keeps the static UI mode out of React state", () => {
    const source = readBPlayingSource()

    expect(source).not.toMatch(modeUseStateInitializer)
    expect(source).not.toMatch(modeUseStateBinding)
  })

  it("keeps drawWorld free of default console.log debug dependencies", () => {
    const source = readBPlayingSource()
    const helperSource = source.match(drawWorldHelperSource)?.[0] ?? ""

    expect(helperSource).not.toBe("")
    expect(helperSource).toMatch(drawWorldWorldOnlySignature)
    expect(helperSource).not.toMatch(consoleLogReference)
  })
})
