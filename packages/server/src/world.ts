import { sync } from "effect/Effect"
import { Map } from "immutable"
import { defined } from "scala-ts/UndefOr.js"
import { Creature, Hippie, hippie, Player, player } from "./creatures.js"
import {
  isContained,
  isPositioned,
  movePosition,
  TEntityPositioned
} from "./entity.js"
import { groundFlag, Item } from "./items.js"
import { collideP, shift, TPos } from "./position.js"
import { Entity } from "./schemas.js"
import { isTerrain, testWalls } from "./terrain.js"

export type Entity = typeof Entity.Type
export type World = Map<string, Entity>

export const initWorld: Array<Entity> = [
  player(3, 3),
  ...testWalls,
  groundFlag({ x: 4, y: 4 }),
  hippie(50, 3)
]

export const isContainedIn = <T extends Entity, C extends Entity>(
  contained: T,
  container: C
) => isContained(contained) && container.key === contained.loc.in
export const isCreature = (e: Entity): e is Creature =>
  e.kind === "creature"
export const isPlayer = (e: Entity): e is Player =>
  isCreature(e) && e.type === "player"
export const isHippie = (e: Entity): e is Hippie =>
  isCreature(e) && e.type === "hippie"
export const isItem = (e: Entity): e is Item => e.kind === "item"
export const creaturesFrom = <T extends World>(w: T) =>
  sync(() => w.filter(isCreature))
export const notPlayerFrom = <T extends World>(w: T) =>
  sync(() => w.filterNot(isPlayer))
export const isAt = (p: TPos) => <T extends Entity>(e: T) =>
  isPositioned(e) && e.loc.at === p
export const itemsAt = (world: World) => (pos: TPos) =>
  world.filter(isItem).filter(isAt(pos))

export const actPosition =
  (w: World) => <T extends TEntityPositioned>(e: T, by: TPos) => {
    const newPosition = shift(e.loc.at, by)
    const eCollides = collideP(newPosition)
    const collidedEntity = w
      .filter((e) => isCreature(e) || isTerrain(e))
      .find((o) => eCollides(o.loc.at))
    if (!defined(collidedEntity)) return movePosition(e, by)
    if (isTerrain(collidedEntity)) return e
    return e
  }
