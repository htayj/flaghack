import { describe, expect, it } from "@effect/vitest"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const testDir = dirname(fileURLToPath(import.meta.url))
const bPlayingSourcePath = join(testDir, "../src/components/BPlaying.tsx")
const tuiGameSourcePath = join(testDir, "../src/tuiGame.ts")

const readBPlayingSource = () => readFileSync(bPlayingSourcePath, "utf8")
const readTuiGameSource = () => readFileSync(tuiGameSourcePath, "utf8")

const capturedGameBox = /const\s+gameBox\s*=\s*gameref\.current/
const gameBoxFocus = /gameBox\?\.focus\s*\(\s*\)/
const gameKeysDeclaration = /const\s+gameKeys\s*=\s*\[([\s\S]*?)\]/
const namedGameKeyHandler =
  /const\s+handleGameKey\s*=\s*\(\s*input\s*:\s*string(?:\s*,\s*key\s*\?\s*:\s*BlessedKeyLike)?\s*\)\s*=>\s*{/
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
  /export\s+const\s+drawWorld\s*=\s*\([\s\S]*?\n}\n/
const drawWorldWorldOnlySignature =
  /export\s+const\s+drawWorld\s*=\s*\(\s*world\s*:\s*World\s*,\s*travelTarget\?\s*:\s*Pos\s*\)\s*:\s*Tiles\s*=>\s*{/
const consoleLogReference = /console\s*\.\s*log/

const expectedGameKeys = [
  "h",
  "j",
  "k",
  "l",
  "y",
  "u",
  "b",
  "n",
  "S-h",
  "S-j",
  "S-k",
  "S-l",
  "S-y",
  "S-u",
  "S-b",
  "S-n",
  "S-g",
  "S-m",
  "C-h",
  "C-j",
  "C-k",
  "C-l",
  "C-y",
  "C-u",
  "C-b",
  "C-n",
  "backspace",
  "linefeed",
  "g",
  "m",
  ".",
  "_",
  "d",
  ",",
  "#",
  "S-3",
  "q",
  "i",
  "t",
  "enter",
  "return",
  "escape"
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
    const source = readTuiGameSource()
    const helperSource = source.match(drawWorldHelperSource)?.[0] ?? ""

    expect(helperSource).not.toBe("")
    expect(helperSource).toMatch(drawWorldWorldOnlySignature)
    expect(helperSource).not.toMatch(consoleLogReference)
  })
})
