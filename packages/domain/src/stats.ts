import { Effect, Random, Schema } from "effect"

export const ATTRIBUTE_NAMES = [
  "charisma",
  "strength",
  "intelligence",
  "dexterity",
  "constitution",
  "wisdom"
] as const
export type AttributeName = typeof ATTRIBUTE_NAMES[number]

const AttributeGeneric = Schema.Number.pipe(
  Schema.int(),
  Schema.between(0, 20)
)
const NonNegativeInteger = Schema.Number.pipe(
  Schema.int(),
  Schema.nonNegative()
)

const AttributeFields = {
  charisma: AttributeGeneric,
  strength: AttributeGeneric,
  intelligence: AttributeGeneric,
  dexterity: AttributeGeneric,
  constitution: AttributeGeneric,
  wisdom: AttributeGeneric
} as const

export const AllAttributes = Schema.Struct(AttributeFields)
export type Attributes = typeof AllAttributes.Type
export const balancedAttributes: Attributes = {
  charisma: 10,
  constitution: 10,
  dexterity: 10,
  intelligence: 10,
  strength: 10,
  wisdom: 10
}

export const attributeCheckSucceeds = (
  attributes: Attributes,
  attribute: AttributeName,
  roll: number
): boolean =>
  Number.isInteger(roll) && roll >= 1 && roll <= attributes[attribute]

const rollD6 = Random.nextIntBetween(1, 7)

export const rollAttribute: Effect.Effect<number> = Effect.all([
  rollD6,
  rollD6,
  rollD6
]).pipe(Effect.map(([first, second, third]) => first + second + third))

export const rollAttributes: Effect.Effect<Attributes> = Effect.gen(
  function*() {
    const charisma = yield* rollAttribute
    const strength = yield* rollAttribute
    const intelligence = yield* rollAttribute
    const dexterity = yield* rollAttribute
    const constitution = yield* rollAttribute
    const wisdom = yield* rollAttribute

    return {
      charisma,
      constitution,
      dexterity,
      intelligence,
      strength,
      wisdom
    }
  }
)

export const rollAttributeCheck = (
  attributes: Attributes,
  attribute: AttributeName
): Effect.Effect<boolean> =>
  Random.nextIntBetween(1, 21).pipe(
    Effect.map((roll) =>
      attributeCheckSucceeds(attributes, attribute, roll)
    )
  )
export const AnyAttribute = Schema.Union(
  Schema.Struct({ charisma: AttributeGeneric }),
  Schema.Struct({ strength: AttributeGeneric }),
  Schema.Struct({ intelligence: AttributeGeneric }),
  Schema.Struct({ dexterity: AttributeGeneric }),
  Schema.Struct({ constitution: AttributeGeneric }),
  Schema.Struct({ wisdom: AttributeGeneric })
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
export const allStatusEffect = Confused
export const AnyStatusEffect = Schema.Union(Confused)

/** Properties:
Things that something either has or doesnt have and that are conferred or removed via some action. Immutable properties are not included
 */
export const Property = Schema.Boolean

export const Fixed = Schema.Struct({ fixed: Property }) // not able to be corroded or burned due to magic
export const Wet = Schema.Struct({ wet: Property })

export const AllProperties = Schema.Struct({
  fixed: Property,
  wet: Property
})
export const AnyProperty = Schema.Union(Fixed, Wet)

/** States that an item can be in.
There can be multiple phases in a state. And an item must be in one of each state at all times
 */
export const State = Schema.Literal
export const Phase = State("solid", "gas", "liquid")
export const BUC = State("blessed", "uncursed", "cursed")
export const PhaseState = Schema.Struct({ phase: Phase })
export const BUCState = Schema.Struct({ buc: BUC })
export const AllStates = Schema.Struct({
  phase: Phase,
  buc: BUC
})
export const AnyState = Schema.Union(PhaseState, BUCState)

/** things used to keep track of numerical state. Like hit points
We are currently keeping track of how much has been lost, the amount total is calculated based on other things
 */

export const Points = NonNegativeInteger
export const HitP = Schema.Struct({ dhp: Points }) // the amount of damage TAKEN
export const VrilP = Schema.Struct({ dvp: Points }) // the amount of magic LOST
export const HungerP = Schema.Struct({ dhunger: Points }) // the amount of hunger LOST
