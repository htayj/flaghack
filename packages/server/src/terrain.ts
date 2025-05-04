import { AnyTerrain, conforms, Wall } from "@flaghack/domain/schemas"
import { genKey } from "./util.js"

// type TerrainBase = TEntityPositioned & { kind: "terrain" }
export type Wall = typeof Wall.Type
export type Terrain = typeof AnyTerrain.Type

export const isTerrain = conforms(AnyTerrain)
export const wall = (x: number, y: number): Wall => ({
  at: { x, y },
  in: "world",
  _tag: "wall",
  key: genKey()
})
const range = (start: number, end: number) =>
  [...Array(Math.abs(end - start)).keys()].map((i) => i + start)

export const testWalls = [
  // top/bottom bounds
  ...range(2, 18).map((i) => wall(1, i)),
  ...range(2, 18).map((i) => wall(78, i)),

  // left/right bounds
  ...range(1, 79).map((i) => wall(i, 1)),
  ...range(1, 79).map((i) => wall(i, 18)),

  // maze
  ...range(1, 5).flatMap((x) => [
    ...range(2, 15).map((y) => wall(x * 8 + 1, y)),
    ...range(5, 18).map((y) => wall(x * 8 + 5, y))
  ])
]
