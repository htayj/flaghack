import { List, Map } from "immutable"
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

export const genKey = () => randomUUID()

export type Tile = {
  char: string
  color?: Color
  bright?: boolean
  bg?: boolean
}
export type Tiles = ReadonlyArray<ReadonlyArray<Tile>>

export type Color =
  | "black"
  | "red"
  | "green"
  | "yellow"
  | "blue"
  | "magenta"
  | "cyan"
  | "white"
export const colorNumMap = Map<Color, number>({
  black: 0,
  red: 1,
  green: 2,
  yellow: 3,
  blue: 4,
  magenta: 5,
  cyan: 6,
  white: 7
})
export const maybeDo = (doP?: boolean) => <T>(fn: (value: T) => T) =>
  doP ? fn : identity
export const fgColor = (num: number) => num + 30
export const bgColor = (num: number) => num + 10
export const brightenColor = (num: number) => num + 60
export const escColor = (num: number) => `\x1b[${num}m`
export const ecolor = (
  color: Color = "white",
  bright?: boolean,
  bg?: boolean
) =>
  escColor(
    maybeDo(bg)(bgColor)(
      maybeDo(bright)(brightenColor)(
        fgColor(colorNumMap.get(color) ?? 7)
      )
    )
  )

export const tileToText = ({ bg, bright, char, color }: Tile) =>
  `${ecolor(color, bright, bg)}${char}`
export const tilesToText = (tiles: Tiles) =>
  tiles.map((row) => row.map(tileToText).join("")).join("\n")
