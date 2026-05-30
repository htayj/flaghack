import { describe, expect, it } from "@effect/vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const aiSourcePath = fileURLToPath(
  new URL("../src/ai/ai.ts", import.meta.url)
)

const readAiSource = () => readFileSync(aiSourcePath, "utf8")

describe("server ai planning", () => {
  it("uses synchronous effects for pure AI planning", () => {
    const aiSource = readAiSource()
    const effectConstructorImport = aiSource.match(
      /import\s*\{(?<imports>[\s\S]*?)\}\s*from\s*["']effect\/Effect["']/
    )

    expect(effectConstructorImport?.groups?.imports ?? "").not.toMatch(
      /\bpromise\b/
    )
    expect(aiSource).not.toContain("promise(async")
    expect(aiSource).not.toContain("Effect.promise")
    expect(aiSource).toContain("export const allAiPlan")
    expect(aiSource).toMatch(
      /succeed\(\{\s*entity:\s*e,\s*action:\s*ai\(gs\)\(e\)\s*\}\)/
    )
  })

  it("makes allAiPlan concurrency explicit", () => {
    const aiSource = readAiSource()
    const allAiPlanIndex = aiSource.indexOf("export const allAiPlan")

    expect(allAiPlanIndex).toBeGreaterThanOrEqual(0)

    const allAiPlanSource = aiSource.slice(allAiPlanIndex)

    expect(allAiPlanSource).not.toContain("todo: set concurrency")
    expect(allAiPlanSource).not.toMatch(/andThen\(\s*all\s*\)/)
    expect(allAiPlanSource).toMatch(
      /all\(\s*[^,]+,\s*\{\s*concurrency\s*:\s*1\s*\}/s
    )
  })
})
