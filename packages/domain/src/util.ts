import { pipe, Schema as S } from "effect"
// import { dual } from "effect/Function"

// using extend and union - cant use .make?

/** pipeable version of combine schemas via extends (note this has limitations and will prevent you from calling make)
 */
export const bothof = S.extend
/** combine schemas via spreading (prefer this over normal and if possible)
 */
export const combine = <
  A extends S.Struct.Fields,
  B extends S.Struct.Fields
>(
  a: S.Struct<A>,
  b: S.Struct<B>
): S.Struct<A & B> => (S.Struct({ ...a.fields, ...b.fields }))

/** form a union of types into a category
 */
export const oneof = S.Union

/** pipeable version of combine schemas via spreading (prefer this over normal and if possible)
 */
export const cand =
  <A extends S.Struct.Fields>(a: S.Struct<A>) =>
  <B extends S.Struct.Fields>(b: S.Struct<B>) => combine(a, b)
// export const cor =
//   <A extends S.Struct.Any>(a: A) => <B extends S.Schema.Any>(b: B) =>
//     oneof(a, b)

/** pipeable version of combine schemas via extends (note this has limitations and will prevent you from calling make)
 */
export const and =
  <A extends S.Schema.Any>(a: A) => <B extends S.Schema.Any>(b: B) =>
    bothof(a, b)
export const or =
  <A extends S.Schema.Any>(a: A) => <B extends S.Schema.Any>(b: B) =>
    oneof(a, b)

type AllOf<T extends [S.Schema.Any, ...S.Schema.Any[]]> = T extends [
  infer First extends S.Schema.Any,
  infer Second extends S.Schema.Any,
  ...infer Rest extends S.Schema.Any[]
] ? AllOf<[S.extend<First, Second>, ...Rest]>
  : T[0] // when only one left, return it

export function allof<T extends [S.Schema.Any, ...S.Schema.Any[]]>(
  ...schemas: T
): AllOf<T> {
  return schemas.reduce((acc, curr) => bothof(acc, curr)) as AllOf<T>
}

export const struct = S.Struct
export const number = S.Number
export const boolean = S.Boolean
export const between = S.between

export const prop = <A extends string, V extends S.Schema.Any>(
  name: A,
  schema: V
) => struct({ [name]: schema } as { [K in A]: V })
export const numberbetween = (start: number, end: number) =>
  pipe(number, between(start, end))

export const collect = <T extends [S.Schema.Any, ...S.Schema.Any[]]>(
  ...items: T
) =>
  [
    allof(...items),
    oneof(...items)
  ] as const
