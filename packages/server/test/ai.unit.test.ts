import { describe, expect, it } from "@effect/vitest"
import { GameState } from "@flaghack/domain/schemas"
import { Effect, HashMap } from "effect"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { allAiPlan } from "../src/ai/ai.js"
import type { Entity } from "../src/world.js"

const aiSourcePath = fileURLToPath(
  new URL("../src/ai/ai.ts", import.meta.url)
)

const readAiSource = () => readFileSync(aiSourcePath, "utf8")

describe("server ai planning", () => {
  it("plans only non-player creatures from the world", () => {
    const player = {
      key: "player",
      at: { x: 1, y: 1, z: 0 },
      in: "world",
      _tag: "player",
      name: "you"
    } satisfies Entity
    const hippie = {
      key: "hippie-1",
      at: { x: 50, y: 3, z: 0 },
      in: "world",
      _tag: "hippie",
      name: "Ian"
    } satisfies Entity
    const item = {
      key: "flag-1",
      at: { x: 2, y: 1, z: 0 },
      in: "world",
      _tag: "flag"
    } satisfies Entity
    const terrain = {
      key: "floor-1",
      at: { x: 1, y: 2, z: 0 },
      in: "world",
      _tag: "floor"
    } satisfies Entity
    const gs = GameState.make({
      world: HashMap.fromIterable<string, Entity>([
        [player.key, player],
        [hippie.key, hippie],
        [item.key, item],
        [terrain.key, terrain]
      ])
    })

    const planned = Effect.runSync(allAiPlan(gs))
    const plannedKeys = planned.map(({ entity }) => entity.key)

    expect(new Set(plannedKeys)).toEqual(new Set([hippie.key]))
    expect(plannedKeys).not.toContain(player.key)
    expect(plannedKeys).not.toContain(item.key)
    expect(plannedKeys).not.toContain(terrain.key)
  })

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

  it("filters the world to non-player creatures before planning", () => {
    const aiSource = readAiSource()
    const allAiPlanIndex = aiSource.indexOf("export const allAiPlan")

    expect(aiSource).toContain("const isNonPlayerCreature")
    expect(aiSource).toContain("const nonPlayerCreaturesFrom")
    expect(aiSource).toContain("filter(isNonPlayerCreature)")
    expect(allAiPlanIndex).toBeGreaterThanOrEqual(0)

    const allAiPlanSource = aiSource.slice(allAiPlanIndex)
    const filterIndex = allAiPlanSource.indexOf(
      "andThen(nonPlayerCreaturesFrom)"
    )
    const planIndex = allAiPlanSource.indexOf("andThen(planAllAi(gs))")

    expect(filterIndex).toBeGreaterThanOrEqual(0)
    expect(planIndex).toBeGreaterThan(filterIndex)
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
