import type { Creature } from "./creatures.js"
import { TKey } from "./entity.js"
import type { TPos } from "./position.js"
import { AnyItem, Flag, Water } from "./schemas/schemas.js"
import { genKey } from "./util.js"
import { Entity } from "./world.js"

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

export const pickup =
  <C extends Entity>(by: C) => <I extends Entity>(item: I): I => ({
    ...item,
    in: by.key,
    at: { x: 0, y: 0 }
  })
export const drop = (item: Item, by: Creature): Item => ({
  ...item,
  at: by.at,
  in: by.in
})
