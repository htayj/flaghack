import type { TPos } from "./position.js"
import { shift } from "./position.js"
import {
  Contained,
  EntityBase,
  EntityContained,
  EntityPositioned,
  Located,
  Positioned
} from "./schemas.js"
import { Key, Keyed } from "./schemas.js"
// import {hasProperty} from './util.js';

export type TKey = typeof Key.Type
export type TKeyed = typeof Keyed.Type
export type TPositioned = typeof Positioned.Type
export type TContained = typeof Contained.Type

export type TLocated = typeof Located.Type

export type TEntityPositioned = typeof EntityPositioned.Type
export type TEntityContained = typeof EntityContained.Type
export type TEntityBase = typeof EntityBase.Type

export type TWithContainer<T> = T & TContained
export type TWithPosition<T> = T & TPositioned
export type TWithLocation<T> = TWithPosition<T> | TWithContainer<T>

export const isPosition = (e: TPos | TKey): e is TPos =>
  typeof e === "object"
export const isContained = <T extends object>(
  e: T
): e is TWithContainer<T> => Object.hasOwn(e, "in")
export const isPositioned = <T extends object>(
  e: T
): e is TWithPosition<T> => Object.hasOwn(e, "pos")

export const getKey = <T extends TKeyed>(a: T) => a.key
export const movePosition = <T extends TEntityPositioned>(
  e: T,
  by: TPos
) => ({
  ...e,
  pos: shift(e.pos, by)
})
