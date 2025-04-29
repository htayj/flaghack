import type { EntityPositioned } from "./entity.js"
import { genKey } from "./entity.js"
import type { Entity } from "./gameloop.js"

export type CreatureBase = EntityPositioned & {
  char: string
  name: string
  kind: "creature"
}
export type Player = CreatureBase & { type: "player" }
export type Hippie = CreatureBase & { type: "hippie" }
export type Creature = Player | Hippie

export const player = (x: number, y: number): Player => ({
  pos: { x, y },
  type: "player",
  char: "@",
  name: "you",
  kind: "creature",
  key: "player"
})
export const isCreature = (e: Entity): e is Creature =>
  e.kind === "creature"
export const isPlayer = (e: Entity): e is Player => e.type === "player"

export const hippie = (
  x: number,
  y: number,
  name: string = "Ian"
): Hippie => ({
  pos: { x, y },
  type: "hippie",
  char: "h",
  name,
  kind: "creature",
  key: genKey()
})

export const isHippie = (e: Entity): e is Hippie => e.type === "hippie"
