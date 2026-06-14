import { describe, expect, it } from "@effect/vitest"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { vi } from "vitest"

const testDir = dirname(fileURLToPath(import.meta.url))
const bspSourcePath = join(testDir, "../src/testBSP.ts")
const drawUtilsSourcePath = join(testDir, "../src/testDrawUtils.ts")

const readBspSource = () => readFileSync(bspSourcePath, "utf8")
const readDrawUtilsSource = () => readFileSync(drawUtilsSourcePath, "utf8")

describe("debug BSP modules", () => {
  it("does not log when debug drawing modules are imported", async () => {
    vi.resetModules()
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    try {
      const drawUtilsModule = await import(
        "../src/testDrawUtils.js"
      ) as unknown as Record<string, unknown>
      const bspModule = await import(
        "../src/testBSP.js"
      ) as unknown as Record<string, unknown>

      expect(drawUtilsModule["simpleDraw"]).toEqual(expect.any(Function))
      expect(drawUtilsModule["dijDraw"]).toEqual(expect.any(Function))
      expect(bspModule["renderBspDemo"]).toEqual(expect.any(Function))
      expect(bspModule["runBspDemo"]).toEqual(expect.any(Function))
      expect(logSpy).not.toHaveBeenCalled()
    } finally {
      logSpy.mockRestore()
    }
  })

  it("keeps BSP generation behind exported helpers and a direct-entry guard", () => {
    const bspSource = readBspSource()
    const drawUtilsSource = readDrawUtilsSource()

    expect(drawUtilsSource).not.toContain("console.log(\"testing bsp\")")
    expect(bspSource).toContain("export const makeBspDemoLevels")
    expect(bspSource).toContain("export const renderBspDemo")
    expect(bspSource).toContain("export const runBspDemo")
    expect(bspSource).toMatch(
      /fileURLToPath\s*\(\s*import\.meta\.url\s*\)/
    )
    expect(bspSource).toMatch(/resolve\s*\(\s*process\.argv\[1\]\s*\)/)
    expect(bspSource).not.toMatch(/^const\s+levels\s*=/m)
    expect(
      bspSource.slice(
        0,
        bspSource.indexOf("export const makeBspDemoLevels")
      )
    ).not.toContain("BSPGenLevel(")
  })

  it("requires BSP demo logging at the executable boundary", () => {
    const bspSource = readBspSource()

    expect(bspSource).toMatch(
      /export const runBspDemo\s*=\s*\(\s*log\s*:\s*DemoLog\s*\)\s*:\s*void\s*=>/
    )
    expect(bspSource).not.toMatch(
      /export const runBspDemo\s*=\s*\([^)]*=\s*console\.log/
    )
    expect(bspSource).toMatch(
      /if\s*\(\s*isDirectEntry\s*\)\s*{\s*runBspDemo\s*\(\s*console\.log\s*\)\s*}/
    )
  })

  it("keeps draw utils tile mappings statically typed", () => {
    const legacyTileCast = ["as", "Tile"].join(" ")

    expect(readDrawUtilsSource()).not.toContain(legacyTileCast)
  })

  it("still renders the BSP demo on demand", async () => {
    vi.resetModules()
    const { runBspDemo } = await import(
      "../src/testBSP.js"
    ) as unknown as {
      runBspDemo: (log: (message: string) => void) => void
    }
    const output: Array<string> = []

    runBspDemo((message) => output.push(message))

    const renderedOutput = output.join("\n")
    expect(renderedOutput).toContain("i: 0")
    expect(renderedOutput).toContain("i: 5")
  })
})
