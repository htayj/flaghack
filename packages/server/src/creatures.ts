import { AnyCreature, Hippie, Player } from "@flaghack/domain/schemas"
import { genKey } from "./util.js"

export type Player = typeof Player.Type
export type Hippie = typeof Hippie.Type
export type Creature = typeof AnyCreature.Type

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
