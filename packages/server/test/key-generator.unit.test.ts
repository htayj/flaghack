import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import {
  CounterKeyGeneratorLive,
  KeyGenerator
} from "../src/keyGenerator.js"

const nextThreeKeys = Effect.gen(function*() {
  const keyGenerator = yield* KeyGenerator

  return [
    yield* keyGenerator.nextKey,
    yield* keyGenerator.nextKey,
    yield* keyGenerator.nextKey
  ] as const
})

describe("CounterKeyGeneratorLive", () => {
  it("generates deterministic unique keys from a Ref-backed service", () => {
    const keys = Effect.runSync(
      nextThreeKeys.pipe(Effect.provide(CounterKeyGeneratorLive))
    )

    expect(keys).toEqual(["entity-0", "entity-1", "entity-2"])
  })

  it("starts from the same key for each fresh layer", () => {
    const firstRun = Effect.runSync(
      nextThreeKeys.pipe(Effect.provide(CounterKeyGeneratorLive))
    )
    const secondRun = Effect.runSync(
      nextThreeKeys.pipe(Effect.provide(CounterKeyGeneratorLive))
    )

    expect(secondRun).toEqual(firstRun)
  })
})
