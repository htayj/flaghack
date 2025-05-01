import type { TPos } from "./position.js"
import { shift } from "./position.js"
import {
  Contain,
  EntityBase,
  Location,
  Position
} from "./schemas/schemas.js"
import { Key, Keyed } from "./schemas/schemas.js"
// import {hasProperty} from './util.js';

export type TKey = typeof Key.Type
export type TKeyed = typeof Keyed.Type
export type TPositioned = typeof Position.Type
export type TContained = typeof Contain.Type

export type TLocated = typeof Location.Type

export type TEntityBase = typeof EntityBase.Type

export const getKey = <T extends TKeyed>(a: T) => a.key
export const setPosition = <T extends TEntityBase>(
  e: T,
  to: TPos
) => ({
  ...e,
  at: to
})
export const movePosition = <T extends TEntityBase>(
  e: T,
  by: TPos
) => ({
  ...e,
  at: shift(e.at, by)
})
