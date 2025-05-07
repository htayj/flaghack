import {
  AnyCreature,
  AnyItem,
  conforms,
  Entity,
  Hippie,
  Player,
  World
} from "@flaghack/domain/schemas"
import { HashMap, Option } from "effect"
import { filter, findFirst } from "effect/HashMap"
import { Creature, hippie, player } from "./creatures.js"
import { movePosition } from "./entity.js"
import { groundFlag, waterbottle } from "./items.js"
import { log } from "./log.js"
import { collideP, shift, TPos } from "./position.js"
import { isTerrain, testWalls } from "./terrain.js"

export type Entity = typeof Entity.Type
type Player = typeof Player.Type
export type World = typeof World.Type

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
export const isPlayer = (e: Entity): e is Player => e._tag === "player"
export const isHippie = conforms(Hippie)
export const isItem = conforms(AnyItem)
export const creaturesFrom = <T extends World>(
  w: T
): HashMap.HashMap<string, Creature> => w.pipe(filter(isCreature))
export const notPlayerFrom = <T extends World>(w: T) =>
  w.pipe(filter((o) => !isPlayer(o)))
export const isAt = (p: TPos) => <T extends Entity>(e: T) =>
  e.in === "world" && e.at === p
export const itemsAt = (world: World) => (pos: TPos) =>
  world.pipe(filter(isItem), filter(isAt(pos)))

export const actPosition =
  (w: World) => <T extends Entity>(e: Option.Option<T>, by: TPos) => {
    return Option.match({
      onNone: () => e,
      onSome: (e: T) => {
        const newPosition = shift(e.at, by)
        const eCollides = collideP(newPosition)
        const collidedEntity = w.pipe(
          filter((e) => isCreature(e) || isTerrain(e)),
          findFirst((o) => eCollides(o.at))
        )

        log(`collided entity ${JSON.stringify(collidedEntity)}`)
        if (Option.isNone(collidedEntity)) {
          return Option.some(movePosition(e, by))
        }
        if (isTerrain(collidedEntity)) return Option.some(e)
        return Option.some(e)
      }
    })(e)
  }
