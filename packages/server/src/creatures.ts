import type {
  AcidKop as AcidKopSchema,
  AnyCreature as AnyCreatureSchema,
  Hippie as HippieSchema,
  Player as PlayerSchema
} from "@flaghack/domain/schemas"
import { genKey } from "./util.js"

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

export const hippie = (
  x: number,
  y: number,
  z: number,
  name: string = "Ian"
): Hippie => ({
  at: { x, y, z },
  in: "world",
  _tag: "hippie",
  name,
  key: genKey()
})

export const acidcop = (
  x: number,
  y: number,
  z: number,
  name?: string
): AcidKop => ({
  at: { x, y, z },
  in: "world",
  _tag: "acidcop",
  name,
  key: genKey()
})
