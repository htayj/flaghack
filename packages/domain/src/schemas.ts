import { Data, Schema as S } from "effect"
import { Role, RoleId } from "./roles.js"
import { AllAttributes } from "./stats.js"

const Coordinate = S.Int

export const Pos = S.Struct({
  x: Coordinate,
  y: Coordinate,
  z: Coordinate
})

export const Key = S.String

const KeyedFields = { key: Key } as const
const ContainFields = { in: Key } as const
const PositionFields = { at: Pos } as const

export const Keyed = S.Struct(KeyedFields)
export const Contain = S.Struct(ContainFields)
export const Position = S.Struct(PositionFields)

// Current entities intentionally include `key`, `at`, and `in`. The larger
// `{InWorld|InContainer}` ADT, branded EntityKey, map-key/entity-key
// consistency, and containment-reference validation cleanup is deferred.
const EntityBaseFields = {
  ...KeyedFields,
  ...PositionFields,
  ...ContainFields
} as const

export const EntityBase = S.Struct(EntityBaseFields)

const CreatureBaseFields = {
  ...EntityBaseFields,
  name: S.String.pipe(S.optional)
} as const

export const CreatureBase = S.Struct(CreatureBaseFields)
export const TerrainBase = EntityBase

// ===========================
// items
// ===========================
// >> Flags
export const FlagType = EntityBase
export const Flag = S.TaggedStruct("flag", EntityBaseFields)
export const AnyFlag = S.Union(Flag)

// >> Drinks
export const DrinkItemTags = [
  "water",
  "acid",
  "booze",
  "beer",
  "milk"
] as const
export const Drink = EntityBase
export const Water = S.TaggedStruct("water", EntityBaseFields)
export const Acid = S.TaggedStruct("acid", EntityBaseFields)
export const Booze = S.TaggedStruct("booze", EntityBaseFields)
export const Beer = S.TaggedStruct("beer", EntityBaseFields)
export const Milk = S.TaggedStruct("milk", EntityBaseFields)
export const AnyBasicDrink = S.Union(Water, Acid, Booze, Milk)
export const AnyDrink = S.Union(AnyBasicDrink, Beer)

// >> Food
export const FoodItemTags = [
  "poptart",
  "trailmix",
  "pancake",
  "bacon",
  "soup",
  "hotdog",
  "cheese",
  "salsa"
] as const
export const Food = EntityBase
export const Poptart = S.TaggedStruct("poptart", EntityBaseFields)
export const Trailmix = S.TaggedStruct("trailmix", EntityBaseFields)
export const Pancake = S.TaggedStruct("pancake", EntityBaseFields)
export const Bacon = S.TaggedStruct("bacon", EntityBaseFields)
export const Soup = S.TaggedStruct("soup", EntityBaseFields)
export const Hotdog = S.TaggedStruct("hotdog", EntityBaseFields)
export const Cheese = S.TaggedStruct("cheese", EntityBaseFields)
export const Salsa = S.TaggedStruct("salsa", EntityBaseFields)
export const AnyShelfStableFood = S.Union(
  Poptart,
  Trailmix,
  Pancake,
  Bacon,
  Soup
)
export const AnyRefrigeratedCampFood = S.Union(Hotdog, Cheese, Salsa)
export const AnyFood = S.Union(
  AnyShelfStableFood,
  AnyRefrigeratedCampFood
)

// >> Containers
export const Container = EntityBase
export const Cooler = S.TaggedStruct("cooler", EntityBaseFields)
export const AnyContainer = S.Union(Cooler)

// >> Swag
export const Swag = EntityBase

// >> Wristbands
export const Wristband = EntityBase

// >> tools
export const Tool = EntityBase
export const Hammer = S.TaggedStruct("hammer", EntityBaseFields)
export const Nails = S.TaggedStruct("nails", EntityBaseFields)
export const AnyTool = S.Union(Hammer, Nails)

export const AnyComestible = S.Union(AnyFood, AnyDrink)
export const AnyItem = S.Union(
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
const PlayerFields = {
  ...CreatureBaseFields,
  role: RoleId.pipe(S.optional),
  attributes: AllAttributes.pipe(S.optional)
} as const
export const Player = S.TaggedStruct("player", PlayerFields)
export const Ranger = S.TaggedStruct("ranger", CreatureBaseFields)
export const AnyHuman = S.Union(Player, Ranger)

// >> Humanoids
export const Humanoid = CreatureBase
export const Hippie = S.TaggedStruct("hippie", CreatureBaseFields)
export const Wook = S.TaggedStruct("wook", CreatureBaseFields)
export const AnyHumanoid = S.Union(Hippie, Wook)

// >> Kops
export const Kop = CreatureBase
export const AcidKop = S.TaggedStruct("acidcop", CreatureBaseFields)
export const AnyKop = S.Union(AcidKop)

// >> Egregores
export const Egregore = CreatureBase
export const LesserEgregore = S.TaggedStruct(
  "lesser_egregore",
  CreatureBaseFields
)
export const GreaterEgregore = S.TaggedStruct(
  "greater_egregore",
  CreatureBaseFields
)
export const OneofiveEgregore = S.TaggedStruct(
  "collective_egregore",
  CreatureBaseFields
)
export const AnyEgregore = S.Union(
  LesserEgregore,
  GreaterEgregore,
  OneofiveEgregore
)

export const AnyCreature = S.Union(
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
export const Wall = S.TaggedStruct("wall", {
  ...EntityBaseFields,
  variant: DirectionalVariant
})
export const Door = S.TaggedStruct("door", {
  ...EntityBaseFields,
  open: S.Boolean,
  variant: DirectionalVariant
})
export const TentWall = S.TaggedStruct("tent-wall", {
  ...EntityBaseFields,
  variant: DirectionalVariant
})
export const TentPost = S.TaggedStruct("tent-post", EntityBaseFields)
export const Floor = S.TaggedStruct("floor", EntityBaseFields)
export const Tunnel = S.TaggedStruct("tunnel", EntityBaseFields)
export const Tent = S.TaggedStruct("tent", EntityBaseFields)
export const Sign = S.TaggedStruct("sign", {
  ...EntityBaseFields,
  name: S.String
})
export const Effigy = S.TaggedStruct("effigy", EntityBaseFields)
export const Temple = S.TaggedStruct("temple", EntityBaseFields)

export const AnyTerrain = S.Union(
  Wall,
  Door,
  TentWall,
  TentPost,
  Floor,
  Tunnel,
  Tent,
  Sign,
  Effigy,
  Temple
)

export const Entity = S.Union(AnyItem, AnyCreature, AnyTerrain)

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

const ActionOptions = [
  S.TaggedStruct("apply", {}),
  S.TaggedStruct("noop", {}),
  S.TaggedStruct("move", { dir: Direction }),
  S.TaggedStruct("open", { dir: Direction }),
  S.TaggedStruct("close", { dir: Direction }),
  S.TaggedStruct("pickupMulti", { keys: S.Array(Key) }),
  S.TaggedStruct("dropMulti", { keys: S.Array(Key) }),
  S.TaggedStruct("lootTakeMulti", {
    containerKey: Key,
    keys: S.Array(Key)
  }),
  S.TaggedStruct("lootPutMulti", {
    containerKey: Key,
    keys: S.Array(Key)
  }),
  S.TaggedStruct("eatMulti", { keys: S.Array(Key) }),
  S.TaggedStruct("quaffMulti", { keys: S.Array(Key) })
] as const

export const SAction = S.Union(...ActionOptions)
export const SEAction = SAction
export type Action = typeof SAction.Type
export const EAction = Data.taggedEnum<Action>()

export const SEEntity = Entity
export const EEntity = Data.taggedEnum<typeof Entity.Type>()

export const conforms = <A, I>(
  schema: S.Schema<A, I, never>
): (u: unknown) => u is A => S.is(schema)

export const World = S.HashMap({ key: Key, value: Entity })
export const RoleSetupState = S.Struct({
  phase: S.Literal("selectRole", "confirm", "complete"),
  selectedRoleId: RoleId.pipe(S.optional)
})
export const RoleCollection = S.Array(Role)
export const ClientState = S.Struct({
  inventory: ItemCollection,
  roles: RoleCollection,
  setup: RoleSetupState,
  world: World
})
export const GameState = S.Struct({
  lazyOffscreenCursor: S.Number.pipe(S.optional),
  setup: RoleSetupState.pipe(S.optional),
  world: World
})
