import { defined } from "scala-ts/UndefOr.js"
import { isCreature } from "./creatures.js"
import type { Entity, World } from "./gameloop.js"
import { log } from "./gameloop.js"
import type { Pos } from "./position.js"
import { collideP, shift } from "./position.js"
import { isTerrain } from "./terrain.js"
// import {hasProperty} from './util.js';

export type Key = string
export type Keyed = { key: Key }
export const getKey = <T extends Keyed>(a: T) => a.key
export type Positioned = { pos: Pos }
export type WithPosition<T> = T & Positioned
export const isPosition = (e: Pos | Key): e is Pos => typeof e === "object"
export const isPositioned = <T extends object>(
  e: T
): e is WithPosition<T> => Object.hasOwn(e, "pos")
export type Contained = { in: Key }
export type WithContainer<T> = T & Contained
export const isContained = <T extends object>(
  e: T
): e is WithContainer<T> => Object.hasOwn(e, "in")

export const isContainedIn = <T extends Entity, C extends Entity>(
  contained: T,
  container: C
) => isContained(contained) && container.key === contained.in

export type Located = Positioned | Contained
export type WithLocation<T> = WithPosition<T> | WithContainer<T>

export const genKey = () => (Math.random() * 2 ** 8).toString(16)

export type EntityBase = WithLocation<Keyed>
export type EntityPositioned = EntityBase & Positioned
export type EntityContained = EntityBase & Contained

export const movePosition = <T extends EntityPositioned>(
  e: T,
  by: Pos
) => ({
  ...e,
  pos: shift(e.pos, by)
})

export const actPosition =
  (w: World) => <T extends EntityPositioned>(e: T, by: Pos) => {
    log(`oldPosition: ${JSON.stringify(e.pos)}`)
    log(`by: ${JSON.stringify(by)}`)
    const newPosition = shift(e.pos, by)
    log(`newPosition: ${JSON.stringify(newPosition)}`)
    const eCollides = collideP(newPosition)
    const collidedEntity = w
      .filter((e) => isCreature(e) || isTerrain(e))
      .find((o) => eCollides(o.pos))
    if (!defined(collidedEntity)) return movePosition(e, by)
    if (isTerrain(collidedEntity)) return e
    return e
  }
