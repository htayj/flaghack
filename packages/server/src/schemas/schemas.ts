import { Schema as S } from "effect"
import { allof, bothof, collect, oneof, prop, struct } from "./util.js"

// using extend and union - cant use .make?
// const bothof = S.extend
// const oneof = S.Union
// const struct = S.Struct

// using spreading
// const bothof = <A extends struct.Fields, B extends struct.Fields>(a: struct<A>, b: struct<B>) => struct({ ...a.fields , ...b.fields })
// const oneof = <A extends struct.Fields, B extends struct.Fields>(a: struct<A>, b: struct<B>) => struct({ ...a.fields , ...b.fields })
//

const tagas = <A extends S.Schema.Any, T extends string>(
  schema: A,
  type: T
) =>
  bothof(
    schema,
    S.TaggedStruct(type, {})
  )
const typeas = <A extends S.Schema.Any, K extends string>(
  schema: A,
  kind: K
) =>
  bothof(
    schema,
    struct({
      type: S.tag(kind)
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
export const Keyed = prop("key", Key)

export const Contain = struct({ in: Key })
export const Position = struct({ at: Pos })
export const Location = oneof(Contain, Position)

// export const EntityPositioned = struct({
//   ...Keyed.fields,
//   loc: Position
// })
// export const EntityContained = struct({
//   ...Keyed.fields,
//   loc: Contain
// })
// export const EntityBase = S.Union(Keyed, Located)
export const EntityBase = allof(
  Keyed,
  Position,
  Contain
)

export const CreatureBase = kindas(
  allof(EntityBase, struct({ name: S.String.pipe(S.optional) })),
  "creature"
)
export const TerrainBase = kindas(EntityBase, "terrain")
export const ItemPositioned = kindas(EntityBase, "item")
export const ItemContained = kindas(EntityBase, "item")
export const ItemBase = oneof(
  ItemPositioned,
  ItemContained
)
// ===========================
// items
// ===========================
// >> Flags
export const FlagType = typeas(ItemBase, "flag")

export const Flag = tagas(FlagType, "flag")

// >> Drinks
export const Drink = typeas(ItemBase, "drink")

export const Water = tagas(Drink, "water")
export const Acid = tagas(Drink, "acid")
export const Booze = tagas(Drink, "booze")
export const Milk = tagas(Drink, "booze")
export const [AllDrink, AnyDrink] = collect(
  Water,
  Acid,
  Booze,
  Milk
)

// >> Food
export const Food = typeas(ItemBase, "food")

export const Poptart = tagas(Food, "poptart")
export const Trailmix = tagas(Food, "trailmix")
export const Pancake = tagas(Food, "pancake")
export const Bacon = tagas(Food, "bacon")
export const Soup = tagas(Food, "soup")
export const [AllFood, AnyFood] = collect(
  Poptart,
  Trailmix,
  Pancake,
  Bacon,
  Soup
)

// >> Swag
export const Swag = typeas(ItemBase, "swag")

// >> Wristbands
export const Wristband = typeas(ItemBase, "wristband")

// >> tools
export const Tool = typeas(ItemBase, "tool")

export const Hammer = tagas(Tool, "hammer")
export const Nails = tagas(Tool, "nails")

// <<<<<<

export const Item = oneof(Flag, AnyFood, AnyDrink)
// ===========================
// Creatures
// ===========================
// >> Humans
export const Human = typeas(CreatureBase, "human")

export const Player = tagas(Human, "player")
export const Ranger = tagas(Human, "ranger")
// export const Player = tagas(Human, "player")
export const [AllHumans, AnyHuman] = collect(Player, Ranger)

// >> Humanoids
export const Humanoid = typeas(CreatureBase, "humanoid")

export const Hippie = tagas(Humanoid, "hippie")
export const Wook = tagas(Humanoid, "wook")

export const [AllHumanoids, AnyHumanoid] = collect(Hippie, Wook)

// >> Kops
export const Kop = typeas(CreatureBase, "kop")

export const AcidKop = tagas(Kop, "acidcop")
export const [AllKops, AnyKop] = collect(AcidKop)

// >> Egregores
export const Egregore = typeas(CreatureBase, "egregore")

export const LesserEgregore = tagas(Egregore, "lesser_egregore")
export const GreaterEgregore = tagas(Egregore, "greater_egregore")
export const CollectiveEgregore = tagas(Egregore, "collective_egregore")

export const [AllEgregores, AnyEgregore] = collect(
  LesserEgregore,
  GreaterEgregore,
  CollectiveEgregore
)

// <<<<<

export const Creature = oneof(
  AnyHuman,
  AnyHumanoid,
  AnyKop,
  AnyEgregore
)
// ===========================
// terrains
// ===========================
export const Wall = tagas(TerrainBase, "wall")

export const Terrain = oneof(Wall)

// ===========================
// ===========================
// ===========================

export const Entity = oneof(Item, Creature, Terrain)
// const testboth = bothof(struct({ a: S.Number }), struct({ b: S.Number }))
// const testproj =  S.Class(testboth)
// const encoded = S.encodedSchema(Entity)
// const a = typeof encoded.make()
