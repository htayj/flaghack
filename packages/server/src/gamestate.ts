import { GameState } from "@flaghack/domain/schemas"
import { get, modify } from "effect/HashMap"
import { getOrElse, match as omatch, Option, some } from "effect/Option"
import { filter } from "scala-ts/UndefOr.js"
import { Player, player } from "./creatures.js"
import { getKey } from "./entity.js"
import { Entity, isPlayer, World } from "./world.js"

export type GameState = typeof GameState.Type
// export type GameState = HashMap<
//   "world",
//   World
// >

export const worldFrom = (gs: GameState): World => gs.world

export const getPlayer = (gs: GameState): Player =>
  (filter(gs.world.pipe(get("player")), isPlayer)
    ?? player(1, 2)) as Player // fixme

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

// export const eUpdateEntity =
//   (gs: GameState) =>
//   <T extends Entity>(e: Option<Entity>) =>
//   <R extends Entity>(fn: Effect.Effect<Entity>): GameState =>
//     updateWorld(gs)(worldEntUp(e)(fn))
export const updateEntity =
  (gs: GameState) =>
  <T extends Entity>(e: Option<Entity>) =>
  <R extends Entity>(
    fn: (e: Option<Entity>) => Option<Entity>
  ): GameState => updateWorld(gs)(worldEntUp(e)(fn))

// (w: World) => w.pipe(modify(getKey(e), (_) => map(e, fn)))
// .update(getKey(e), (_) => map(e, fn)))
