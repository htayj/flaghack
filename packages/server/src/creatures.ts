import type {
  AcidKop as AcidKopSchema,
  AnyCreature as AnyCreatureSchema,
  Hippie as HippieSchema,
  Player as PlayerSchema
} from "@flaghack/domain/schemas"
import { Effect } from "effect"
import { KeyGenerator } from "./keyGenerator.js"

export type Player = typeof PlayerSchema.Type
export type Hippie = typeof HippieSchema.Type
export type AcidKop = typeof AcidKopSchema.Type
export type Creature = typeof AnyCreatureSchema.Type

export const player = (x: number, y: number, z: number): Player => ({
  at: { x, y, z },
  in: "world",
  _tag: "player",
  name: "you",
  key: "player"
})

export const makeHippie = (
  key: string,
  x: number,
  y: number,
  z: number,
  name: string = "Ian"
): Hippie => ({
  at: { x, y, z },
  in: "world",
  _tag: "hippie",
  name,
  key
})

export const makeAcidcop = (
  key: string,
  x: number,
  y: number,
  z: number,
  name?: string
): AcidKop => ({
  at: { x, y, z },
  in: "world",
  _tag: "acidcop",
  name,
  key
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

    return makeHippie(key, x, y, z, name)
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

    return makeAcidcop(key, x, y, z, name)
  })
