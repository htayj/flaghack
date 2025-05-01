import { Schema as S } from "effect"
import { bothof, oneof, struct } from "./util.js"

// using extend and union - cant use .make?
// const bothof = S.extend
// const oneof = S.Union
// const struct = S.Struct

// using spreading
// const bothof = <A extends struct.Fields, B extends struct.Fields>(a: struct<A>, b: struct<B>) => struct({ ...a.fields , ...b.fields })
// const oneof = <A extends struct.Fields, B extends struct.Fields>(a: struct<A>, b: struct<B>) => struct({ ...a.fields , ...b.fields })
//

const typeas = <A extends S.Schema.Any, T extends string>(
  schema: A,
  type: T
) =>
  bothof(
    schema,
    S.TaggedStruct(type, {
      type: S.tag(type)
    })
  )
const kindas = <A extends S.Schema.Any, K extends string>(
  schema: A,
  kind: K
) =>
  bothof(
    schema,
    struct({
      kind: S.tag(kind)
    })
  )

// const bothof = <A extends struct.Fields, B extends struct.Fields>(
//   a: struct<A>,
//   b: struct<B>
// ) =>
//   struct({
//     ...a.fields,
//     ...b.fields
//   })
// const allof = (...a: Union[]) =>
//   a.reduce((acc, curr) => S.compose(acc, curr)) // todo: not sure if this is right

export const Pos = struct({
  x: S.Number,
  y: S.Number
})

export const Key = S.String
export const Keyed = struct({ key: Key })

export const Contain = struct({ in: Key })
export const Position = struct({ at: Pos })
export const Location = oneof(Contain, Position)

export const EntityPositioned = struct({
  ...Keyed.fields,
  loc: Position
})
export const EntityContained = struct({
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
// export const FlagContained = typeas(ItemBase, "flag")
// export const FlagPositioned = typeas(ItemPositioned, "flag")
// export const Flag = oneof(FlagPositioned, FlagContained)
export const Flag = typeas(ItemBase, "flag")

export const Player = typeas(
  bothof(CreatureBase, struct({ name: S.String })),
  "player"
)
export const Hippie = typeas(
  bothof(CreatureBase, struct({ name: S.String })),
  "hippie"
)

export const Wall = typeas(TerrainBase, "wall")
export const Creature = oneof(Player, Hippie)
export const Item = oneof(Flag)
export const Terrain = oneof(Wall)

export const Entity = oneof(Item, Creature, Terrain)
// const testboth = bothof(struct({ a: S.Number }), struct({ b: S.Number }))
// const testproj =  S.Class(testboth)
// const encoded = S.encodedSchema(Entity)
// const a = typeof encoded.make()
