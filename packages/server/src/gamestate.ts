import { GameState } from "@flaghack/domain/schemas"
import { get, modify } from "effect/HashMap"
import {
  filter,
  getOrElse,
  match as omatch,
  Option,
  some
} from "effect/Option"
import { Player } from "./creatures.js"
import { getKey } from "./entity.js"
import { Entity, isPlayer, World } from "./world.js"

export type GameState = typeof GameState.Type

export const worldFrom = (gs: GameState): World => gs.world

export const getPlayer = (gs: GameState): Option<Player> =>
  gs.world.pipe(
    get("player"),
    filter(isPlayer)
  )

export const updateWorld =
  (gs: GameState) => (fn: (w: World) => World): GameState => {
    const a = GameState.make({ world: fn(gs.world) }) // fixme
    return a
  }

const worldEntUp =
  <T extends Entity>(e: Option<T>) =>
  <R extends Entity>(fn: (e: Option<Entity>) => Option<R>) =>
  (w: World) =>
    omatch({
      onSome: (e: T) =>
        w.pipe(modify(getKey(e), (e) => getOrElse(fn(some(e)), () => e))),
      onNone: () => w
    })(e)

export const updateEntity =
  (gs: GameState) =>
  <T extends Entity>(e: Option<Entity>) =>
  <R extends Entity>(
    fn: (e: Option<Entity>) => Option<Entity>
  ): GameState => updateWorld(gs)(worldEntUp(e)(fn))
