import { Data, Either, Schema as S } from "effect";
import { allof, bothof, oneof, prop, struct } from "./util.js";
// using extend and union - cant use .make?
// const bothof = S.extend
// const oneof = S.Union
// const struct = S.Struct
// using spreading
// const bothof = <A extends struct.Fields, B extends struct.Fields>(a: struct<A>, b: struct<B>) => struct({ ...a.fields , ...b.fields })
// const oneof = <A extends struct.Fields, B extends struct.Fields>(a: struct<A>, b: struct<B>) => struct({ ...a.fields , ...b.fields })
//
const tagas = (schema, type) => bothof(schema, S.TaggedStruct(type, {}));
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
});
export const Key = S.String;
export const Keyed = prop("key", Key);
export const Contain = struct({ in: Key });
export const Position = struct({ at: Pos });
export const Location = oneof(Contain, Position);
// export const EntityPositioned = struct({
//   ...Keyed.fields,
//   loc: Position
// })
// export const EntityContained = struct({
//   ...Keyed.fields,
//   loc: Contain
// })
// export const EntityBase = S.Union(Keyed, Located)
export const EntityBase = allof(Keyed, Position, Contain);
export const CreatureBase = allof(EntityBase, struct({ name: S.String.pipe(S.optional) }));
export const TerrainBase = EntityBase;
// export const ItemBase = kindas(EntityBase, "item")
// ===========================
// items
// ===========================
// >> Flags
export const FlagType = EntityBase;
export const Flag = tagas(FlagType, "flag");
export const AnyFlag = oneof(Flag);
// >> Drinks
export const Drink = EntityBase;
export const Water = tagas(Drink, "water");
export const Acid = tagas(Drink, "acid");
export const Booze = tagas(Drink, "booze");
export const Milk = tagas(Drink, "booze");
export const AnyDrink = oneof(Water, Acid, Booze, Milk);
// >> Food
export const Food = EntityBase;
export const Poptart = tagas(Food, "poptart");
export const Trailmix = tagas(Food, "trailmix");
export const Pancake = tagas(Food, "pancake");
export const Bacon = tagas(Food, "bacon");
export const Soup = tagas(Food, "soup");
export const AnyFood = oneof(Poptart, Trailmix, Pancake, Bacon, Soup);
// >> Swag
export const Swag = EntityBase;
// >> Wristbands
export const Wristband = EntityBase;
// >> tools
export const Tool = EntityBase;
export const Hammer = tagas(Tool, "hammer");
export const Nails = tagas(Tool, "nails");
export const AnyTool = oneof(Hammer, Nails);
// <<<<<<
export const AnyItem = oneof(Flag, AnyFood, AnyDrink);
// ===========================
// Creatures
// ===========================
// >> Humans
export const Human = CreatureBase;
export const Player = tagas(Human, "player");
export const Ranger = tagas(Human, "ranger");
// export const Player = tagas(Human, "player")
export const AnyHuman = oneof(Player, Ranger);
// >> Humanoids
export const Humanoid = CreatureBase;
export const Hippie = tagas(Humanoid, "hippie");
export const Wook = tagas(Humanoid, "wook");
export const AnyHumanoid = oneof(Hippie, Wook);
// >> Kops
export const Kop = CreatureBase;
export const AcidKop = tagas(Kop, "acidcop");
export const AnyKop = oneof(AcidKop);
// >> Egregores
export const Egregore = CreatureBase;
export const LesserEgregore = tagas(Egregore, "lesser_egregore");
export const GreaterEgregore = tagas(Egregore, "greater_egregore");
export const OneofiveEgregore = tagas(Egregore, "collective_egregore");
export const AnyEgregore = oneof(LesserEgregore, GreaterEgregore, OneofiveEgregore);
// <<<<<
export const AnyCreature = oneof(AnyHuman, AnyHumanoid, AnyKop, AnyEgregore);
// ===========================
// terrains
// ===========================
export const Wall = tagas(TerrainBase, "wall");
export const AnyTerrain = oneof(Wall);
// ===========================
// ===========================
// ===========================
export const Entity = oneof(AnyItem, AnyCreature, AnyTerrain);
// const testboth = bothof(struct({ a: S.Number }), struct({ b: S.Number }))
// const testproj =  S.Class(testboth)
// const encoded = S.encodedSchema(Entity)
// const a = typeof encoded.make()
export const Direction = S.Literal("N", "E", "S", "W", "NE", "NW", "SE", "SW");
export const EAction = Data.taggedEnum();
// const CAction = Data.Class<Action>( EAction)
// const taction = Data.tuple(EAction)
// const straction = Data.struct(EAction)
// export const SAction = S.TaggedStruct<Action>()
// export const SAction = S.Tuple(taction)
// export const SAction = S.Struct(straction)
export const SAction = oneof(S.TaggedStruct("action", {}), S.TaggedStruct("noop", {}), S.TaggedStruct("move", { dir: Direction }), S.TaggedStruct("pickup", { object: Entity }));
export const conforms = (schema) => (u) => S.validateEither(schema)(u).pipe(Either.match({ onLeft: () => false, onRight: () => true }));
export const GameState = S.Record({ key: S.String, value: Entity });
//# sourceMappingURL=schemas.js.map