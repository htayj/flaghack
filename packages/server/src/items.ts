import type { Creature } from "./creatures.js"
import type {
  Keyed,
  WithContainer,
  WithLocation,
  WithPosition
} from "./entity.js"
import { genKey, isPositioned } from "./entity.js"
import type { Entity, Log, World } from "./gameloop.js"
import type { Pos } from "./position.js"

export type ItemBase = WithLocation<Keyed & { kind: "item" }>
// export type ItemBase = Keyed & {kind: 'item'} & {
// 	in: Pos | Key; // either position or owner
// };
export type GroundItem = WithPosition<ItemBase>
export type InventoryItem = WithContainer<ItemBase>
export type Flag = ItemBase & { type: "flag" }
export type Item = Flag
export const groundFlag = (pos: Pos): Flag => ({
  pos,
  type: "flag",
  kind: "item",
  key: genKey()
})

export const isItem = (e: Entity): e is Item => e.kind === "item"
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
export const isAt = (p: Pos) => <T extends Entity>(e: T) =>
  isPositioned(e) && e.pos === p

export const itemsAt = (_: Log) => (world: World) => (pos: Pos) =>
  world.filter(isItem).filter(isAt(pos))
