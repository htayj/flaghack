import { type Action, EAction } from "@flaghack/domain/schemas"
import { Match, Option, pipe } from "effect"
import type { Effect } from "effect/Effect"
import {
  all,
  andThen,
  log,
  succeed,
  tap,
  withLogSpan
} from "effect/Effect"
import type { HashMap } from "effect/HashMap"
import { filter, map, values } from "effect/HashMap"
import type { Creature } from "../creatures.js"
import type { GameState } from "../gamestate.js"
import type { Entity, World } from "../world.js"

// class ErrPlayerAi extends Data.TaggedError("ErrPlayerAi") {}

export type PlannedAction = { entity: Entity; action: Action }

type NonPlayerCreature = Exclude<Creature, { readonly _tag: "player" }>

const creatureTags = new Set<Entity["_tag"]>([
  "player",
  "ranger",
  "hippie",
  "wook",
  "acidcop",
  "lesser_egregore",
  "greater_egregore",
  "collective_egregore"
])
const isNonPlayerCreature = (e: Entity): e is NonPlayerCreature =>
  e._tag !== "player" && creatureTags.has(e._tag)
const nonPlayerCreaturesFrom = (w: HashMap<string, Entity>) =>
  w.pipe(filter(isNonPlayerCreature))

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
const noAi =
  (_: GameState) => (_: NonPlayerCreature): Action => (EAction.noop())

const ai = (gs: GameState) =>
  Match.type<NonPlayerCreature>().pipe(
    Match.tag("hippie", hippieAi(gs)),
    Match.tag("acidcop", acidCopAi(gs)),
    Match.orElse(noAi(gs))
  )

export const planOneAi = (
  gs: GameState,
  entity: Entity
): Option.Option<PlannedAction> =>
  isNonPlayerCreature(entity)
    ? Option.some({ entity, action: ai(gs)(entity) })
    : Option.none()

const eAi = (gs: GameState) => (e: NonPlayerCreature) =>
  succeed({ entity: e, action: ai(gs)(e) })
const planAllAi =
  (gs: GameState) => (w: HashMap<string, NonPlayerCreature>) =>
    w.pipe(map((e) => eAi(gs)(e)), values)
export const allAiPlan = (
  gs: GameState,
  planningWorld: World = gs.world
): Effect<Array<PlannedAction>> =>
  pipe(
    succeed(planningWorld),
    tap(() => log("planning ai for world")),
    andThen(nonPlayerCreaturesFrom),
    tap(() => log("narrowed to non-player creatures")),
    andThen(planAllAi(gs)),
    tap(() => log("setup planned all ai")),
    andThen((plannedEffects) => all(plannedEffects, { concurrency: 1 })),
    tap(() => log("executed planning all ai")),
    withLogSpan(`planning`)
  )
