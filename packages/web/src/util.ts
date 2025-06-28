import { List } from "immutable"
import { Map } from "immutable"
import { getOrElse } from "scala-ts/UndefOr.js"

export type Matrix<T> = List<List<T>>

export type UndefOr<T> = T | undefined
export const defined = <T>(a: UndefOr<T>) => a !== undefined

export const nullMatrix = (h: number, w: number): Matrix<null> => {
  const rows = Array<Array<null>>(h)
  const filled = rows.fill(Array<null>(w).fill(null))

  return List(filled.map(List))
}

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

export const genKey = () => (Math.random() * 2 ** 8).toString(16)

export type Tile = {
  char: string
  color?: Color
  bright?: boolean
  bg?: boolean
}
export type Tiles = Tile[][]

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
export const maybeDo = (doP?: boolean) => <T extends Function>(fn: T) =>
  !!doP ? fn : identity
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
        fgColor(getOrElse(colorNumMap.get(color), () => 7))
      )
    )
  )

export const tileToText = ({ color, char, bright, bg }: Tile) =>
  `${ecolor(color, bright, bg)}${char}`
export const tilesToText = (tiles: Tiles) =>
  tiles.map((row) => row.map(tileToText).join("")).join("\n")
