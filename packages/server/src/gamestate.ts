import { sync } from "effect/Effect"
import { Record } from "immutable"
import { filter, map } from "scala-ts/UndefOr.js"
import { Player, player } from "./creatures.js"
import { getKey } from "./entity.js"
import { Entity, isPlayer, World } from "./world.js"

export type GameState = Record<{
  world: World
}>

export const worldFrom = (gs: GameState) => sync(() => gs.get("world"))

export const getPlayer = (gs: GameState): Player =>
  (filter(gs.get("world").get("player"), isPlayer)
    ?? player(1, 2)) as Player // fixme

export const updateWorld = (gs: GameState) => (fn: (w: World) => World) =>
  gs.update("world", fn)
export const updateEntity =
  (gs: GameState) =>
  <T extends Entity>(e: T) =>
  <R extends Entity>(fn: (e: T) => R): GameState =>
    updateWorld(gs)((w: World) => w.update(getKey(e), (_) => map(e, fn)))
