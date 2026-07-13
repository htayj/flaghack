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
  attributes: AllAttributes,
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
  role: RoleId.pipe(S.optional)
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
export const Mud = S.TaggedStruct("mud", EntityBaseFields)
export const Tunnel = S.TaggedStruct("tunnel", EntityBaseFields)
export const Tent = S.TaggedStruct("tent", EntityBaseFields)
export const Sign = S.TaggedStruct("sign", {
  ...EntityBaseFields,
  name: S.String
})
export const Effigy = S.TaggedStruct("effigy", EntityBaseFields)
export const Temple = S.TaggedStruct("temple", EntityBaseFields)
export const StairsDown = S.TaggedStruct("stairs-down", EntityBaseFields)
export const StairsUp = S.TaggedStruct("stairs-up", EntityBaseFields)
export const CampPropKinds = [
  "arrival-gate",
  "artwork",
  "flagpole",
  "stage",
  "workbench",
  "bike-rack",
  "directory",
  "water-station",
  "speaker",
  "lantern",
  "table"
] as const
export const CampPropKind = S.Literal(...CampPropKinds)
export const CampProp = S.TaggedStruct("camp-prop", {
  ...EntityBaseFields,
  kind: CampPropKind
})

export const AnyTerrain = S.Union(
  Wall,
  Door,
  TentWall,
  TentPost,
  Floor,
  Mud,
  Tunnel,
  Tent,
  Sign,
  Effigy,
  Temple,
  StairsDown,
  StairsUp,
  CampProp
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
  S.TaggedStruct("descend", {}),
  S.TaggedStruct("ascend", {}),
  S.TaggedStruct("talk", { dir: Direction }),
  S.TaggedStruct("travelStep", { landmarkId: S.String }),
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
export const GameplayEventKind = S.Literal("arrival-narration")
export const GameplayEvent = S.Struct({
  id: S.Int,
  interruptsTravel: S.Boolean.pipe(S.optional),
  kind: GameplayEventKind.pipe(S.optional),
  message: S.String
})
export const GameplayEventCollection = S.Array(GameplayEvent)
export const CampgroundAddress = S.Struct({
  districtId: S.String.pipe(S.optional),
  label: S.String,
  marker: S.String.pipe(S.optional),
  roadId: S.String.pipe(S.optional)
})
export const CampgroundCampPlacement = S.Struct({
  address: CampgroundAddress,
  entranceAt: Pos,
  id: S.String,
  kind: S.String,
  name: S.String,
  signAt: Pos,
  signKey: Key.pipe(S.optional)
})
export const CampgroundLandmarkPlacement = S.Struct({
  address: CampgroundAddress,
  at: Pos,
  entityKey: Key.pipe(S.optional),
  id: S.String,
  kind: S.String,
  name: S.String,
  travelAt: Pos.pipe(S.optional)
})
export const CampgroundNpcAssignmentRole = S.Literal(
  "resident",
  "host",
  "civic",
  "traveler",
  "patrol"
)
export const CampgroundNpcAssignment = S.Struct({
  campId: S.String.pipe(S.optional),
  homeAt: Pos.pipe(S.optional),
  landmarkId: S.String.pipe(S.optional),
  npcKey: Key,
  role: CampgroundNpcAssignmentRole,
  routeLandmarkIds: S.Array(S.String).pipe(S.optional)
})
export const CampgroundFavorPhase = S.Literal(
  "unavailable",
  "offered",
  "active",
  "ready",
  "completed"
)
export const CampgroundFavorState = S.Struct({
  giverNpcKey: Key.pipe(S.optional),
  phase: CampgroundFavorPhase,
  recipientNpcKey: Key.pipe(S.optional),
  requiredItemKey: Key.pipe(S.optional),
  rewardGranted: S.Boolean.pipe(S.optional)
})
export const MissingFlagPhase = S.Literal(
  "not-started",
  "seeking-rumors",
  "temple-lead",
  "flag-retrieved",
  "returned"
)
export const CampgroundAmbienceSchedule = S.Struct({
  lastMessageTurn: S.Int.pipe(S.optional),
  nextTurn: S.Int.pipe(S.optional),
  zoneId: S.String.pipe(S.optional)
})
export const CampgroundWeather = S.Struct({
  condition: S.Literal("heavy-rain")
})
export const CampgroundPublicEventPhase = S.Literal(
  "scheduled",
  "active",
  "cooldown"
)
export const CampgroundPublicEventScheduler = S.Struct({
  endTurn: S.Int.pipe(S.optional),
  hostCampId: S.String.pipe(S.optional),
  kind: S.String.pipe(S.optional),
  nextTurn: S.Int.pipe(S.optional),
  phase: CampgroundPublicEventPhase,
  startTurn: S.Int.pipe(S.optional)
})
export const CampgroundActiveTravel = S.Struct({
  destinationId: S.String,
  nextIndex: S.Int,
  path: S.Array(Pos)
})
export const CampgroundState = S.Struct({
  activeTravel: CampgroundActiveTravel.pipe(S.optional),
  campPlacements: S.Array(CampgroundCampPlacement).pipe(S.optional),
  contentVersion: S.String.pipe(S.optional),
  discoveredIds: S.Array(S.String).pipe(S.optional),
  greetedNpcKeys: S.Array(Key).pipe(S.optional),
  landmarkPlacements: S.Array(CampgroundLandmarkPlacement).pipe(
    S.optional
  ),
  missingFlagKey: Key.pipe(S.optional),
  missingFlagOwnerNpcKey: Key.pipe(S.optional),
  missingFlagPhase: MissingFlagPhase.pipe(S.optional),
  npcAssignments: S.Array(CampgroundNpcAssignment).pipe(S.optional),
  publicEvent: CampgroundPublicEventScheduler.pipe(S.optional),
  seed: S.Int.pipe(S.optional),
  surfaceAmbience: CampgroundAmbienceSchedule.pipe(S.optional),
  toolFavor: CampgroundFavorState.pipe(S.optional),
  version: S.Int,
  waterFavor: CampgroundFavorState.pipe(S.optional),
  weather: CampgroundWeather.pipe(S.optional),
  welcomeFavor: CampgroundFavorState.pipe(S.optional)
})
export const CampgroundLandmarkView = S.Struct({
  address: S.String,
  at: Pos,
  id: S.String,
  kind: S.String,
  name: S.String,
  travelAvailable: S.Boolean
})
export const CampgroundActiveEventSummary = S.Struct({
  endTurn: S.Int.pipe(S.optional),
  hostCampId: S.String.pipe(S.optional),
  kind: S.String,
  landmarkId: S.String,
  name: S.String
})
export const CampgroundView = S.Struct({
  activeEvent: CampgroundActiveEventSummary.pipe(S.optional),
  currentAddress: S.String.pipe(S.optional),
  discoveredLandmarks: S.Array(CampgroundLandmarkView),
  weather: CampgroundWeather.pipe(S.optional)
})
export const ClientState = S.Struct({
  campground: CampgroundView,
  gameplayEvents: GameplayEventCollection,
  inventory: ItemCollection,
  roles: RoleCollection,
  setup: RoleSetupState,
  world: World
})
export const GameState = S.Struct({
  campground: CampgroundState.pipe(S.optional),
  gameplayEvents: GameplayEventCollection.pipe(S.optional),
  greetedTunnelHippieKeys: S.Array(Key).pipe(S.optional),
  lazyOffscreenCursor: S.Number.pipe(S.optional),
  nextDungeonAmbientTurn: S.Int.pipe(S.optional),
  nextGameplayEventId: S.Int.pipe(S.optional),
  setup: RoleSetupState.pipe(S.optional),
  turn: S.Int.pipe(S.optional),
  world: World
})
