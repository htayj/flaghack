import { List, type Map } from "immutable"
import { randomUUID } from "node:crypto"

export type Matrix<T> = List<List<T>>

export const defined = <T>(a: T | undefined): a is T => a !== undefined

export const nullMatrix = (h: number, w: number): Matrix<null> =>
  List(
    Array.from({ length: h }, () =>
      List(Array.from({ length: w }, () => null)))
  )

export const filterIs = <T, R extends T>(
  u: T,
  f: (a: T) => a is R
): R | undefined => (f(u) ? u : undefined)

export const identity = <T>(a: T) => a
export const noop = <T>(_: T) => undefined

type CFilterPredicate<K, V, I> = <F extends V>(
  value: V,
  key: K,
  iter: I
) => value is F
type CMapPredicate<V, R> = (value: V, key: never, iter: never) => R

type MappableCollection<V, R> =
  | List<V>
  | ReadonlyArray<V>
  | Map<unknown, V>
  | { map: (pred: CMapPredicate<V, R>) => unknown }

type MappedCollection<Collection, R> = Collection extends List<unknown>
  ? List<R>
  : Collection extends ReadonlyArray<unknown> ? Array<R>
  : Collection extends Map<infer K, unknown> ? Map<K, R>
  : Collection extends
    { map: (pred: CMapPredicate<never, R>) => infer Mapped } ? Mapped
  : never

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

export const cmap =
  <V, R>(fn: CMapPredicate<V, R>) =>
  <Collection extends MappableCollection<V, R>>(
    collection: Collection
  ): MappedCollection<Collection, R> =>
    collection.map(fn as never) as MappedCollection<Collection, R>

export const genKey = (): string => randomUUID()
