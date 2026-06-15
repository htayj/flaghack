import { Effect } from "effect"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { simpleDraw } from "./testDrawUtils.js"
import {
  BSPGenLevel,
  type LevelGenerationError,
  type World
} from "./world.js"

const bspDemoSpecs = [
  [77777, 2],
  [77777, 3],
  [77777, 4],
  [69, 2],
  [69, 3],
  [69, 4]
] as const

type DemoLog = (message: string) => void

const renderLevels = (levels: ReadonlyArray<World>): string =>
  levels.map((level, i) => `\ni: ${i}\n${simpleDraw(level)}`).join("\n")

export const makeBspDemoLevels = (): Effect.Effect<
  Array<World>,
  LevelGenerationError
> =>
  Effect.forEach(
    bspDemoSpecs,
    ([seed, dlvl]) => BSPGenLevel(seed, dlvl),
    { concurrency: 1 }
  )

export const renderBspDemo = (
  levels?: ReadonlyArray<World>
): Effect.Effect<string, LevelGenerationError> =>
  levels === undefined
    ? makeBspDemoLevels().pipe(Effect.map(renderLevels))
    : Effect.succeed(renderLevels(levels))

export const runBspDemo = (
  log: DemoLog
): Effect.Effect<void, LevelGenerationError> =>
  renderBspDemo().pipe(
    Effect.tap((message) => Effect.sync(() => log(message))),
    Effect.asVoid
  )

const isDirectEntry = process.argv[1] !== undefined
  && fileURLToPath(import.meta.url) === resolve(process.argv[1])

if (isDirectEntry) {
  Effect.runSync(runBspDemo(console.log))
}
