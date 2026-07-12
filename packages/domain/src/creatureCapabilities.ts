import type { AnyCreature as AnyCreatureSchema } from "./schemas.js"

type SchemaCreatureTag = typeof AnyCreatureSchema.Type["_tag"]

export const CREATURE_TAGS = [
  "player",
  "ranger",
  "hippie",
  "wook",
  "acidcop",
  "lesser_egregore",
  "greater_egregore",
  "collective_egregore"
] as const satisfies ReadonlyArray<SchemaCreatureTag>

export type CreatureTag = typeof CREATURE_TAGS[number]

export type CreatureCapability = number

export const HAVE_BRAIN = 1 << 0
export const HAS_EYES = 1 << 1
export const HAS_HANDS = 1 << 2
export const HUMANOID = 1 << 3
export const KOP = 1 << 4
export const EGREGORE = 1 << 5
export const MINDLESS = 1 << 6

const HUMANLIKE_CAPABILITIES = HAVE_BRAIN | HAS_EYES | HAS_HANDS | HUMANOID
const EGREGORE_CAPABILITIES = HAS_EYES | EGREGORE | MINDLESS

export const creatureCapabilityMaskByTag = {
  player: HUMANLIKE_CAPABILITIES,
  ranger: HUMANLIKE_CAPABILITIES,
  hippie: HUMANLIKE_CAPABILITIES,
  wook: HUMANLIKE_CAPABILITIES,
  acidcop: HUMANLIKE_CAPABILITIES | KOP,
  lesser_egregore: EGREGORE_CAPABILITIES,
  greater_egregore: EGREGORE_CAPABILITIES,
  collective_egregore: EGREGORE_CAPABILITIES
} as const satisfies Record<SchemaCreatureTag, number>

export const isCreatureTag = (tag: string): tag is CreatureTag =>
  Object.prototype.hasOwnProperty.call(creatureCapabilityMaskByTag, tag)

const tagFrom = (
  tagOrCreature: string | { readonly _tag: string }
): string =>
  typeof tagOrCreature === "string" ? tagOrCreature : tagOrCreature._tag

export const creatureCapabilityMask = (
  tagOrCreature: string | { readonly _tag: string }
): CreatureCapability => {
  const tag = tagFrom(tagOrCreature)
  return isCreatureTag(tag) ? creatureCapabilityMaskByTag[tag] : 0
}

export const hasCreatureCapability = (
  tagOrCreature: string | { readonly _tag: string },
  capability: CreatureCapability
): boolean => (creatureCapabilityMask(tagOrCreature) & capability) !== 0

export const hasAllCreatureCapabilities = (
  tagOrCreature: string | { readonly _tag: string },
  capabilities: CreatureCapability
): boolean =>
  (creatureCapabilityMask(tagOrCreature) & capabilities) === capabilities
