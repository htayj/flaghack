import { sync } from "effect/Effect"
import { Map, Record } from "immutable"
import { filter, map } from "scala-ts/UndefOr.js"
import { Player, player } from "./creatures.js"
import { isPlayer, World } from "./world.js"

export type GameState = Record<{
  world: World
}>

export const worldFrom = (gs: GameState) => sync(() => gs.get("world"))

export const getPlayer = (gs: GameState): Player =>
  (filter(gs.get("world").get("player"), isPlayer)
    ?? player(1, 2)) as Player // fixme
