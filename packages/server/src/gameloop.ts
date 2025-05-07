import { HashMap, Logger, LogLevel, pipe } from "effect"
import type { Effect } from "effect/Effect"
import {
  andThen,
  log,
  provide,
  runPromise,
  succeed,
  suspend,
  sync,
  withLogSpan
  // tap
} from "effect/Effect"
// import { Map, Record } from "immutable"
// import type { Verb } from "./actions.js"
import { Action, EAction, GameState } from "@flaghack/domain/schemas"
import { tap } from "effect/Effect"
import { filter } from "effect/HashMap"
import { doAction } from "./actions.js"
import type { PlannedAction } from "./ai/ai.js"
import { allAiPlan } from "./ai/ai.js"
import { player } from "./creatures.js"
import { TKey } from "./entity.js"
import { getPlayer } from "./gamestate.js"
import { getLogs, logger } from "./log.js"
import { noop } from "./util.js"
import { initWorld } from "./world.js"

type TGameState = typeof GameState.Type
const layer = Logger.replace(Logger.defaultLogger, logger)
export type Log = (a: string) => void

const _state: { gameState: TGameState; log: (s: string) => void } = {
  gameState: GameState.make({
    world: HashMap.fromIterable(
      initWorld.map((e) => [e.key, e])
    )
  }),
  log: noop
}

const setGameState = (s: TGameState): void => {
  _state.gameState = s
}

const eWithGameState = (fn: (gs: TGameState) => Effect<TGameState>) =>
  pipe(
    eGetGameState,
    tap(() => log("gotgamestate")),
    andThen((gs) => fn(gs)),
    tap(() => log("altered gamestate")),
    andThen((gs) => eSetGameState(gs)),
    tap(() => log("set gamestate")),
    andThen(() => eGetGameState),
    tap(() => log("finished with gamestate")),
    Logger.withMinimumLogLevel(LogLevel.Debug),
    provide(layer),
    withLogSpan("with.gs")
  )

const executePlansSync =
  (gs: TGameState) => (acts: Array<PlannedAction>) =>
    sync(() =>
      acts.reduce((acc, { action, entity }) => {
        return doAction(acc)(entity)(action)
      }, gs)
    )

// advances the game loop
export const eActPlayerAction = (gs: TGameState) =>
(
  action: Action
): Effect<TGameState> =>
  pipe(
    // figure out what the AI wants to do
    allAiPlan(gs),
    // tap(() => log("ai planned:: gs:", gs)),
    // also append the player's plans
    andThen((w) =>
      w.concat({
        entity: getPlayer(gs) ?? player(0, 0),
        action
      })
    ),
    // execute the plans
    andThen(executePlansSync(gs))
  )
export const actPlayerAction = (
  action: Action
): Effect<TGameState> =>
  eWithGameState((gs) =>
    pipe(
      // figure out what the AI wants to do
      allAiPlan(gs),
      tap(() => log("planned ai actions")),
      // also append the player's plans
      andThen((w) =>
        w.concat({
          entity: getPlayer(gs) ?? player(0, 0),
          action
        })
      ),
      tap(() => log("added player action ", action)),
      // execute the plans
      andThen((plannedActions) =>
        plannedActions.filter((pa) => !EAction.$is("noop")(pa.action))
      ),
      tap((actions) => log("filtered noops for a result of : ", actions)),
      andThen(executePlansSync(gs)),
      tap(() => log("finished action")),
      withLogSpan(`playeract.${action._tag}`)
    )
  )

const eGetGameState = suspend(() => succeed(_state.gameState))
const eSetGameState = (gs: TGameState) =>
  suspend(() => succeed(setGameState(gs)))

export const eGetWorld = pipe(
  eGetGameState,
  andThen((gs) => gs.world)
)
export const getInventory = (key: TKey) =>
  pipe(
    eGetWorld,
    andThen((w) => w.pipe(filter((e) => e.in === key)))
  )

export const apiGetLogs = () => pipe(getLogs, runPromise)
export const apiGetWorld = () => pipe(eGetWorld, runPromise)
export const apiDoPlayerAction = (action: Action) =>
  actPlayerAction(action).pipe(provide(layer)).pipe(runPromise)
export const apiGetInventory = () =>
  pipe(getInventory("player"), runPromise)
