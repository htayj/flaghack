import { sync } from "effect/Effect"
import { Map } from "immutable"
import { defined } from "scala-ts/UndefOr.js"
import { hippie, player } from "./creatures.js"
import { movePosition } from "./entity.js"
import { groundFlag, waterbottle } from "./items.js"
import { log } from "./log.js"
import { collideP, shift, TPos } from "./position.js"
import {
  AnyCreature,
  AnyItem,
  conforms,
  Entity,
  Hippie,
  Player
} from "./schemas/schemas.js"
import { isTerrain, testWalls } from "./terrain.js"

export type Entity = typeof Entity.Type
export type World = Map<string, Entity>

export const initWorld: Array<Entity> = [
  player(3, 3),
  ...testWalls,
  groundFlag({ x: 4, y: 4 }),
  hippie(50, 3),
  waterbottle(0, 0, "player")
]

export const isContainedIn = <T extends Entity, C extends Entity>(
  contained: T,
  container: C
) => container.key === contained.in
export const isCreature = conforms(AnyCreature)
export const isPlayer = conforms(Player)
export const isHippie = conforms(Hippie)
export const isItem = conforms(AnyItem)
export const creaturesFrom = <T extends World>(w: T) =>
  sync(() => w.filter(isCreature))
export const notPlayerFrom = <T extends World>(w: T) =>
  sync(() => w.filterNot(isPlayer))
export const isAt = (p: TPos) => <T extends Entity>(e: T) =>
  e.in === "world" && e.at === p
export const itemsAt = (world: World) => (pos: TPos) =>
  world.filter(isItem).filter(isAt(pos))

export const actPosition =
  (w: World) => <T extends Entity>(e: T, by: TPos) => {
    log(`acting position of ${JSON.stringify(e)} by ${JSON.stringify(by)}`)
    const newPosition = shift(e.at, by)
    log(`new position ${JSON.stringify(newPosition)}`)
    const eCollides = collideP(newPosition)
    const collidedEntity = w
      .filter((e) => isCreature(e) || isTerrain(e))
      .find((o) => eCollides(o.at))

    log(`collided entity ${JSON.stringify(collidedEntity)}`)
    if (!defined(collidedEntity)) return movePosition(e, by)
    if (isTerrain(collidedEntity)) return e
    return e
  }
