import { describe, expect, it } from "@effect/vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const pickupPopupPath = fileURLToPath(
  new URL("../src/PickupPopup.tsx", import.meta.url)
)
const playingPath = fileURLToPath(
  new URL("../src/Playing.tsx", import.meta.url)
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

  it("keeps dead popup props out of PickupPopup and Playing", () => {
    const pickupPopupSource = readFileSync(pickupPopupPath, "utf8")
    const playingSource = readFileSync(playingPath, "utf8")

    expect(pickupPopupSource).not.toContain("pickupRef")
    expect(pickupPopupSource).not.toMatch(/\blog\s*:/)
    expect(pickupPopupSource).not.toMatch(/\blog\s*=/)
    expect(playingSource).not.toContain("pickupRef")
    expect(playingSource).not.toMatch(/\bconst\s+log\b/)
    expect(playingSource).not.toMatch(/\blog\s*=\s*\{/)
  })

  it("keeps popup focus and keyboard handling local to the dialog", () => {
    const pickupPopupSource = readFileSync(pickupPopupPath, "utf8")

    expect(pickupPopupSource).toMatch(
      /\bconst\s+dialogRef\s*=\s*useRef\s*<\s*HTMLDivElement\s*>\s*\(\s*null\s*\)/
    )
    expect(pickupPopupSource).toMatch(/ref\s*=\s*\{\s*dialogRef\s*\}/)
    expect(pickupPopupSource).toMatch(/tabIndex\s*=\s*\{\s*-1\s*\}/)
    expect(pickupPopupSource).toMatch(
      /if\s*\(\s*!\s*open\s*\)\s*\{\s*return\s*\}/
    )
    expect(pickupPopupSource).toMatch(
      /dialogRef\.current\?\.\s*focus\s*\(\s*\)/
    )
    expect(pickupPopupSource).toMatch(
      /event\.stopPropagation\s*\(\s*\)/
    )
    expect(
      pickupPopupSource.match(/event\.preventDefault\s*\(\s*\)/g)
        ?.length ?? 0
    ).toBeGreaterThanOrEqual(3)
  })

  it("keeps item rows from becoming full-size absolute overlays", () => {
    expect(
      findListItemStyleRegressions(readFileSync(pickupPopupPath, "utf8"))
    )
      .toEqual([])
  })
})
