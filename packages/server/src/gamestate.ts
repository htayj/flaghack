// import { HashMap } from "effect/HashMap"
import { GameState } from "@flaghack/domain/schemas"
import * as assert from "assert"
import { filter as hfilter, get, modify } from "effect/HashMap"
import { replace, set } from "effect/Record"
import { filter } from "scala-ts/UndefOr.js"
import { Player, player } from "./creatures.js"
import { getKey } from "./entity.js"
import { log } from "./log.js"
import { creaturesFrom, Entity, isPlayer, World } from "./world.js"

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
    // log("updating world:: player: ", w.pipe())
    // const a = replace("world", fn(gs.world))(gs) //as GameState // fixme
    const a = GameState.make({ world: fn(gs.world) })
    return a
  }

const worldEntUp =
  <T extends Entity>(e: Entity) =>
  <R extends Entity>(fn: (e: Entity) => R) =>
  (w: World) => {
    log(`updating entity: ${JSON.stringify(e)} `)
    const newworld = w.pipe(modify(getKey(e), (e) => fn(e)))
    log(
      `updated world for that entity: ${
        creaturesFrom(newworld).pipe(hfilter((e) => e.key === "player"))
      } `
    )
    log(`what it should have been: ${JSON.stringify(fn(e))} `)
    return newworld
  }

export const updateEntity =
  (gs: GameState) =>
  <T extends Entity>(e: Entity) =>
  <R extends Entity>(fn: (e: Entity) => Entity): GameState =>
    updateWorld(gs)(worldEntUp(e)(fn))

// (w: World) => w.pipe(modify(getKey(e), (_) => map(e, fn)))
// .update(getKey(e), (_) => map(e, fn)))
