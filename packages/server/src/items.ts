import { AnyItem, Flag, Water } from "@flaghack/domain/schemas"
import { Data, Effect } from "effect"
import { match as omatch, Option } from "effect/Option"
import { none } from "effect/Option"
import { some } from "effect/Option"
import type { Creature } from "./creatures.js"
import { TKey } from "./entity.js"
import type { TPos } from "./position.js"
import { genKey } from "./util.js"
import { Entity } from "./world.js"

class ErrTriedToPickupNothing
  extends Data.TaggedError("TriedToPickupNothing")
{}
class ErrNothingTriedToPickup
  extends Data.TaggedError("NotingTriedToPickup")
{}
export type Flag = typeof Flag.Type
export type Water = typeof Water.Type
export type Item = typeof AnyItem.Type
export const groundFlag = (pos: TPos): Flag => ({
  at: pos,
  in: "world",
  _tag: "flag",
  key: genKey()
})
export const waterbottle = (
  x: number,
  y: number,
  container: TKey = "world"
): Water => ({
  at: { x, y },
  in: container,
  _tag: "water",
  key: genKey()
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
              at: { x: 0, y: 0 }
            }),
          onNone: none
        })(item),
      onNone: none
    })(by)

export const drop = (item: Item, by: Creature): Item => ({
  ...item,
  at: by.at,
  in: by.in
})
