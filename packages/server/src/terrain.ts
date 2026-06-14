import {
  AnyTerrain,
  conforms,
  type DirectionalVariant as DirectionalVariantSchema,
  type Floor as FloorSchema,
  type Tunnel as TunnelSchema,
  type Wall as WallSchema
} from "@flaghack/domain/schemas"
import { genKey } from "./util.js"

// type TerrainBase = TEntityPositioned & { kind: "terrain" }
export type Wall = typeof WallSchema.Type
export type Floor = typeof FloorSchema.Type
export type Tunnel = typeof TunnelSchema.Type
export type Terrain = typeof AnyTerrain.Type
export type DirectionalVariant = typeof DirectionalVariantSchema.Type

export const isTerrain = conforms(AnyTerrain)
export const wall = (
  x: number,
  y: number,
  z: number,
  variant?: DirectionalVariant
): Wall => ({
  at: { x, y, z },
  in: "world",
  _tag: "wall",
  variant: variant ?? "none",
  key: genKey()
})
export const floor = (x: number, y: number, z: number): Floor => ({
  at: { x, y, z },
  in: "world",
  _tag: "floor",
  key: genKey()
})
export const tunnel = (x: number, y: number, z: number): Tunnel => ({
  at: { x, y, z },
  in: "world",
  _tag: "tunnel",
  key: genKey()
})
export const range = (start: number, end: number) =>
  [...Array(Math.abs(end - start)).keys()].map((i) => i + start)

export const testWalls = [
  // top/bottom bounds
  ...range(2, 18).map((i) => wall(1, i, 0)),
  ...range(2, 18).map((i) => wall(78, i, 0)),

  // left/right bounds
  ...range(1, 79).map((i) => wall(i, 1, 0)),
  ...range(1, 79).map((i) => wall(i, 18, 0)),

  // maze
  ...range(1, 5).flatMap((x) => [
    ...range(2, 15).map((y) => wall(x * 8 + 1, y, 0)),
    ...range(5, 18).map((y) => wall(x * 8 + 5, y, 0))
  ])
]
