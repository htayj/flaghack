import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { simpleDraw } from "./testDrawUtils.js"
import { BSPGenLevel, type World } from "./world.js"

const bspDemoSpecs = [
  [77777, 2],
  [77777, 3],
  [77777, 4],
  [69, 2],
  [69, 3],
  [69, 4]
] as const

type DemoLog = (message: string) => void

export const makeBspDemoLevels = (): Array<World> =>
  bspDemoSpecs.map(([seed, dlvl]) => BSPGenLevel(seed, dlvl))

export const renderBspDemo = (
  levels: ReadonlyArray<World> = makeBspDemoLevels()
): string =>
  levels.map((level, i) => `\ni: ${i}\n${simpleDraw(level)}`).join("\n")

export const runBspDemo = (log: DemoLog = console.log): void => {
  log(renderBspDemo())
}

const isDirectEntry = process.argv[1] !== undefined
  && fileURLToPath(import.meta.url) === resolve(process.argv[1])

if (isDirectEntry) {
  runBspDemo()
}
