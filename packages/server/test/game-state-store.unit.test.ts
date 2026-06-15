import { describe, expect, it } from "@effect/vitest"
import { GameState } from "@flaghack/domain/schemas"
import { Effect, HashMap, Option } from "effect"
import { player } from "../src/creatures.js"
import { GameStateStore } from "../src/GameStateStore.js"
import type { Entity } from "../src/world.js"

const emptyState = () =>
  GameState.make({
    world: HashMap.empty<string, Entity>()
  })

describe("GameStateStore", () => {
  it("lazily initializes the state once per store layer", () => {
    let initCalls = 0
    const initialState = Effect.sync(() => {
      initCalls += 1
      return emptyState()
    })

    const program = Effect.gen(function*() {
      const store = yield* GameStateStore
      const first = yield* store.get
      const second = yield* store.get

      return [first, second] as const
    })

    const [first, second] = Effect.runSync(
      program.pipe(Effect.provide(GameStateStore.Default(initialState)))
    )

    expect(initCalls).toBe(1)
    expect(second).toBe(first)
  })

  it("applies modifyEffect atomically and stores the returned state", () => {
    const actor = player(1, 2, 0)
    const initialState = Effect.succeed(emptyState())

    const program = Effect.gen(function*() {
      const store = yield* GameStateStore
      const result = yield* store.modifyEffect((state) =>
        Effect.succeed(
          [
            "updated",
            GameState.make({
              world: state.world.pipe(
                HashMap.set(actor.key, actor as Entity)
              )
            })
          ] as const
        )
      )
      const next = yield* store.get

      return { result, next }
    })

    const { next, result } = Effect.runSync(
      program.pipe(Effect.provide(GameStateStore.Default(initialState)))
    )

    expect(result).toBe("updated")
    expect(Option.isSome(next.world.pipe(HashMap.get(actor.key)))).toBe(
      true
    )
  })
})
