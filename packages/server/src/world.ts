import { sync } from "effect/Effect"
import { Map } from "immutable"
import { defined } from "scala-ts/UndefOr.js"
import { Creature, Hippie, hippie, Player, player } from "./creatures.js"
import { EntityPositioned, movePosition } from "./entity.js"
import { groundFlag, Item } from "./items.js"
import { collideP, Pos, shift } from "./position.js"
import { isTerrain, Terrain, testWalls } from "./terrain.js"

export type Entity = Terrain | Creature | Item
export type World = Map<string, Entity>

export const initWorld: Array<Entity> = [
  player(3, 3),
  ...testWalls,
  groundFlag({ x: 4, y: 4 }),
  hippie(50, 3)
]

export const isCreature = (e: Entity): e is Creature =>
  e.kind === "creature"
export const isPlayer = (e: Entity): e is Player => e.type === "player"
export const isHippie = (e: Entity): e is Hippie => e.type === "hippie"
export const creaturesFrom = <T extends World>(w: T) =>
  sync(() => w.filter(isCreature))
export const notPlayerFrom = (w: World) =>
  sync(() => w.filterNot(isPlayer))

export const actPosition =
  (w: World) => <T extends EntityPositioned>(e: T, by: Pos) => {
    const newPosition = shift(e.pos, by)
    const eCollides = collideP(newPosition)
    const collidedEntity = w
      .filter((e) => isCreature(e) || isTerrain(e))
      .find((o) => eCollides(o.pos))
    if (!defined(collidedEntity)) return movePosition(e, by)
    if (isTerrain(collidedEntity)) return e
    return e
  }
