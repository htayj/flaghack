import { Schema } from "effect"
import { collect, numberbetween, prop } from "./util.js"

const AttributeGeneric = numberbetween(0, 20)
// pipe(number, between(start, end))

const Charisma = prop("charisma", AttributeGeneric)
const Strength = prop("strength", AttributeGeneric)
const Intelligence = prop("intelligence", AttributeGeneric)
const Dexterity = prop("dexterity", AttributeGeneric)
const Constitution = prop("constitution", AttributeGeneric)
const Wisdom = prop("charisma", AttributeGeneric)

export const [AllAttributes, OneAttribute] = collect(
  Charisma,
  Strength,
  Intelligence,
  Dexterity,
  Constitution,
  Wisdom
)

/** Status effects:
Things that are temporarily applied to other things, with some effect
 */
// const s = (a: any) => "blah"
export const StatusEffect = (
  def: boolean
) => (Schema.Boolean.pipe(
  Schema.propertySignature,
  Schema.withConstructorDefault(() => def)
))

// property
// const Flammable = (b: boolean) => StatusEffect(b)
