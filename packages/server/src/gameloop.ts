import { Logger, LogLevel, pipe } from "effect"
import type { Effect } from "effect/Effect"
import {
  andThen,
  provide,
  runPromise,
  succeed,
  suspend
  // tap
} from "effect/Effect"
import { Map, Record } from "immutable"
// import type { Verb } from "./actions.js"
import { doAction } from "./actions.js"
import type { PlannedAction } from "./ai/ai.js"
import { allAiPlan } from "./ai/ai.js"
import { player } from "./creatures.js"
import { TKey } from "./entity.js"
import { GameState, getPlayer } from "./gamestate.js"
import { getLogs, log, logger } from "./log.js"
import { Action } from "./schemas/schemas.js"
import { noop } from "./util.js"
import { Entity, initWorld } from "./world.js"

const layer = Logger.replace(Logger.defaultLogger, logger)
export type Log = (a: string) => void

const _state: { gameState: GameState; log: (s: string) => void } = {
  gameState: Record({
    world: Map<string, Entity>(
      Object.fromEntries(initWorld.map((e) => [e.key, e]))
    )
  })(),
  log: noop
}

const setGameState = (s: GameState): void => {
  _state.gameState = s
}

const eWithGameState = (fn: (gs: GameState) => Effect<GameState>) =>
  pipe(
    eGetGameState,
    andThen((gs) => fn(gs)),
    andThen((gs) => eSetGameState(gs)),
    andThen(() => eGetGameState),
    Logger.withMinimumLogLevel(LogLevel.Debug),
    provide(layer)
  )

const executePlansSync = (gs: GameState) => (acts: Array<PlannedAction>) =>
  acts.reduce((acc, { action, entity }) => {
    log(`doing action: ${JSON.stringify(action)}`)
    return doAction(acc)(entity)(action)
  }, gs)

// advances the game loop
export const actPlayerAction = (
  action: Action
): Effect<GameState> =>
  eWithGameState((gs) =>
    pipe(
      // figure out what the AI wants to do
      allAiPlan(gs),
      // tap(() =>
      //   log(`gs: ${
      //     JSON.stringify(gs.get("world").filter((e) => e.key === "player"))
      //   }`)
      // ),
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
  )

const eGetGameState = suspend(() => succeed(_state.gameState))
const eSetGameState = (gs: GameState) =>
  suspend(() => succeed(setGameState(gs)))

const eGetWorld = pipe(
  eGetGameState,
  andThen((gs) => gs.get("world"))
)
const getInventory = (key: TKey) =>
  pipe(
    eGetWorld,
    andThen((w) => w.filter((e) => e.in === key))
  )

export const apiGetLogs = () => pipe(getLogs, runPromise)
export const apiGetWorld = () => pipe(eGetWorld, runPromise)
export const apiDoPlayerAction = (action: Action) =>
  actPlayerAction(action).pipe(provide(layer)).pipe(runPromise)
export const apiGetInventory = () =>
  pipe(getInventory("player"), runPromise)
