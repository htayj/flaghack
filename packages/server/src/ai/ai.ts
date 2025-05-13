import { Action, EAction } from "@flaghack/domain/schemas"
import { HashMap, Match, pipe } from "effect"
import type { Effect } from "effect/Effect"
import {
  all,
  andThen,
  log,
  promise,
  succeed,
  tap,
  withLogSpan
} from "effect/Effect"
import { map, values } from "effect/HashMap"
import type { Creature } from "../creatures.js"
import { GameState, worldFrom } from "../gamestate.js"
import { Entity } from "../world.js"

// class ErrPlayerAi extends Data.TaggedError("ErrPlayerAi") {}

export type PlannedAction = { entity: Entity; action: Action }

// export const distanceStupid = (a: Entity, b: Entity): TPos => ({
//   x: a.at.x - b.at.x,
//   y: a.at.y - b.at.y,
//   z: a.at.z - b.at.z
// })
// export const sortByDistance = (a: Entity) => (b: Entity[]) =>
//   Array.sortBy((t) => distanceStupid(a, t))

const hippieAi = (_: GameState) => (e: Creature): Action => {
  if (e.at.y < 15 && e.at.x == 50) return EAction.move({ dir: "S" })
  if (e.at.y == 15 && e.at.x < 70) return EAction.move({ dir: "E" })
  if (e.at.y > 5 && e.at.x == 70) return EAction.move({ dir: "N" })
  if (e.at.y == 5 && e.at.x > 50) return EAction.move({ dir: "W" })
  else return EAction.noop()
}
const acidCopAi = (_: GameState) => (e: Creature): Action => {
  // gs.world.pipe(HashMap.filter((e) => e._tag === "flag"), sortByDistance)
  if (e.at.y < 15 && e.at.x == 50) return EAction.move({ dir: "S" })
  if (e.at.y == 15 && e.at.x < 70) return EAction.move({ dir: "E" })
  if (e.at.y > 5 && e.at.x == 70) return EAction.move({ dir: "N" })
  if (e.at.y == 5 && e.at.x > 50) return EAction.move({ dir: "W" })
  else return EAction.noop()
}
const noAi = (_: GameState) => (_: Entity): Action => (EAction.noop())

const ai = (gs: GameState) =>
  Match.type<Entity>().pipe(
    Match.tag("hippie", hippieAi(gs)),
    Match.tag("acidcop", acidCopAi(gs)),
    Match.orElse(noAi(gs))
  )

const eAi = (gs: GameState) => (e: Entity) =>
  promise(async () => ({ entity: e, action: ai(gs)(e) }))
const planAllAi =
  (gs: GameState) => (w: HashMap.HashMap<string, Entity>) =>
    w.pipe(map((e) => eAi(gs)(e)), values)
export const allAiPlan = (gs: GameState): Effect<Array<PlannedAction>> =>
  pipe(
    succeed(gs),
    tap(() => log("planning ai for world")),
    andThen(worldFrom),
    tap(() => log("narrowed to creatures")),
    andThen(planAllAi(gs)),
    tap(() => log("setup planned all ai")),
    andThen(all), // todo: set concurrency
    tap(() => log("executed planning all ai")),
    withLogSpan(`planning`)
  )
