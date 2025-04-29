import type { Creature } from "./creatures.js"
import type {
  TKeyed,
  TWithContainer,
  TWithLocation,
  TWithPosition
} from "./entity.js"
import type { TPos } from "./position.js"
import { genKey } from "./util.js"

export type ItemBase = TWithLocation<TKeyed & { kind: "item" }>
// export type ItemBase = Keyed & {kind: 'item'} & {
// 	in: Pos | Key; // either position or owner
// };
export type GroundItem = TWithPosition<ItemBase>
export type InventoryItem = TWithContainer<ItemBase>
export type Flag = ItemBase & { type: "flag" }
export type Item = Flag
export const groundFlag = (pos: TPos): Flag => ({
  pos,
  type: "flag",
  kind: "item",
  key: genKey()
})

export const pickup =
  (by: Creature) => (item: GroundItem): InventoryItem => ({
    ...item,
    in: by.key
  })
// export const pickup = (item: GroundItem, by: Creature): InventoryItem => ({
// 	...item,
// 	in: by.key,
// });
export const drop = (item: InventoryItem, by: Creature): GroundItem => ({
  ...item,
  pos: by.pos
})
