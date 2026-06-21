import { EAction, GameState } from "@flaghack/domain/schemas"
import { Effect, HashMap } from "effect"
import { bench, describe } from "vitest"
import { doAction } from "../src/actions.js"
import { player } from "../src/creatures.js"
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
const benchmarkState = GameState.make({ world: benchmarkWorld })

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
})
