import { EntityPositioned } from "./entity.js"
import { Entity } from "./gameloop.js"

export const genKey = () => (Math.random() * 2 ** 8).toString(16)
type TerrainBase = EntityPositioned & { kind: "terrain" }
export type Wall = TerrainBase & { type: "wall" }
export type Terrain = Wall
export const isTerrain = (e: Entity): e is Terrain => e.kind === "terrain"
export const wall = (x: number, y: number): Wall => ({
  pos: { x, y },
  type: "wall",
  kind: "terrain",
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
