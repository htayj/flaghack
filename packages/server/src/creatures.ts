import type {
  AcidKop as AcidKopSchema,
  AnyCreature as AnyCreatureSchema,
  Hippie as HippieSchema,
  Player as PlayerSchema,
  Ranger as RangerSchema
} from "@flaghack/domain/schemas"
import {
  type Attributes,
  balancedAttributes,
  rollAttributes
} from "@flaghack/domain/stats"
import { Effect } from "effect"
import { KeyGenerator } from "./keyGenerator.js"

export type Player = typeof PlayerSchema.Type
export type Ranger = typeof RangerSchema.Type
export type Hippie = typeof HippieSchema.Type
export type AcidKop = typeof AcidKopSchema.Type
export type Creature = typeof AnyCreatureSchema.Type

export const campgroundHumanDisplayNames = [
  "Alex",
  "Dusty",
  "Maya",
  "Sparkle Pony",
  "River",
  "Moonbeam",
  "Jordan",
  "Captain Snacks",
  "Sam",
  "Glitterbug",
  "Taylor",
  "Pickle",
  "Casey",
  "Sunshine",
  "Morgan",
  "Firefly"
] as const

export const player = (
  x: number,
  y: number,
  z: number,
  attributes: Attributes = balancedAttributes
): Player => ({
  at: { x, y, z },
  attributes,
  in: "world",
  _tag: "player",
  name: "you",
  key: "player"
})

export const rolledPlayer = (
  x: number,
  y: number,
  z: number
): Effect.Effect<Player> =>
  rollAttributes.pipe(
    Effect.map((attributes) => player(x, y, z, attributes))
  )

export const makeHippie = (
  key: string,
  x: number,
  y: number,
  z: number,
  name: string = "Ian",
  attributes: Attributes = balancedAttributes
): Hippie => ({
  at: { x, y, z },
  attributes,
  in: "world",
  _tag: "hippie",
  name,
  key
})

export const makeRanger = (
  key: string,
  x: number,
  y: number,
  z: number,
  name: string,
  attributes: Attributes = balancedAttributes
): Ranger => ({
  at: { x, y, z },
  attributes,
  in: "world",
  _tag: "ranger",
  name,
  key
})

export const makeAcidcop = (
  key: string,
  x: number,
  y: number,
  z: number,
  name?: string,
  attributes: Attributes = balancedAttributes
): AcidKop => ({
  at: { x, y, z },
  attributes,
  in: "world",
  _tag: "acidcop",
  key,
  ...(name === undefined ? {} : { name })
})

export const hippie = (
  x: number,
  y: number,
  z: number,
  name: string = "Ian"
): Effect.Effect<Hippie, never, KeyGenerator> =>
  Effect.gen(function*() {
    const keyGenerator = yield* KeyGenerator
    const key = yield* keyGenerator.nextKey

    const attributes = yield* rollAttributes

    return makeHippie(key, x, y, z, name, attributes)
  })

export const ranger = (
  x: number,
  y: number,
  z: number,
  name: string
): Effect.Effect<Ranger, never, KeyGenerator> =>
  Effect.gen(function*() {
    const keyGenerator = yield* KeyGenerator
    const key = yield* keyGenerator.nextKey

    const attributes = yield* rollAttributes

    return makeRanger(key, x, y, z, name, attributes)
  })

export const acidcop = (
  x: number,
  y: number,
  z: number,
  name?: string
): Effect.Effect<AcidKop, never, KeyGenerator> =>
  Effect.gen(function*() {
    const keyGenerator = yield* KeyGenerator
    const key = yield* keyGenerator.nextKey

    const attributes = yield* rollAttributes

    return makeAcidcop(key, x, y, z, name, attributes)
  })
