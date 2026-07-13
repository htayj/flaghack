import { describe, expect, it } from "@effect/vitest"
import { EAction, GameState } from "@flaghack/domain/schemas"
import { Effect, HashMap, Stream } from "effect"
import { player } from "../src/creatures.js"
import { GamePersistence } from "../src/GamePersistence.js"
import { GameRepository } from "../src/GameRepository.js"
import { GameStateStore } from "../src/GameStateStore.js"
import { GameUpdateHub } from "../src/GameUpdateHub.js"
import { makeFloor } from "../src/terrain.js"
import type { Entity } from "../src/world.js"

const stateWithPlayer = () => {
  const actor = player(0, 0, 0)
  const floor = makeFloor("floor-0", 0, 0, 0)

  return GameState.make({
    setup: { phase: "complete" },
    world: HashMap.fromIterable([
      [actor.key, actor as Entity],
      [floor.key, floor as Entity]
    ])
  })
}

const provideTestRepository = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    GameRepository | GameStateStore | GamePersistence | GameUpdateHub
  >
) =>
  effect.pipe(
    Effect.provide(GameRepository.DefaultWithoutDependencies),
    Effect.provide(GameUpdateHub.Default),
    Effect.provide(
      GameStateStore.Default(Effect.succeed(stateWithPlayer()))
    ),
    Effect.provide(
      GamePersistence.Default("/tmp/flag-hack-stream-test-save.json")
    )
  )

describe("GameRepository client-state stream publishing", () => {
  it("publishes ordered snapshots after authoritative mutations but not reads", async () => {
    const program = Effect.gen(function*() {
      const repository = yield* GameRepository
      const hub = yield* GameUpdateHub
      const updates = hub.clientStateEvents
      const collect = Stream.runCollect(Stream.take(updates, 2))

      const fiber = yield* Effect.fork(collect)
      yield* repository.getClientState
      yield* repository.doPlayerAction(EAction.noop())
      yield* repository.getWorld
      yield* repository.quitGame
      const received = yield* Effect.fromFiber(fiber)

      return Array.from(received)
    })

    const events = await Effect.runPromise(provideTestRepository(program))

    expect(events.map((event) => event.revision)).toEqual([1, 2])
    expect(events.map((event) => event.source)).toEqual(["action", "quit"])
    expect(events[0]?.clientState.world.pipe(HashMap.size))
      .toBeGreaterThan(0)
    expect(events[1]?.terminal).toBe("quit")
  })

  it("provides an initial stream snapshot without incrementing the revision", async () => {
    const program = Effect.gen(function*() {
      const repository = yield* GameRepository
      const hub = yield* GameUpdateHub
      const initial = yield* repository.getClientStateStreamSnapshot
      const revision = yield* hub.currentRevision
      return { initial, revision }
    })

    const { initial, revision } = await Effect.runPromise(
      provideTestRepository(program)
    )

    expect(revision).toBe(0)
    expect(initial).toMatchObject({ revision: 0, source: "initial" })
    expect(initial.clientState.world.pipe(HashMap.size)).toBeGreaterThan(0)
  })

  it("marks initial stream snapshots as terminal after quit", async () => {
    const program = Effect.gen(function*() {
      const repository = yield* GameRepository

      yield* repository.quitGame
      return yield* repository.getClientStateStreamSnapshot
    })

    const initial = await Effect.runPromise(provideTestRepository(program))

    expect(initial).toMatchObject({
      revision: 1,
      source: "initial",
      terminal: "quit"
    })
    expect(initial.clientState.campground).toEqual({
      discoveredLandmarks: []
    })
    expect(initial.clientState.world.pipe(HashMap.size)).toBe(0)
  })
})
