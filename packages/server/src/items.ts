import type { Creature } from "./creatures.js"
import { TKey } from "./entity.js"
// import type {
//   TKeyed,
//   TWithContainer,
//   TWithLocation,
//   TWithPosition
// } from "./entity.js"
import type { TPos } from "./position.js"
import {
  Flag,
  Item,
  ItemBase,
  ItemContained,
  ItemPositioned,
  Water
} from "./schemas/schemas.js"
import { genKey } from "./util.js"

export type ItemBase = typeof ItemBase.Type
// export type ItemBase = Keyed & {kind: 'item'} & {
// 	in: Pos | Key; // either position or owner
// };
export type GroundItem = typeof ItemPositioned.Type
export type InventoryItem = typeof ItemContained.Type
export type Flag = typeof Flag.Type
export type Water = typeof Water.Type
export type Item = typeof Item.Type
export const groundFlag = (pos: TPos): Flag => ({
  at: pos,
  in: "world",
  type: "flag",
  _tag: "flag",
  kind: "item",
  key: genKey()
})
export const waterbottle = (
  x: number,
  y: number,
  container: TKey = "world"
): Water => ({
  at: { x, y },
  in: container,
  type: "drink",
  _tag: "water",
  kind: "item",
  key: genKey()
})

export const pickup =
  (by: Creature) => (item: GroundItem): InventoryItem => ({
    ...item,
    in: by.key,
    at: { x: 0, y: 0 }
  })
// export const pickup = (item: GroundItem, by: Creature): InventoryItem => ({
// 	...item,
// 	in: by.key,
// });
export const drop = (item: InventoryItem, by: Creature): GroundItem => ({
  ...item,
  at: by.at,
  in: by.in
})
