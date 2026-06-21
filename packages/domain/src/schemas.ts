import { Data, Schema as S } from "effect"
import { allof, bothof, oneof, prop, struct } from "./util.js"

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

// const display =
//   <A extends S.Schema.Any>(schema: A) =>
//   (color: string, char: string, bright?: boolean) =>
//     bothof(
//       schema,
//       S.Struct({
//         color,
//         char,
//         bright
//       })
//     )

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

const Coordinate = S.Int

export const Pos = struct({
  x: Coordinate,
  y: Coordinate,
  z: Coordinate
})

export const Key = S.String
export const Keyed = prop("key", Key)

export const Contain = struct({ in: Key })
export const Position = struct({ at: Pos })

// Current entities intentionally include `key`, `at`, and `in`. The larger
// `{InWorld|InContainer}` ADT, branded EntityKey, map-key/entity-key
// consistency, and containment-reference validation cleanup is deferred.
export const EntityBase = allof(
  Keyed,
  Position,
  Contain
)

export const CreatureBase = allof(
  EntityBase,
  struct({ name: S.String.pipe(S.optional) })
)
export const TerrainBase = EntityBase
// export const ItemBase = kindas(EntityBase, "item")
// ===========================
// items
// ===========================
// >> Flags
export const FlagType = EntityBase

export const Flag = tagas(FlagType, "flag")

export const AnyFlag = oneof(
  Flag
)

// >> Drinks
export const Drink = EntityBase

export const Water = tagas(Drink, "water")
export const Acid = tagas(Drink, "acid")
export const Booze = tagas(Drink, "booze")
export const Beer = tagas(Drink, "beer")
export const Milk = tagas(Drink, "milk")
export const AnyBasicDrink = oneof(
  Water,
  Acid,
  Booze,
  Milk
)
export const AnyDrink = oneof(
  AnyBasicDrink,
  Beer
)

// >> Food
export const Food = EntityBase

export const Poptart = tagas(Food, "poptart")
export const Trailmix = tagas(Food, "trailmix")
export const Pancake = tagas(Food, "pancake")
export const Bacon = tagas(Food, "bacon")
export const Soup = tagas(Food, "soup")
export const Hotdog = tagas(Food, "hotdog")
export const Cheese = tagas(Food, "cheese")
export const Salsa = tagas(Food, "salsa")
export const AnyShelfStableFood = oneof(
  Poptart,
  Trailmix,
  Pancake,
  Bacon,
  Soup
)
export const AnyRefrigeratedCampFood = oneof(
  Hotdog,
  Cheese,
  Salsa
)
export const AnyFood = oneof(
  AnyShelfStableFood,
  AnyRefrigeratedCampFood
)

// >> Containers
export const Container = EntityBase

export const Cooler = tagas(Container, "cooler")
export const AnyContainer = oneof(
  Cooler
)

// >> Swag
export const Swag = EntityBase

// >> Wristbands
export const Wristband = EntityBase

// >> tools
export const Tool = EntityBase

export const Hammer = tagas(Tool, "hammer")
export const Nails = tagas(Tool, "nails")
export const AnyTool = oneof(
  Hammer,
  Nails
)

// <<<<<<

export const AnyComestible = oneof(
  AnyFood,
  AnyDrink
)
export const AnyItem = oneof(
  Flag,
  AnyComestible,
  AnyTool,
  AnyContainer
)
export const ItemCollection = S.HashMap({ key: Key, value: AnyItem })
export const ContainerCollection = S.HashMap({
  key: Key,
  value: AnyContainer
})
// ===========================
// Creatures
// ===========================
// >> Humans
export const Human = CreatureBase

export const Player = tagas(Human, "player")
export const Ranger = tagas(Human, "ranger")
// export const Player = tagas(Human, "player")
export const AnyHuman = oneof(Player, Ranger)

// >> Humanoids
export const Humanoid = CreatureBase

export const Hippie = tagas(Humanoid, "hippie")
export const Wook = tagas(Humanoid, "wook")

export const AnyHumanoid = oneof(Hippie, Wook)

// >> Kops
export const Kop = CreatureBase

export const AcidKop = tagas(Kop, "acidcop")
export const AnyKop = oneof(AcidKop)

// >> Egregores
export const Egregore = CreatureBase

export const LesserEgregore = tagas(Egregore, "lesser_egregore")
export const GreaterEgregore = tagas(Egregore, "greater_egregore")
export const OneofiveEgregore = tagas(Egregore, "collective_egregore")

export const AnyEgregore = oneof(
  LesserEgregore,
  GreaterEgregore,
  OneofiveEgregore
)

// <<<<<

export const AnyCreature = oneof(
  AnyHuman,
  AnyHumanoid,
  AnyKop,
  AnyEgregore
)
// ===========================
// terrains
// ===========================
export const DirectionalVariant = S.Literal(
  "vertical",
  "horizontal",
  "bottomLeft",
  "bottomRight",
  "topLeft",
  "topRight",
  "cross",
  "t-up",
  "t-down",
  "t-left",
  "t-right",
  "none"
)
export const WithDirectionalVariant = S.Struct({
  variant: DirectionalVariant
})
export const Wall = tagas(
  bothof(TerrainBase, WithDirectionalVariant),
  "wall"
)
export const Floor = tagas(
  TerrainBase,
  "floor"
)
export const Tunnel = tagas(TerrainBase, "tunnel")
export const Tent = tagas(TerrainBase, "tent")
export const Sign = tagas(
  bothof(TerrainBase, struct({ name: S.String })),
  "sign"
)
export const Effigy = tagas(TerrainBase, "effigy")
export const Temple = tagas(TerrainBase, "temple")

// export const AnyTerrain = oneof(Wall, Tunnel)
// export const AnyTerrain = oneof(Wall)
export const AnyTerrain = oneof(
  Wall,
  Floor,
  Tunnel,
  Tent,
  Sign,
  Effigy,
  Temple
)
// type a = typeof AnyTerrain.Type
// export const AnyTerrain = oneof(Wall, Floor, Tunnel)

// ===========================
// ===========================
// ===========================

export const Entity = oneof(AnyItem, AnyCreature, AnyTerrain)
// const testboth = bothof(struct({ a: S.Number }), struct({ b: S.Number }))
// const testproj =  S.Class(testboth)
// const encoded = S.encodedSchema(Entity)
// const a = typeof encoded.make()

export const Direction = S.Literal(
  "N",
  "E",
  "S",
  "W",
  "NE",
  "NW",
  "SE",
  "SW"
)

// export type Action = Data.TaggedEnum<{
//   apply: {}
//   noop: {}
//   move: { dir: typeof Direction.Type }
// }>

// export const EAction = Data.taggedEnum<Action>()

const ActionOptions = [
  S.TaggedStruct("apply", {}),
  S.TaggedStruct("noop", {}),
  S.TaggedStruct("move", { dir: Direction }),
  S.TaggedStruct("pickupMulti", { keys: S.Array(Key) }),
  S.TaggedStruct("dropMulti", { keys: S.Array(Key) }),
  S.TaggedStruct("lootTakeMulti", {
    containerKey: Key,
    keys: S.Array(Key)
  }),
  S.TaggedStruct("lootPutMulti", {
    containerKey: Key,
    keys: S.Array(Key)
  })
]
export const SAction = S.Union(
  ...ActionOptions
)
export const SEAction = S.Data(SAction)
export const EAction = Data.taggedEnum<typeof SEAction.Type>()
export type Action = typeof SAction.Type
// const schemaUnionToDataEnum = <
//   A extends [
//     S.TaggedStruct<SchemaAST.LiteralValue, S.Struct.Fields>,
//     ...S.TaggedStruct<SchemaAST.LiteralValue, S.Struct.Fields>[]
//   ]
// >(
//   structs: A
// ) => {
//   const a = structs
//   const union = S.Union(...a) as S.Union<A>
//   const dataSchema = S.Data<typeof union, A, A>(union) // maybe add a type
//   type DataSchemaT = typeof dataSchema.Type
//   return Data.taggedEnum<DataSchemaT>()
// }

export const SEEntity = S.Data(Entity)
export const EEntity = Data.taggedEnum<typeof SEEntity.Type>()

export const conforms = <A, I>(
  schema: S.Schema<A, I, never>
): (u: unknown) => u is A => S.is(schema)

export const World = S.HashMap({ key: Key, value: Entity })
export const GameState = S.Struct({ world: World })

// const flatten = <A, B, C>(s: S.Schema<A, B, C>) => {
//   return s.pipe(S.asSchema, S.compose)
// }
// const b = flatten(AnyCreature)
