import { defined } from "scala-ts/UndefOr.js"
import { log } from "./gameloop.js"
import type { Pos } from "./position.js"
import { collideP, shift } from "./position.js"
import { isTerrain } from "./terrain.js"
import type { Entity, World } from "./world.js"
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
