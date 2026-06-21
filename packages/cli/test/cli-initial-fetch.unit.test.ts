import { describe, expect, it } from "@effect/vitest"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const bPlayingSourcePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../src/components/BPlaying.tsx"
)

const initialFetchRenderBodyPattern =
  /if\s*\(\s*world\s*===\s*undefined\s*\|\|\s*size\s*\(\s*world\s*\)\s*===\s*0\s*\)\s*{\s*apiGetWorld\s*\.pipe/
const lifecycleInitialFetchPattern =
  /useEffect\s*\(\s*\(\)\s*=>\s*{[\s\S]*?refreshWorldAndInventory\s*\.pipe/

const renderBodyBeforeFirstEffect = (source: string) => {
  const componentStart = source.indexOf("export default function BPlaying")
  expect(componentStart).toBeGreaterThanOrEqual(0)

  const firstEffect = source.indexOf("useEffect(", componentStart)
  expect(firstEffect).toBeGreaterThanOrEqual(0)

  return source.slice(componentStart, firstEffect)
}

describe("CLI initial fetch lifecycle", () => {
  it("does not start the empty-world fetch from the render body", () => {
    const source = readFileSync(bPlayingSourcePath, "utf8")

    expect(renderBodyBeforeFirstEffect(source)).not.toMatch(
      initialFetchRenderBodyPattern
    )
  })

  it("keeps the initial world and inventory fetch lifecycle-driven from useEffect", () => {
    const source = readFileSync(bPlayingSourcePath, "utf8")

    expect(source).toMatch(lifecycleInitialFetchPattern)
  })
})
