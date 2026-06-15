import type {
  AnyItem as AnyItemSchema,
  Flag as FlagSchema,
  Water as WaterSchema
} from "@flaghack/domain/schemas"
import { Data, Effect } from "effect"
import { match as omatch, none, type Option, some } from "effect/Option"
import type { TKey } from "./entity.js"
import { KeyGenerator } from "./keyGenerator.js"
import type { TPos } from "./position.js"
import type { Entity } from "./world.js"

class ErrTriedToPickupNothing
  extends Data.TaggedError("TriedToPickupNothing")
{}
class ErrNothingTriedToPickup
  extends Data.TaggedError("NotingTriedToPickup")
{}
export type Flag = typeof FlagSchema.Type
export type Water = typeof WaterSchema.Type
export type Item = typeof AnyItemSchema.Type
export const makeGroundFlag = (key: string, pos: TPos): Flag => ({
  at: pos,
  in: "world",
  _tag: "flag",
  key
})
export const makeWaterBottle = (
  key: string,
  x: number,
  y: number,
  z: number,
  container: TKey = "world"
): Water => ({
  at: { x, y, z },
  in: container,
  _tag: "water",
  key
})
export const groundFlag = (
  pos: TPos
): Effect.Effect<Flag, never, KeyGenerator> =>
  Effect.gen(function*() {
    const keyGenerator = yield* KeyGenerator
    const key = yield* keyGenerator.nextKey

    return makeGroundFlag(key, pos)
  })
export const waterbottle = (
  x: number,
  y: number,
  z: number,
  container: TKey = "world"
): Effect.Effect<Water, never, KeyGenerator> =>
  Effect.gen(function*() {
    const keyGenerator = yield* KeyGenerator
    const key = yield* keyGenerator.nextKey

    return makeWaterBottle(key, x, y, z, container)
  })

export const ePickup =
  <C extends Entity>(by: Option<C>) =>
  <I extends Entity>(
    item: Option<I>
  ): Effect.Effect<I, ErrTriedToPickupNothing | ErrNothingTriedToPickup> =>
    omatch({
      onSome: (by: C) =>
        omatch({
          onSome: (item: I) =>
            Effect.succeed({
              ...item,
              in: by.key,
              at: { x: 0, y: 0 }
            }),
          onNone: () => Effect.fail(new ErrTriedToPickupNothing())
        })(item),
      onNone: () => Effect.fail(new ErrNothingTriedToPickup())
    })(by)
export const pickup =
  <C extends Entity>(by: Option<C>) =>
  <I extends Entity>(
    item: Option<I>
  ): Option<I> =>
    omatch({
      onSome: (by: C) =>
        omatch({
          onSome: (item: I) =>
            some({
              ...item,
              in: by.key,
              at: { x: 0, y: 0, z: 0 }
            }),
          onNone: none
        })(item),
      onNone: none
    })(by)
export const drop =
  <C extends Entity>(by: Option<C>) =>
  <I extends Entity>(
    item: Option<I>
  ): Option<I> =>
    omatch({
      onSome: (by: C) =>
        omatch({
          onSome: (item: I) =>
            some({
              ...item,
              in: by.in,
              at: by.at
            }),
          onNone: none
        })(item),
      onNone: none
    })(by)
