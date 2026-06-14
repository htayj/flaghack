import { describe, expect, it } from "@effect/vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const gameRepositorySourcePath = fileURLToPath(
  new URL("../src/GameRepository.ts", import.meta.url)
)

const readGameRepositorySource = () =>
  readFileSync(gameRepositorySourcePath, "utf8")

describe("GameRepository source", () => {
  it("constructs the service directly without generator or Effect wrapper delegates", () => {
    const source = readGameRepositorySource()

    expect(source).toContain(
      "import type { Action } from \"@flaghack/domain/schemas\""
    )
    expect(source).toContain("import type { TKey } from \"./entity.js\"")
    expect(source).toContain("import { Effect } from \"effect\"")
    expect(source).not.toMatch(/\bpipe\b/)

    expect(source).toMatch(/effect:\s*Effect\.succeed\(\s*\{/)
    expect(source).not.toContain("Effect.gen(function*")

    expect(source).toMatch(
      /getPickupItemsFor\(k: TKey\) \{\s*return apiGetPickupItemsFor\(k\)\s*\}/
    )
    expect(source).toMatch(
      /doPlayerAction\(action: Action\) \{\s*return apiDoPlayerAction\(action\)\s*\}/
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
