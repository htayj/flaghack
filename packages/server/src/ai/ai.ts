import { Match, pipe } from "effect"
import type { Effect } from "effect/Effect"
import { all, andThen, promise, succeed } from "effect/Effect"
import { Action } from "../actions.js"
import type { Creature, Player } from "../creatures.js"
import { GameState, worldFrom } from "../gamestate.js"
import { isHippie, isPlayer } from "../world.js"
import { creaturesFrom, notPlayerFrom } from "../world.js"

// class ErrPlayerAi extends Data.TaggedError("ErrPlayerAi") {}

export type PlannedAction = { entity: Creature; action: Action }
const hippieAi = (_: GameState) => (e: Creature) => {
  if (e.at.y < 15 && e.at.x == 50) return Action.moveDown
  if (e.at.y == 15 && e.at.x < 70) return Action.moveRight
  if (e.at.y > 5 && e.at.x == 70) return Action.moveUp
  if (e.at.y == 5 && e.at.x > 50) return Action.moveLeft
  else return Action.noop
}
const playerAi = (_: GameState) => (_: Player) => Action.noop

const ai = (gs: GameState) =>
  Match.type<Creature>().pipe(
    Match.when(isHippie, hippieAi(gs)),
    Match.when(isPlayer, playerAi(gs)),
    Match.orElse(hippieAi(gs))
  )

const eAi = (gs: GameState) => (e: Creature) =>
  promise(async () => ({ entity: e, action: ai(gs)(e) }))
export const allAiPlan = (gs: GameState): Effect<Array<PlannedAction>> =>
  pipe(
    succeed(gs),
    andThen(worldFrom),
    andThen(notPlayerFrom),
    andThen(creaturesFrom),
    andThen((w) => w.map((e) => eAi(gs)(e))),
    andThen((w) => w.valueSeq().toArray()),
    andThen(all) // todo: set concurrency
  )
