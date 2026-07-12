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
    expect(source).toContain("GameUpdateHub")

    expect(source).toContain(
      "dependencies: [DefaultGameStateStoreLive, GameUpdateHub.Default]"
    )
    expect(source).toContain("const store = yield* GameStateStore")
    expect(source).toContain("const persistence = yield* GamePersistence")
    expect(source).toContain("const updateHub = yield* GameUpdateHub")
    expect(source).toContain(
      "Effect.provideService(effect, GameStateStore, store)"
    )
    expect(source).toMatch(/scoped:\s*Effect\.gen\(function\*/)

    expect(source).toMatch(
      /getPickupItemsFor\(k: TKey\) \{\s*return measureEffect\([\s\S]*withRestoredStore\([\s\S]*apiGetPickupItemsFor\(k\)[\s\S]*HashMap\.empty\(\)[\s\S]*\)\s*\}/
    )
    expect(source).toMatch(
      /withRestoredMutationWithoutAutosave\s*=\s*<E>\([\s\S]*deleteSaveIfPlayerMissingUnlocked[\s\S]*lifecycleSemaphore\.withPermits\(1\)/
    )
    expect(source).toContain("persistence.restorePreserving")
    expect(source).toMatch(
      /withRestoredTransformAndSaveIfChanged\s*=\s*\([\s\S]*nextState !== state[\s\S]*changed[\s\S]*\? saveCurrentGameUnlocked[\s\S]*publishClientStateUnlocked\(source\)[\s\S]*: deleteSaveIfPlayerMissingUnlocked[\s\S]*lifecycleSemaphore\.withPermits\(1\)/
    )
    expect(source).toContain("terminalLifecycleRef")
    expect(source).toMatch(
      /doPlayerAction\(action: Action\) \{\s*return measureEffect\([\s\S]*withRestoredMutationWithoutAutosave\([\s\S]*"action"[\s\S]*apiDoPlayerAction\(action\)[\s\S]*\)\s*\}/
    )
    expect(source).toMatch(
      /selectRole\(roleId: RoleId\) \{\s*return measureEffect\([\s\S]*withRestoredTransformAndSaveIfChanged\([\s\S]*"setup"[\s\S]*selectRoleForGameState\(state, roleId\)[\s\S]*\)\s*\}/
    )
    expect(source).toMatch(
      /confirmSetup\(confirm: boolean\) \{\s*return measureEffect\([\s\S]*withRestoredTransformAndSaveIfChanged\([\s\S]*"setup"[\s\S]*confirmSetupForGameState\(state, confirm\)[\s\S]*\)\s*\}/
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
