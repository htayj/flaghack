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

const forbiddenListItemStyleRegressions = [
  {
    snippet: "position: \"absolute\"",
    pattern: /\bposition\s*:\s*"absolute"/
  },
  { snippet: "height: \"100%\"", pattern: /\bheight\s*:\s*"100%"/ },
  { snippet: "width: \"100%\"", pattern: /\bwidth\s*:\s*"100%"/ }
] as const

const listitemOpeningTagPattern = /<div(?=[^>]*\brole="listitem")[^>]*>/g

type RegressionFinding = {
  line: number
  snippet: string
  text: string
}

const findRegressions = (source: string): Array<RegressionFinding> =>
  source.split(/\r?\n/).flatMap((text, index) =>
    forbiddenRegressions
      .filter(({ pattern }) => pattern.test(text))
      .map(({ snippet }) => ({
        line: index + 1,
        snippet,
        text: text.trim()
      }))
  )

const findListItemStyleRegressions = (
  source: string
): Array<RegressionFinding> =>
  Array.from(source.matchAll(listitemOpeningTagPattern)).flatMap(
    (match) => {
      const startLine =
        source.slice(0, match.index ?? 0).split(/\r?\n/).length

      return match[0].split(/\r?\n/).flatMap((text, index) =>
        forbiddenListItemStyleRegressions
          .filter(({ pattern }) => pattern.test(text))
          .map(({ snippet }) => ({
            line: startLine + index,
            snippet,
            text: text.trim()
          }))
      )
    }
  )

describe("PickupPopup source regression guards", () => {
  it("keeps popup cleanup regressions out of the source", () => {
    expect(findRegressions(readFileSync(pickupPopupPath, "utf8")))
      .toEqual([])
  })

  it("keeps item rows from becoming full-size absolute overlays", () => {
    expect(
      findListItemStyleRegressions(readFileSync(pickupPopupPath, "utf8"))
    )
      .toEqual([])
  })
})
