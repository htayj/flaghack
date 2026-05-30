import { List } from "immutable"
import { randomUUID } from "node:crypto"

export type Matrix<T> = List<List<T>>

export type UndefOr<T> = T | undefined
export const defined = <T>(a: UndefOr<T>) => a !== undefined

export const nullMatrix = (h: number, w: number): Matrix<null> =>
  List(
    Array.from({ length: h }, () =>
      List(Array.from({ length: w }, () => null)))
  )

export const filterIs = <T, R extends T>(
  u: T,
  f: (a: T) => a is R
): UndefOr<R> => (f(u) ? u : undefined)

export const identity = <T>(a: T) => a
export const noop = <T>(_: T) => undefined

type CFilterPredicate<K, V, I> = <F extends V>(
  value: V,
  key: K,
  iter: I
) => value is F
type CMapPredicate<K, V, I, R> = (value: V, key: K, iter: I) => R

export const cfilter = <
  K,
  V,
  I,
  P extends CFilterPredicate<K, V, I>,
  T extends { filter: (pred: P) => T }
>(
  fn: P
) =>
(collection: T) => collection.filter(fn)

export const cmap = <
  K,
  V,
  I,
  R,
  T extends { filter: (pred: CMapPredicate<K, V, I, R>) => T }
>(
  fn: CMapPredicate<K, V, I, R>
) =>
(collection: T) => collection.filter(fn)

export const genKey = (): string => randomUUID()
