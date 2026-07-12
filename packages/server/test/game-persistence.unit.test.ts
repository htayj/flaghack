import { describe, expect, it } from "@effect/vitest"
import { GameState } from "@flaghack/domain/schemas"
import { balancedAttributes } from "@flaghack/domain/stats"
import { Effect, HashMap, Option } from "effect"
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { player } from "../src/creatures.js"
import { GamePersistence } from "../src/GamePersistence.js"
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

const withTempSavePath = async <A>(
  test: (saveFilePath: string) => Promise<A>
): Promise<A> => {
  const dir = await mkdtemp(join(tmpdir(), "flag-hack-save-test-"))
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

describe("GamePersistence", () => {
  it("atomically saves and restores a game state while consuming the save", async () => {
    await withTempSavePath(async (saveFilePath) => {
      const program = Effect.gen(function*() {
        const persistence = yield* GamePersistence
        const state = stateWithPlayer()

        yield* persistence.save(state)
        const savedJson = yield* Effect.promise(() =>
          readFile(saveFilePath, "utf8")
        )
        const restored = yield* persistence.restoreAndConsume

        return { restored, savedJson }
      })

      const { restored, savedJson } = await Effect.runPromise(
        program.pipe(Effect.provide(GamePersistence.Default(saveFilePath)))
      )

      expect(JSON.parse(savedJson)).toMatchObject({
        setup: { phase: "complete" }
      })
      expect(Option.isSome(restored)).toBe(true)
      if (Option.isSome(restored)) {
        expect(HashMap.has(restored.value.world, "player")).toBe(true)
      }
      expect(await exists(saveFilePath)).toBe(false)
    })
  })

  it("restores legacy saves whose creature entities predate required attributes", async () => {
    await withTempSavePath(async (saveFilePath) => {
      await writeFile(
        saveFilePath,
        `${
          JSON.stringify({
            setup: { phase: "complete" },
            world: [
              [
                "player",
                {
                  _tag: "player",
                  key: "player",
                  at: { x: 0, y: 0, z: 0 },
                  in: "world",
                  name: "you"
                }
              ],
              [
                "floor-0",
                {
                  _tag: "floor",
                  key: "floor-0",
                  at: { x: 0, y: 0, z: 0 },
                  in: "world"
                }
              ]
            ]
          })
        }\n`,
        "utf8"
      )

      const program = Effect.gen(function*() {
        const persistence = yield* GamePersistence
        return yield* persistence.restoreAndConsume
      })

      const restored = await Effect.runPromise(
        program.pipe(Effect.provide(GamePersistence.Default(saveFilePath)))
      )

      expect(Option.isSome(restored)).toBe(true)
      if (Option.isSome(restored)) {
        const restoredPlayer = restored.value.world.pipe(
          HashMap.get("player")
        )
        expect(Option.isSome(restoredPlayer)).toBe(true)
        if (
          Option.isSome(restoredPlayer)
          && restoredPlayer.value._tag === "player"
        ) {
          expect(restoredPlayer.value.attributes).toEqual(
            balancedAttributes
          )
        }
      }
      expect(await exists(saveFilePath)).toBe(false)
    })
  })

  it("deletes invalid save files instead of restoring them", async () => {
    await withTempSavePath(async (saveFilePath) => {
      await writeFile(saveFilePath, "not-json", "utf8")

      const program = Effect.gen(function*() {
        const persistence = yield* GamePersistence
        return yield* persistence.restoreAndConsume
      })

      const restored = await Effect.runPromise(
        program.pipe(Effect.provide(GamePersistence.Default(saveFilePath)))
      )

      expect(Option.isNone(restored)).toBe(true)
      expect(await exists(saveFilePath)).toBe(false)
    })
  })

  it("treats deleteSave as idempotent", async () => {
    await withTempSavePath(async (saveFilePath) => {
      const program = Effect.gen(function*() {
        const persistence = yield* GamePersistence
        yield* persistence.deleteSave
        yield* persistence.deleteSave
      })

      await Effect.runPromise(
        program.pipe(Effect.provide(GamePersistence.Default(saveFilePath)))
      )
      expect(await exists(saveFilePath)).toBe(false)
    })
  })
})
