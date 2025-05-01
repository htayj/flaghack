import { Schema } from "effect"
import { collect, numberbetween, prop, struct } from "./util.js"

const AttributeGeneric = numberbetween(0, 20)
// pipe(number, between(start, end))

const Charisma = prop("charisma", AttributeGeneric)
const Strength = prop("strength", AttributeGeneric)
const Intelligence = prop("intelligence", AttributeGeneric)
const Dexterity = prop("dexterity", AttributeGeneric)
const Constitution = prop("constitution", AttributeGeneric)
const Wisdom = prop("charisma", AttributeGeneric)

export const [AllAttributes, AnyAttribute] = collect(
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
export const StatusEffect = struct({
  active: Schema.Boolean,
  started: Schema.Number,
  duration: Schema.Number
})
export const Confused = prop("confused", StatusEffect)
export const [allStatusEffect, AnyStatusEffect] = collect(Confused)

/** Properties:
Things that something either has or doesnt have and that are conferred or removed via some action. Immutable properties are not included
 */
export const Property = Schema.Boolean

export const Fixed = prop("fixed", Property) // not able to be corroded or burned due to magic
export const Wet = prop("wet", Property)

export const [AllProperties, AnyProperty] = collect(Fixed, Wet)

/** States that an item can be in.
There can be multiple phases in a state. And an item must be in one of each state at all times
 */
export const State = Schema.Literal
export const Phase = State("solid", "gas", "liquid")
export const BUC = State("blessed", "uncursed", "cursed")
export const [AllStates, AnyState] = collect(Fixed, Wet)

/** things used to keep track of numerical state. Like hit points
We are currently keeping track of how much has been lost, the amount total is calculated based on other things
 */

export const Points = Schema.Number
export const HitP = prop("dhp", Points) // the amount of damage TAKEN
export const VrilP = prop("dvp", Points) // the amount of magic LOST
export const HungerP = prop("dhp", Points) // the amount of magic LOST
