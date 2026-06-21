import { describe, expect, it } from "@effect/vitest"
import {
  assignItemLetters,
  itemKeyForLetter,
  itemLetterAlphabet,
  renderItemLabel,
  toggleLetterSelection
} from "../src/components/itemLetters.js"

const items = [
  { key: "item-c", _tag: "salsa" },
  { key: "item-a", _tag: "beer" },
  { key: "item-b", _tag: "cheese" }
]

describe("CLI item letter helpers", () => {
  it("assigns deterministic letters by item key", () => {
    expect(assignItemLetters(items)).toEqual([
      { letter: "a", item: { key: "item-a", _tag: "beer" } },
      { letter: "b", item: { key: "item-b", _tag: "cheese" } },
      { letter: "c", item: { key: "item-c", _tag: "salsa" } }
    ])
  })

  it("skips reserved cancel letters", () => {
    expect(itemLetterAlphabet).not.toContain("q")
    expect(itemLetterAlphabet).not.toContain("r")
  })

  it("maps keyboard letters to item keys case-insensitively", () => {
    expect(itemKeyForLetter(items, "A")).toBe("item-a")
    expect(itemKeyForLetter(items, "b")).toBe("item-b")
    expect(itemKeyForLetter(items, "q")).toBeUndefined()
  })

  it("toggles selections without mutating the original set", () => {
    const selected = new Set<string>()
    const marked = toggleLetterSelection(items, selected, "a")
    const unmarked = toggleLetterSelection(items, marked, "a")

    expect(selected.size).toBe(0)
    expect(marked.has("item-a")).toBe(true)
    expect(unmarked.has("item-a")).toBe(false)
  })

  it("renders lettered labels", () => {
    const [first] = assignItemLetters(items)
    expect(first).toBeDefined()
    if (first === undefined) {
      throw new Error("expected first lettered item")
    }
    expect(renderItemLabel(first)).toBe("a - beer")
  })
})
