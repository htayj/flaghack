// import type { Schema } from "effect"
import { Schema as S } from "effect"
// type UnionMaker = typeof S.Union
// type Union = ReturnType<UnionMaker>
// type SchemaT = Parameters<UnionMaker>

const oneof = S.Union
// const taggedAs = <
//   A extends S.Struct.Fields,
//   K extends string,
//   V extends string
// >(
//   schema: S.Struct<A>,
//   tagKey: K,
//   tagValue: V
// ) =>
//   S.Struct({
//     [tagKey]: S.tag(tagValue),
//     ...schema.fields
//   })

const typeas = <A extends S.Struct.Fields, T extends string>(
  schema: S.Struct<A>,
  type: T
) =>
  S.TaggedStruct(type, {
    type: S.tag(type),
    ...schema.fields
  })
// const kindas = <A extends S.Struct.Fields, K extends string>(
//   schema: S.Struct<A>,
//   kind: K
// ) => taggedAs(schema, "kind" as const, kind)
const kindas = <A extends S.Struct.Fields, K extends string>(
  schema: S.Struct<A>,
  kind: K
) =>
  S.Struct({
    kind: S.tag(kind),
    ...schema.fields
  })

const bothof = <A extends S.Struct.Fields, B extends S.Struct.Fields>(
  a: S.Struct<A>,
  b: S.Struct<B>
) =>
  S.Struct({
    ...a.fields,
    ...b.fields
  })
// const allof = (...a: Union[]) =>
//   a.reduce((acc, curr) => S.compose(acc, curr)) // todo: not sure if this is right

export const Pos = S.Struct({
  x: S.Number,
  y: S.Number
})

export const Key = S.String
export const Keyed = S.Struct({ key: Key })

export const Contain = S.Struct({ in: Key })
export const Position = S.Struct({ at: Pos })
export const Location = oneof(Contain, Position)

export const EntityPositioned = S.Struct({
  ...Keyed.fields,
  loc: Position
})
export const EntityContained = S.Struct({
  ...Keyed.fields,
  loc: Contain
})
// export const EntityBase = S.Union(Keyed, Located)
export const EntityBase = oneof(
  EntityPositioned,
  EntityContained
)

export const CreatureBase = kindas(EntityPositioned, "creature")
export const TerrainBase = kindas(EntityPositioned, "terrain")
export const ItemPositioned = kindas(EntityPositioned, "item")
export const ItemContained = kindas(EntityContained, "item")
export const ItemBase = oneof(
  ItemPositioned,
  ItemContained
)
export const FlagContained = typeas(ItemContained, "flag")
export const FlagPositioned = typeas(ItemPositioned, "flag")
export const Flag = oneof(FlagPositioned, FlagContained)

export const Player = typeas(
  bothof(CreatureBase, S.Struct({ name: S.String })),
  "player"
)
export const Hippie = typeas(
  bothof(CreatureBase, S.Struct({ name: S.String })),
  "hippie"
)

export const Wall = typeas(TerrainBase, "wall")
export const Creature = oneof(Player, Hippie)
export const Item = oneof(Flag)
export const Terrain = oneof(Wall)
export const Entity = oneof(Item, Creature, Terrain)

// export const EntityPositioned = S.Struct({
//   ...Keyed.fields,
//   loc: Position
// })
// type a = typeof EntityPositioned.Type
// export const EntityContained = S.Struct({
//   ...Keyed.fields,
//   ...Contained.fields
// })

// export const EntityPositioned = S.Struct({
//   ...Keyed.fields,
//   ...Positioned.fields
// })
// export const EntityContained = S.Struct({
//   ...Keyed.fields,
//   ...Contained.fields
// })

// export const EntityBase = S.Union(EntityPositioned, EntityContained)
