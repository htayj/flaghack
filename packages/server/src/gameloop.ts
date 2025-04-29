import { Logger, LogLevel, pipe } from "effect"
import type { Effect } from "effect/Effect"
import {
  andThen,
  provide,
  runPromise,
  succeed,
  suspend,
  sync
} from "effect/Effect"
import { Map, Record } from "immutable"
import { filter, map } from "scala-ts/UndefOr.js"
import type { Action } from "./actions.js"
import { doAction } from "./actions.js"
import type { PlannedAction } from "./ai/ai.js"
import { allAiPlan } from "./ai/ai.js"
import { isCreature, isPlayer, player } from "./creatures.js"
import type { Player } from "./creatures.js"
import { getKey } from "./entity.js"
import { GameState, getPlayer } from "./gamestate.js"
import { noop } from "./util.js"
import { Entity, initWorld, World } from "./world.js"

const _log: Array<string> = []
const logger = Logger.make(({ message }) => {
  _log.push(`${message}`)
})
export const log = (...m: Array<string>) => {
  _log.unshift(m.join(" "))
}

const layer = Logger.replace(Logger.defaultLogger, logger)
const getLogs = suspend(() => succeed(_log))
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

const updateWorld = (gs: GameState) => (fn: (w: World) => World) =>
  gs.update("world", fn)

export const updateEntity =
  (gs: GameState) =>
  <T extends Entity>(e: T) =>
  <R extends Entity>(fn: (e: T) => R): GameState =>
    updateWorld(gs)((w: World) => w.update(getKey(e), (_) => map(e, fn)))

const executePlansSync = (gs: GameState) => (acts: Array<PlannedAction>) =>
  acts.reduce((acc, { action, entity }) => {
    log(`doing action: ${JSON.stringify(action)}`)
    return doAction(acc)(entity)(action)
  }, gs)

// advances the game loop
export const actPlayerAction = (action: Action): Effect<GameState> =>
  eWithGameState((gs) =>
    pipe(
      // figure out what the AI wants to do
      allAiPlan(gs),
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

export const apiGetLogs = () => pipe(getLogs, runPromise)
export const apiGetWorld = () => pipe(eGetWorld, runPromise)
export const apiDoPlayerAction = (action: Action) =>
  actPlayerAction(action).pipe(provide(layer)).pipe(runPromise)
