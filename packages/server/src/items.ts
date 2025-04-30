import type { Creature } from "./creatures.js"
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
  ItemPositioned
} from "./schemas.js"
import { genKey } from "./util.js"

export type ItemBase = typeof ItemBase.Type
// export type ItemBase = Keyed & {kind: 'item'} & {
// 	in: Pos | Key; // either position or owner
// };
export type GroundItem = typeof ItemPositioned.Type
export type InventoryItem = typeof ItemContained.Type
export type Flag = typeof Flag.Type
export type Item = typeof Item.Type
export const groundFlag = (pos: TPos): Flag => ({
  loc: { at: pos },
  type: "flag",
  _tag: "flag",
  kind: "item",
  key: genKey()
})

export const pickup =
  (by: Creature) => (item: GroundItem): InventoryItem => ({
    ...item,
    loc: { in: by.key }
  })
// export const pickup = (item: GroundItem, by: Creature): InventoryItem => ({
// 	...item,
// 	in: by.key,
// });
export const drop = (item: InventoryItem, by: Creature): GroundItem => ({
  ...item,
  loc: { at: by.loc.at }
})
