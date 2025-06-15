import { simpleDraw } from "./testDrawUtils.js"
import { BSPGenLevel } from "./world.js"
console.log("testing bsp")

const levels = [
  BSPGenLevel(77777, 2),
  BSPGenLevel(77777, 3),
  BSPGenLevel(77777, 4),
  BSPGenLevel(69, 2),
  BSPGenLevel(69, 3),
  BSPGenLevel(69, 4)
]
levels.map(simpleDraw).forEach((w, i) =>
  console.log("\ni: " + i + "\n" + w)
)
