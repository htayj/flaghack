import type { Pos } from "./position.js"
import { shift } from "./position.js"
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

export type Located = Positioned | Contained
export type WithLocation<T> = WithPosition<T> | WithContainer<T>

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
