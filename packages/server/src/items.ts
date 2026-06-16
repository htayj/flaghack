import type {
  AnyItem as AnyItemSchema,
  Beer as BeerSchema,
  Cheese as CheeseSchema,
  Cooler as CoolerSchema,
  Flag as FlagSchema,
  Hotdog as HotdogSchema,
  Salsa as SalsaSchema,
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
export type Beer = typeof BeerSchema.Type
export type Hotdog = typeof HotdogSchema.Type
export type Cheese = typeof CheeseSchema.Type
export type Salsa = typeof SalsaSchema.Type
export type Cooler = typeof CoolerSchema.Type
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
export const makeBeer = (
  key: string,
  x: number,
  y: number,
  z: number,
  container: TKey = "world"
): Beer => ({
  at: { x, y, z },
  in: container,
  _tag: "beer",
  key
})
export const makeHotdog = (
  key: string,
  x: number,
  y: number,
  z: number,
  container: TKey = "world"
): Hotdog => ({
  at: { x, y, z },
  in: container,
  _tag: "hotdog",
  key
})
export const makeCheese = (
  key: string,
  x: number,
  y: number,
  z: number,
  container: TKey = "world"
): Cheese => ({
  at: { x, y, z },
  in: container,
  _tag: "cheese",
  key
})
export const makeSalsa = (
  key: string,
  x: number,
  y: number,
  z: number,
  container: TKey = "world"
): Salsa => ({
  at: { x, y, z },
  in: container,
  _tag: "salsa",
  key
})
export const makeCooler = (
  key: string,
  x: number,
  y: number,
  z: number,
  container: TKey = "world"
): Cooler => ({
  at: { x, y, z },
  in: container,
  _tag: "cooler",
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
export const beer = (
  x: number,
  y: number,
  z: number,
  container: TKey = "world"
): Effect.Effect<Beer, never, KeyGenerator> =>
  Effect.gen(function*() {
    const keyGenerator = yield* KeyGenerator
    const key = yield* keyGenerator.nextKey

    return makeBeer(key, x, y, z, container)
  })
export const hotdog = (
  x: number,
  y: number,
  z: number,
  container: TKey = "world"
): Effect.Effect<Hotdog, never, KeyGenerator> =>
  Effect.gen(function*() {
    const keyGenerator = yield* KeyGenerator
    const key = yield* keyGenerator.nextKey

    return makeHotdog(key, x, y, z, container)
  })
export const cheese = (
  x: number,
  y: number,
  z: number,
  container: TKey = "world"
): Effect.Effect<Cheese, never, KeyGenerator> =>
  Effect.gen(function*() {
    const keyGenerator = yield* KeyGenerator
    const key = yield* keyGenerator.nextKey

    return makeCheese(key, x, y, z, container)
  })
export const salsa = (
  x: number,
  y: number,
  z: number,
  container: TKey = "world"
): Effect.Effect<Salsa, never, KeyGenerator> =>
  Effect.gen(function*() {
    const keyGenerator = yield* KeyGenerator
    const key = yield* keyGenerator.nextKey

    return makeSalsa(key, x, y, z, container)
  })
export const cooler = (
  x: number,
  y: number,
  z: number,
  container: TKey = "world"
): Effect.Effect<Cooler, never, KeyGenerator> =>
  Effect.gen(function*() {
    const keyGenerator = yield* KeyGenerator
    const key = yield* keyGenerator.nextKey

    return makeCooler(key, x, y, z, container)
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
