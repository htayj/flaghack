import {
  AnyTerrain,
  type CampProp as CampPropSchema,
  type CampPropKind as CampPropKindSchema,
  conforms,
  type DirectionalVariant as DirectionalVariantSchema,
  type Door as DoorSchema,
  type Effigy as EffigySchema,
  type Floor as FloorSchema,
  type Mud as MudSchema,
  type Sign as SignSchema,
  type StairsDown as StairsDownSchema,
  type StairsUp as StairsUpSchema,
  type Temple as TempleSchema,
  type Tent as TentSchema,
  type TentPost as TentPostSchema,
  type TentWall as TentWallSchema,
  type Tunnel as TunnelSchema,
  type Wall as WallSchema
} from "@flaghack/domain/schemas"
import { Effect } from "effect"
import { KeyGenerator } from "./keyGenerator.js"

// type TerrainBase = TEntityPositioned & { kind: "terrain" }
export type Wall = typeof WallSchema.Type
export type Door = typeof DoorSchema.Type
export type CampProp = typeof CampPropSchema.Type
export type CampPropKind = typeof CampPropKindSchema.Type
export type StairsDown = typeof StairsDownSchema.Type
export type StairsUp = typeof StairsUpSchema.Type
export type TentWall = typeof TentWallSchema.Type
export type TentPost = typeof TentPostSchema.Type
export type Floor = typeof FloorSchema.Type
export type Mud = typeof MudSchema.Type
export type Tunnel = typeof TunnelSchema.Type
export type Tent = typeof TentSchema.Type
export type Sign = typeof SignSchema.Type
export type Effigy = typeof EffigySchema.Type
export type Temple = typeof TempleSchema.Type
export type Terrain = typeof AnyTerrain.Type
export type DirectionalVariant = typeof DirectionalVariantSchema.Type

export const isTerrain = conforms(AnyTerrain)
export const isCampPropPassable = (kind: CampPropKind): boolean => {
  switch (kind) {
    case "arrival-gate":
    case "stage":
    case "directory":
    case "lantern":
      return true
    case "artwork":
    case "flagpole":
    case "workbench":
    case "bike-rack":
    case "water-station":
    case "speaker":
    case "table":
      return false
  }
}
export const makeWall = (
  key: string,
  x: number,
  y: number,
  z: number,
  variant?: DirectionalVariant
): Wall => ({
  at: { x, y, z },
  in: "world",
  _tag: "wall",
  variant: variant ?? "none",
  key
})
export const makeDoor = (
  key: string,
  x: number,
  y: number,
  z: number,
  open: boolean,
  variant?: DirectionalVariant
): Door => ({
  at: { x, y, z },
  in: "world",
  _tag: "door",
  open,
  variant: variant ?? "none",
  key
})
export const makeTentWall = (
  key: string,
  x: number,
  y: number,
  z: number,
  variant?: DirectionalVariant
): TentWall => ({
  at: { x, y, z },
  in: "world",
  _tag: "tent-wall",
  variant: variant ?? "none",
  key
})
export const makeTentPost = (
  key: string,
  x: number,
  y: number,
  z: number
): TentPost => ({
  at: { x, y, z },
  in: "world",
  _tag: "tent-post",
  key
})
export const makeFloor = (
  key: string,
  x: number,
  y: number,
  z: number
): Floor => ({
  at: { x, y, z },
  in: "world",
  _tag: "floor",
  key
})
export const makeMud = (
  key: string,
  x: number,
  y: number,
  z: number
): Mud => ({
  at: { x, y, z },
  in: "world",
  _tag: "mud",
  key
})
export const makeTunnel = (
  key: string,
  x: number,
  y: number,
  z: number
): Tunnel => ({
  at: { x, y, z },
  in: "world",
  _tag: "tunnel",
  key
})
export const makeTent = (
  key: string,
  x: number,
  y: number,
  z: number
): Tent => ({
  at: { x, y, z },
  in: "world",
  _tag: "tent",
  key
})
export const makeSign = (
  key: string,
  x: number,
  y: number,
  z: number,
  name: string
): Sign => ({
  at: { x, y, z },
  in: "world",
  _tag: "sign",
  name,
  key
})
export const makeEffigy = (
  key: string,
  x: number,
  y: number,
  z: number
): Effigy => ({
  at: { x, y, z },
  in: "world",
  _tag: "effigy",
  key
})
export const makeTemple = (
  key: string,
  x: number,
  y: number,
  z: number
): Temple => ({
  at: { x, y, z },
  in: "world",
  _tag: "temple",
  key
})
export const makeStairsDown = (
  key: string,
  x: number,
  y: number,
  z: number
): StairsDown => ({
  at: { x, y, z },
  in: "world",
  _tag: "stairs-down",
  key
})
export const makeStairsUp = (
  key: string,
  x: number,
  y: number,
  z: number
): StairsUp => ({
  at: { x, y, z },
  in: "world",
  _tag: "stairs-up",
  key
})
export const makeCampProp = (
  key: string,
  x: number,
  y: number,
  z: number,
  kind: CampPropKind
): CampProp => ({
  at: { x, y, z },
  in: "world",
  _tag: "camp-prop",
  kind,
  key
})
export const wall = (
  x: number,
  y: number,
  z: number,
  variant?: DirectionalVariant
): Effect.Effect<Wall, never, KeyGenerator> =>
  Effect.gen(function*() {
    const keyGenerator = yield* KeyGenerator
    const key = yield* keyGenerator.nextKey

    return makeWall(key, x, y, z, variant)
  })
export const door = (
  x: number,
  y: number,
  z: number,
  open = false,
  variant?: DirectionalVariant
): Effect.Effect<Door, never, KeyGenerator> =>
  Effect.gen(function*() {
    const keyGenerator = yield* KeyGenerator
    const key = yield* keyGenerator.nextKey

    return makeDoor(key, x, y, z, open, variant)
  })
export const tentWall = (
  x: number,
  y: number,
  z: number,
  variant?: DirectionalVariant
): Effect.Effect<TentWall, never, KeyGenerator> =>
  Effect.gen(function*() {
    const keyGenerator = yield* KeyGenerator
    const key = yield* keyGenerator.nextKey

    return makeTentWall(key, x, y, z, variant)
  })
export const tentPost = (
  x: number,
  y: number,
  z: number
): Effect.Effect<TentPost, never, KeyGenerator> =>
  Effect.gen(function*() {
    const keyGenerator = yield* KeyGenerator
    const key = yield* keyGenerator.nextKey

    return makeTentPost(key, x, y, z)
  })
export const floor = (
  x: number,
  y: number,
  z: number
): Effect.Effect<Floor, never, KeyGenerator> =>
  Effect.gen(function*() {
    const keyGenerator = yield* KeyGenerator
    const key = yield* keyGenerator.nextKey

    return makeFloor(key, x, y, z)
  })
export const mud = (
  x: number,
  y: number,
  z: number
): Effect.Effect<Mud, never, KeyGenerator> =>
  Effect.gen(function*() {
    const keyGenerator = yield* KeyGenerator
    const key = yield* keyGenerator.nextKey

    return makeMud(key, x, y, z)
  })
export const tunnel = (
  x: number,
  y: number,
  z: number
): Effect.Effect<Tunnel, never, KeyGenerator> =>
  Effect.gen(function*() {
    const keyGenerator = yield* KeyGenerator
    const key = yield* keyGenerator.nextKey

    return makeTunnel(key, x, y, z)
  })
export const tent = (
  x: number,
  y: number,
  z: number
): Effect.Effect<Tent, never, KeyGenerator> =>
  Effect.gen(function*() {
    const keyGenerator = yield* KeyGenerator
    const key = yield* keyGenerator.nextKey

    return makeTent(key, x, y, z)
  })
export const sign = (
  x: number,
  y: number,
  z: number,
  name: string
): Effect.Effect<Sign, never, KeyGenerator> =>
  Effect.gen(function*() {
    const keyGenerator = yield* KeyGenerator
    const key = yield* keyGenerator.nextKey

    return makeSign(key, x, y, z, name)
  })
export const effigy = (
  x: number,
  y: number,
  z: number
): Effect.Effect<Effigy, never, KeyGenerator> =>
  Effect.gen(function*() {
    const keyGenerator = yield* KeyGenerator
    const key = yield* keyGenerator.nextKey

    return makeEffigy(key, x, y, z)
  })
export const temple = (
  x: number,
  y: number,
  z: number
): Effect.Effect<Temple, never, KeyGenerator> =>
  Effect.gen(function*() {
    const keyGenerator = yield* KeyGenerator
    const key = yield* keyGenerator.nextKey

    return makeTemple(key, x, y, z)
  })
export const stairsDown = (
  x: number,
  y: number,
  z: number
): Effect.Effect<StairsDown, never, KeyGenerator> =>
  Effect.gen(function*() {
    const keyGenerator = yield* KeyGenerator
    const key = yield* keyGenerator.nextKey

    return makeStairsDown(key, x, y, z)
  })
export const stairsUp = (
  x: number,
  y: number,
  z: number
): Effect.Effect<StairsUp, never, KeyGenerator> =>
  Effect.gen(function*() {
    const keyGenerator = yield* KeyGenerator
    const key = yield* keyGenerator.nextKey

    return makeStairsUp(key, x, y, z)
  })
export const campProp = (
  x: number,
  y: number,
  z: number,
  kind: CampPropKind
): Effect.Effect<CampProp, never, KeyGenerator> =>
  Effect.gen(function*() {
    const keyGenerator = yield* KeyGenerator
    const key = yield* keyGenerator.nextKey

    return makeCampProp(key, x, y, z, kind)
  })
export const range = (start: number, end: number) =>
  [...Array(Math.abs(end - start)).keys()].map((i) => i + start)

export const testWalls = [
  // top/bottom bounds
  ...range(2, 18).map((i) => makeWall(`test-wall-left-${i}`, 1, i, 0)),
  ...range(2, 18).map((i) => makeWall(`test-wall-right-${i}`, 78, i, 0)),

  // left/right bounds
  ...range(1, 79).map((i) => makeWall(`test-wall-top-${i}`, i, 1, 0)),
  ...range(1, 79).map((i) => makeWall(`test-wall-bottom-${i}`, i, 18, 0)),

  // maze
  ...range(1, 5).flatMap((x) => [
    ...range(2, 15).map((y) =>
      makeWall(`test-wall-maze-${x}-a-${y}`, x * 8 + 1, y, 0)
    ),
    ...range(5, 18).map((y) =>
      makeWall(`test-wall-maze-${x}-b-${y}`, x * 8 + 5, y, 0)
    )
  ])
]
