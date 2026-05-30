import { describe, expect, it } from "@effect/vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const pickupPopupPath = fileURLToPath(
  new URL("../src/PickupPopup.tsx", import.meta.url)
)

const forbiddenRegressions = [
  { snippet: "[\"asdf\"]", pattern: /\[\s*"asdf"\s*\]/ },
  { snippet: "event: any", pattern: /event\s*:\s*any\b/ },
  { snippet: "key={i}", pattern: /key=\{\s*i\s*\}/ },
  { snippet: "event.keyCode", pattern: /event\.keyCode\b/ },
  {
    snippet: "content={item._tag}",
    pattern: /content=\{\s*item\._tag\s*\}/
  }
] as const

type RegressionFinding = {
  line: number
  snippet: string
  text: string
}

const findRegressions = (source: string): RegressionFinding[] =>
  source.split(/\r?\n/).flatMap((text, index) =>
    forbiddenRegressions
      .filter(({ pattern }) => pattern.test(text))
      .map(({ snippet }) => ({
        line: index + 1,
        snippet,
        text: text.trim()
      }))
  )

describe("PickupPopup source regression guards", () => {
  it("keeps popup cleanup regressions out of the source", () => {
    expect(findRegressions(readFileSync(pickupPopupPath, "utf8")))
      .toEqual([])
  })
})
