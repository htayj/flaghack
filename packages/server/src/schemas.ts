// import type { Schema } from "effect"
import { Schema as S } from "effect"

// const oneof = (a: Schema, b: Schema) =>
//   S.Union(a, b)
export const Pos = S.Struct({
  x: S.Number,
  y: S.Number
})

export const Key = S.String
export const Keyed = S.Struct({ key: Key })

export const Contained = S.Struct({ in: Key })
export const Positioned = S.Struct({ pos: Pos })
export const Located = S.Union(Contained, Positioned)

export const EntityPositioned = S.Struct({
  ...Keyed.fields,
  ...Positioned.fields
})
export const EntityContained = S.Struct({
  ...Keyed.fields,
  ...Contained.fields
})

export const EntityBase = S.Union(EntityPositioned, EntityContained)
