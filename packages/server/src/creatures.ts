import {
  Creature,
  CreatureBase,
  Hippie,
  Player
} from "./schemas/schemas.js"
import { genKey } from "./util.js"

export type CreatureBase = typeof CreatureBase.Type
//   char: string
//   name: string
//   kind: "creature"
// }
export type Player = typeof Player.Type
export type Hippie = typeof Hippie.Type
export type Creature = typeof Creature.Type

export const player = (x: number, y: number): Player => ({
  loc: { at: { x, y } },
  type: "player",
  _tag: "player",
  name: "you",
  kind: "creature",
  key: "player"
})

export const hippie = (
  x: number,
  y: number,
  name: string = "Ian"
): Hippie => ({
  loc: { at: { x, y } },
  type: "hippie",
  _tag: "hippie",
  name,
  kind: "creature",
  key: genKey()
})
