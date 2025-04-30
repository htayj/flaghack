import type { TPos } from "./position.js"
import { shift } from "./position.js"
import {
  Contain,
  EntityBase,
  EntityContained,
  EntityPositioned,
  Location,
  Position
} from "./schemas.js"
import { Key, Keyed } from "./schemas.js"
// import {hasProperty} from './util.js';

export type TKey = typeof Key.Type
export type TKeyed = typeof Keyed.Type
export type TPositioned = typeof Position.Type
export type TContained = typeof Contain.Type

export type TLocated = typeof Location.Type

export type TEntityPositioned = typeof EntityPositioned.Type
export type TEntityContained = typeof EntityContained.Type
export type TEntityBase = typeof EntityBase.Type

export type TWithContainer<T> = T & { loc: TContained }
export type TWithPosition<T> = T & { loc: TPositioned }
export type TWithLocation<T> = TWithPosition<T> | TWithContainer<T>

// export const isPosition = (e: TPos | TKey): e is TPos =>
//   typeof e === "object"
export const isLocated = <T extends object>(
  e: T
): e is TWithLocation<T> => Object.hasOwn(e, "loc")

export const isContained = <T extends object>(
  e: T
): e is TWithContainer<T> => isLocated(e) && Object.hasOwn(e.loc, "loc.in") // broken

export const isPositioned = <T extends object>(
  e: T
): e is TWithPosition<T> => isLocated(e) && Object.hasOwn(e.loc, "loc.at") // broken

export const getKey = <T extends TKeyed>(a: T) => a.key
export const movePosition = <T extends TEntityPositioned>(
  e: T,
  by: TPos
) => ({
  ...e,
  loc: { at: shift(e.loc.at, by) }
})
