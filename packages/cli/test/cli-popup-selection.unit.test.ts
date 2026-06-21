import { describe, expect, it } from "@effect/vitest"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const testDirectory = dirname(fileURLToPath(import.meta.url))
const componentDirectory = join(testDirectory, "../src/components")

const popupComponentPaths = [
  join(componentDirectory, "PickupPopup.tsx"),
  join(componentDirectory, "LootPopup.tsx"),
  join(componentDirectory, "popup.tsx")
] as const

const listComponentPaths = [
  ...popupComponentPaths,
  join(componentDirectory, "Inventory.tsx")
] as const

const readSource = (path: string) => readFileSync(path, "utf8")

const unkeyAnonymousNoopCallback =
  /\.unkey\s*\([\s\S]*?\(\)\s*=>\s*undefined[\s\S]*?\)/
const splitStringKeyCleanup = /\.unkey\s*\(\s*key\s*,/
const exactControlKeyCleanup =
  /\.removeListener\s*\(\s*`key \$\{key\}`\s*,\s*handleControlKey\s*\)/
const exactSubmitKeyCleanup =
  /\.removeListener\s*\(\s*`key \$\{key\}`\s*,\s*handleSubmitKey\s*\)/
const exactLetterKeyCleanup =
  /\.removeListener\s*\(\s*`key \$\{key\}`\s*,\s*handleLetterKey\s*\)/
const emptyElseBranch = /else\s*{\s*}/

describe("CLI popup selection static guards", () => {
  it("does not seed popup selection with an invalid placeholder key", () => {
    for (const path of popupComponentPaths) {
      expect(readSource(path)).not.toContain("[\"asdf\"]")
    }
  })

  it("does not unregister blessed keys with an anonymous noop callback", () => {
    for (const path of popupComponentPaths) {
      expect(readSource(path)).not.toMatch(unkeyAnonymousNoopCallback)
    }
  })

  it("unregisters blessed key handlers with exact event names and callback identity", () => {
    for (const path of popupComponentPaths) {
      const source = readSource(path)

      expect(source).not.toMatch(splitStringKeyCleanup)
      expect(source).toMatch(exactControlKeyCleanup)
      expect(source).toMatch(exactSubmitKeyCleanup)
    }
  })

  it("uses stable item keys for rendered popup and inventory list rows", () => {
    for (const path of listComponentPaths) {
      expect(readSource(path)).not.toContain("key={i}")
    }
  })

  it("uses shared item-letter helpers for list rendering and letter toggles", () => {
    for (const path of listComponentPaths) {
      expect(readSource(path)).toContain("itemLetters.js")
    }
    for (const path of popupComponentPaths) {
      const source = readSource(path)

      expect(source).toContain("toggleLetterSelection")
      expect(source).toMatch(exactLetterKeyCleanup)
    }
  })

  it("places pickup in the inventory/sidebar slot", () => {
    const source = readSource(join(componentDirectory, "PickupPopup.tsx"))

    expect(source).toContain("top={MESSAGE_LOG_HEIGHT}")
    expect(source).toContain("right={0}")
    expect(source).toContain("height={PLAY_AREA_HEIGHT}")
    expect(source).toContain("width={15}")
    expect(source).toContain("width={13}")
  })

  it("cancels with escape and filters stale marked keys before submit", () => {
    for (const path of popupComponentPaths) {
      const source = readSource(path)

      expect(source).toContain("\"escape\"")
      expect(source).toContain("setMarked(new Set())")
      expect(source).toContain(".filter((key) =>")
      expect(source).toContain(".has(key)")
    }
  })

  it("does not keep empty else branches in popup keyboard handlers", () => {
    for (const path of popupComponentPaths) {
      expect(readSource(path)).not.toMatch(emptyElseBranch)
    }
  })
})
