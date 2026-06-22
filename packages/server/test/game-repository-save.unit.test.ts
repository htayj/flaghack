import { describe, expect, it } from "@effect/vitest"
import { EAction, GameState } from "@flaghack/domain/schemas"
import { Effect, HashMap, Option } from "effect"
import { access, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { player } from "../src/creatures.js"
import { GamePersistence } from "../src/GamePersistence.js"
import { GameRepository } from "../src/GameRepository.js"
import { GameStateStore } from "../src/GameStateStore.js"
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

const stateWithoutPlayer = () =>
  GameState.make({
    setup: { phase: "complete" },
    world: HashMap.fromIterable([
      ["floor-0", makeFloor("floor-0", 0, 0, 0) as Entity]
    ])
  })

const withTempSavePath = async <A>(
  test: (saveFilePath: string) => Promise<A>
): Promise<A> => {
  const dir = await mkdtemp(join(tmpdir(), "flag-hack-repo-save-test-"))
  try {
    return await test(join(dir, "save.json"))
  } finally {
    await rm(dir, { force: true, recursive: true })
  }
}

const exists = async (path: string): Promise<boolean> =>
  access(path).then(
    () => true,
    () => false
  )

const provideTestRepository = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    GameRepository | GameStateStore | GamePersistence
  >,
  saveFilePath: string,
  initialState = stateWithPlayer()
) =>
  effect.pipe(
    Effect.provide(GameRepository.DefaultWithoutDependencies),
    Effect.provide(GameStateStore.Default(Effect.succeed(initialState))),
    Effect.provide(GamePersistence.Default(saveFilePath))
  )

describe("GameRepository save lifecycle", () => {
  it("saveGame writes a save and only explicit restore consumes it", async () => {
    await withTempSavePath(async (saveFilePath) => {
      const program = Effect.gen(function*() {
        const repository = yield* GameRepository
        const store = yield* GameStateStore

        yield* store.get
        yield* repository.saveGame
        const afterSave = yield* store.peek
        const saveExistsAfterSave = yield* Effect.promise(() =>
          exists(saveFilePath)
        )
        const staleReadWorld = yield* repository.getWorld
        const afterStaleRead = yield* store.peek
        const saveExistsAfterStaleRead = yield* Effect.promise(() =>
          exists(saveFilePath)
        )
        yield* repository.restoreGame
        const restoredWorld = yield* repository.getWorld
        const afterRestoreRead = yield* store.peek
        const saveExistsAfterRestore = yield* Effect.promise(() =>
          exists(saveFilePath)
        )

        return {
          afterRestoreRead,
          afterSave,
          afterStaleRead,
          restoredWorld,
          saveExistsAfterRestore,
          saveExistsAfterSave,
          saveExistsAfterStaleRead,
          staleReadWorld
        }
      })

      const result = await Effect.runPromise(
        provideTestRepository(program, saveFilePath)
      )

      expect(Option.isNone(result.afterSave)).toBe(true)
      expect(result.saveExistsAfterSave).toBe(true)
      expect(HashMap.size(result.staleReadWorld)).toBe(0)
      expect(Option.isNone(result.afterStaleRead)).toBe(true)
      expect(result.saveExistsAfterStaleRead).toBe(true)
      expect(HashMap.has(result.restoredWorld, "player")).toBe(true)
      expect(Option.isSome(result.afterRestoreRead)).toBe(true)
      expect(result.saveExistsAfterRestore).toBe(false)
    })
  })

  it("does not create a save for an inactive empty store", async () => {
    await withTempSavePath(async (saveFilePath) => {
      const program = Effect.gen(function*() {
        const repository = yield* GameRepository

        yield* repository.saveGame
        return yield* Effect.promise(() => exists(saveFilePath))
      })

      const saveExists = await Effect.runPromise(
        provideTestRepository(program, saveFilePath)
      )

      expect(saveExists).toBe(false)
    })
  })

  it("autosaves the current game after player actions", async () => {
    await withTempSavePath(async (saveFilePath) => {
      const program = Effect.gen(function*() {
        const repository = yield* GameRepository

        yield* repository.doPlayerAction(EAction.noop())
        return yield* Effect.promise(() => exists(saveFilePath))
      })

      const saveExists = await Effect.runPromise(
        provideTestRepository(program, saveFilePath)
      )

      expect(saveExists).toBe(true)
    })
  })

  it("quitGame deletes any save, clears state, and rejects stale mutation refresh", async () => {
    await withTempSavePath(async (saveFilePath) => {
      const program = Effect.gen(function*() {
        const repository = yield* GameRepository
        const store = yield* GameStateStore

        yield* store.get
        yield* repository.saveGame
        yield* repository.quitGame
        yield* repository.doPlayerAction(EAction.noop())
        const staleReadWorld = yield* repository.getWorld
        const afterQuit = yield* store.peek
        const saveExistsAfterQuit = yield* Effect.promise(() =>
          exists(saveFilePath)
        )

        return { afterQuit, saveExistsAfterQuit, staleReadWorld }
      })

      const result = await Effect.runPromise(
        provideTestRepository(program, saveFilePath)
      )

      expect(Option.isNone(result.afterQuit)).toBe(true)
      expect(HashMap.size(result.staleReadWorld)).toBe(0)
      expect(result.saveExistsAfterQuit).toBe(false)
    })
  })

  it("deletes saves immediately when the current state has no player", async () => {
    await withTempSavePath(async (saveFilePath) => {
      const program = Effect.gen(function*() {
        const persistence = yield* GamePersistence
        const repository = yield* GameRepository
        const store = yield* GameStateStore

        yield* store.set(stateWithoutPlayer())
        yield* persistence.save(stateWithPlayer())
        yield* repository.doPlayerAction(EAction.noop())
        return yield* Effect.promise(() => exists(saveFilePath))
      })

      const saveExists = await Effect.runPromise(
        provideTestRepository(program, saveFilePath)
      )

      expect(saveExists).toBe(false)
    })
  })
})
