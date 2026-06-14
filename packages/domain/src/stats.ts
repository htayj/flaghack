import { Schema } from "effect"
import { collect } from "./util.js"

const AttributeGeneric = Schema.Number.pipe(
  Schema.int(),
  Schema.between(0, 20)
)
const NonNegativeInteger = Schema.Number.pipe(
  Schema.int(),
  Schema.nonNegative()
)

const Charisma = Schema.Struct({ charisma: AttributeGeneric })
const Strength = Schema.Struct({ strength: AttributeGeneric })
const Intelligence = Schema.Struct({ intelligence: AttributeGeneric })
const Dexterity = Schema.Struct({ dexterity: AttributeGeneric })
const Constitution = Schema.Struct({ constitution: AttributeGeneric })
const Wisdom = Schema.Struct({ wisdom: AttributeGeneric })

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
export const StatusEffect = Schema.Struct({
  active: Schema.Boolean,
  started: NonNegativeInteger,
  duration: NonNegativeInteger
})
export const Confused = Schema.Struct({ confused: StatusEffect })
export const [allStatusEffect, AnyStatusEffect] = collect(Confused)

/** Properties:
Things that something either has or doesnt have and that are conferred or removed via some action. Immutable properties are not included
 */
export const Property = Schema.Boolean

export const Fixed = Schema.Struct({ fixed: Property }) // not able to be corroded or burned due to magic
export const Wet = Schema.Struct({ wet: Property })

export const [AllProperties, AnyProperty] = collect(Fixed, Wet)

/** States that an item can be in.
There can be multiple phases in a state. And an item must be in one of each state at all times
 */
export const State = Schema.Literal
export const Phase = State("solid", "gas", "liquid")
export const BUC = State("blessed", "uncursed", "cursed")
export const PhaseState = Schema.Struct({ phase: Phase })
export const BUCState = Schema.Struct({ buc: BUC })
export const [AllStates, AnyState] = collect(PhaseState, BUCState)

/** things used to keep track of numerical state. Like hit points
We are currently keeping track of how much has been lost, the amount total is calculated based on other things
 */

export const Points = NonNegativeInteger
export const HitP = Schema.Struct({ dhp: Points }) // the amount of damage TAKEN
export const VrilP = Schema.Struct({ dvp: Points }) // the amount of magic LOST
export const HungerP = Schema.Struct({ dhunger: Points }) // the amount of hunger LOST
