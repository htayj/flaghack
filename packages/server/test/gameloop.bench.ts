import { EAction, GameState } from "@flaghack/domain/schemas"
import { Effect, HashMap } from "effect"
import { bench, describe } from "vitest"
import { doAction } from "../src/actions.js"
import { normalizeCampgroundState } from "../src/campgroundState.js"
import { player } from "../src/creatures.js"
import { actPlayerAction } from "../src/gameloop.js"
import { GameStateStore } from "../src/GameStateStore.js"
import {
  CampgroundGenLevel,
  type Entity,
  type World
} from "../src/world.js"

const generatedWorld = Effect.runSync(
  CampgroundGenLevel(777, 0).pipe(Effect.orDie)
)
const spawnFloor = Array.from(HashMap.values(generatedWorld)).find((
  entity
) => entity._tag === "floor")
if (spawnFloor === undefined) {
  throw new Error("benchmark fixture did not generate a floor")
}
const benchmarkPlayer: Entity = player(
  spawnFloor.at.x,
  spawnFloor.at.y,
  spawnFloor.at.z
)
const benchmarkWorld: World = HashMap.set(
  generatedWorld as World,
  "player",
  benchmarkPlayer
)
const benchmarkState = normalizeCampgroundState(
  GameState.make({ world: benchmarkWorld })
)

describe("server gameloop smoke benchmarks", () => {
  bench("generates deterministic campground level", () => {
    Effect.runSync(CampgroundGenLevel(777, 0).pipe(Effect.orDie))
  }, { iterations: 10 })

  bench("reduces a single move action", () => {
    Effect.runSync(
      doAction(benchmarkState, {
        action: EAction.move({ dir: "E" }),
        entity: benchmarkPlayer
      })
    )
  })

  bench("processes a full campground player turn", () => {
    Effect.runSync(
      actPlayerAction(EAction.move({ dir: "E" })).pipe(
        Effect.provide(
          GameStateStore.Default(Effect.succeed(benchmarkState))
        )
      )
    )
  })
})
