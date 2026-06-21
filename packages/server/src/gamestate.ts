import type { GameState as GameStateSchema } from "@flaghack/domain/schemas"
import { filter as hfilter, get, modify } from "effect/HashMap"
import {
  filter,
  getOrElse,
  match as omatch,
  none,
  type Option,
  some
} from "effect/Option"
import type { Player } from "./creatures.js"
import { getKey, type TKey } from "./entity.js"
import { collideP, type TPos } from "./position.js"
import { type Entity, isPlayer, type World } from "./world.js"

export type GameState = typeof GameStateSchema.Type

export const worldFrom = (gs: GameState): World => gs.world

export const getPlayer = (gs: GameState): Option<Player> =>
  gs.world.pipe(
    get("player"),
    filter(isPlayer)
  )
export const getEntityById =
  (id: TKey) => (world: World): Option<Entity> =>
    world.pipe(
      get(id)
    )
export const getLocationOf = (e: Entity): Option<TPos> =>
  e.in === "world" ? some(e.at) : none()

export const collideE = (a: Entity) => (b: Entity) =>
  collideP(a.at, a.in)(b.at, b.in)
export const getEntitiesAtEntity = (a: Entity) => (w: World): World =>
  w.pipe(
    hfilter((e) => collideE(a)(e))
  )

export const updateWorld =
  (gs: GameState) => (fn: (w: World) => World): GameState => ({
    ...gs,
    world: fn(gs.world)
  })

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
  <_T extends Entity>(e: Option<Entity>) =>
  <_R extends Entity>(
    fn: (e: Option<Entity>) => Option<Entity>
  ): GameState => updateWorld(gs)(worldEntUp(e)(fn))
