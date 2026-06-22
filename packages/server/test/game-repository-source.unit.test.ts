import { describe, expect, it } from "@effect/vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const gameRepositorySourcePath = fileURLToPath(
  new URL("../src/GameRepository.ts", import.meta.url)
)

const readGameRepositorySource = () =>
  readFileSync(gameRepositorySourcePath, "utf8")

describe("GameRepository source", () => {
  it("constructs the service with the default game state store dependency", () => {
    const source = readGameRepositorySource()

    expect(source).toContain(
      "import type { Action } from \"@flaghack/domain/schemas\""
    )
    expect(source).toContain("import type { TKey } from \"./entity.js\"")
    expect(source).toContain(
      "import { Effect, HashMap, Option, Ref } from \"effect\""
    )
    expect(source).toContain("import { measureEffect } from \"./perf.js\"")
    expect(source).toContain("DefaultGameStateStoreLive")
    expect(source).toContain("GamePersistence")

    expect(source).toContain("dependencies: [DefaultGameStateStoreLive]")
    expect(source).toContain("const store = yield* GameStateStore")
    expect(source).toContain("const persistence = yield* GamePersistence")
    expect(source).toContain(
      "Effect.provideService(effect, GameStateStore, store)"
    )
    expect(source).toMatch(/scoped:\s*Effect\.gen\(function\*/)

    expect(source).toMatch(
      /getPickupItemsFor\(k: TKey\) \{\s*return measureEffect\([\s\S]*withRestoredStore\([\s\S]*apiGetPickupItemsFor\(k\)[\s\S]*HashMap\.empty\(\)[\s\S]*\)\s*\}/
    )
    expect(source).toMatch(
      /withRestoredMutationAndSave\s*=\s*<E>\([\s\S]*Effect\.tap\(\(\) => saveCurrentGameUnlocked\)[\s\S]*lifecycleSemaphore\.withPermits\(1\)/
    )
    expect(source).toContain("terminalLifecycleRef")
    expect(source).toMatch(
      /doPlayerAction\(action: Action\) \{\s*return measureEffect\([\s\S]*withRestoredMutationAndSave\(apiDoPlayerAction\(action\)\)[\s\S]*\)\s*\}/
    )
    expect(source).not.toContain("Effect.succeed(k)")
    expect(source).not.toContain("Effect.succeed(action)")
    expect(source).not.toMatch(
      /Effect\.andThen\s*\(\s*apiGetPickupItemsFor\s*\)/
    )
    expect(source).not.toMatch(
      /Effect\.andThen\s*\(\s*apiDoPlayerAction\s*\)/
    )
  })
})
