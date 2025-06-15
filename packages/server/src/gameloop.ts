import { Array, HashMap, Logger, LogLevel, pipe } from "effect"
import type { Effect } from "effect/Effect"
import {
  andThen,
  catchTag,
  log,
  provide,
  reduce,
  succeed,
  suspend,
  withLogSpan
  // tap
} from "effect/Effect"
// import { Map, Record } from "immutable"
// import type { Verb } from "./actions.js"
import { Action, EAction, GameState } from "@flaghack/domain/schemas"
import { tap } from "effect/Effect"
import { filter } from "effect/HashMap"
import { match as omatch } from "effect/Option"
import { List } from "immutable"
import { doAction } from "./actions.js"
import type { PlannedAction } from "./ai/ai.js"
import { allAiPlan } from "./ai/ai.js"
import { Player, player } from "./creatures.js"
import { TKey } from "./entity.js"
import {
  getEntitiesAtEntity,
  getEntityById,
  getPlayer
} from "./gamestate.js"
import { logger } from "./log.js"
import { noop } from "./util.js"
import { BSPGenLevel, initWorld, World } from "./world.js"

type TGameState = typeof GameState.Type
const layer = Logger.replace(Logger.defaultLogger, logger)
export type Log = (a: string) => void

// const _state: { gameState: TGameState; log: (s: string) => void } = {
//   gameState: GameState.make({
//     world: HashMap.fromIterable(
//       initWorld.map((e) => [e.key, e])
//     )
//   }),
//   log: noop
// }
const testLevel: World = BSPGenLevel(777, 0)
const testLevelFloors = List(
  testLevel.pipe(HashMap.filter((e) => e._tag === "floor"), HashMap.values)
)
// const testLevelPlayerLocation = testLevelFloors.get(Math.random()*testLevelFloors.size-1)
const testLevelPlayerLocation = testLevelFloors.first()?.at
  ?? { x: 0, y: 0, z: 0 }

const testPlayer = player(
  testLevelPlayerLocation.x,
  testLevelPlayerLocation.y,
  testLevelPlayerLocation.z
)
const testLevelPlayer: World = HashMap.fromIterable([[
  "player",
  testPlayer
]])
const testLevelReady: World = testLevelPlayer.pipe(
  HashMap.union(testLevel)
)
const _state: { gameState: TGameState; log: (s: string) => void } = {
  gameState: GameState.make({
    world: testLevelReady
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

const executePlans = (gs: TGameState) => (acts: Array<PlannedAction>) =>
  reduce(acts, gs, (acc, curr) => doAction(acc, curr))

// advances the game loop
export const actPlayerAction = (
  action: Action
) =>
  eWithGameState((gs) =>
    pipe(
      // figure out what the AI wants to do
      allAiPlan(gs),
      tap(() => log("planned ai actions")),
      // also append the player's plans
      andThen((w) =>
        omatch(
          getPlayer(gs),
          {
            onNone: () => w, // todo: throw some kind of error, this isnt right
            onSome: (player) =>
              w.concat({
                entity: player,
                action
              })
          }
        )
      ),
      tap(() => log("added player action ", action)),
      andThen((plannedActions) =>
        plannedActions.filter((pa) => !EAction.$is("noop")(pa.action))
      ), // todo: change the filter to Option.reduceCompact once everything is options
      tap((actions) => log("filtered noops for a result of : ", actions)),
      // execute the plans
      andThen(executePlans(gs)),
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

export const getPickupItemsFor = (key: TKey) =>
  pipe(
    eGetWorld,
    tap(() => log("doing get pickup")),
    andThen((w) =>
      pipe(
        succeed(w),
        andThen(getEntityById(key)),
        andThen((e) => getEntitiesAtEntity(e)(w)),
        andThen(pipe(HashMap.filter((e) => e.key !== key)))
      )
    ),
    catchTag("NoSuchElementException", () => succeed(HashMap.empty()))
  )
