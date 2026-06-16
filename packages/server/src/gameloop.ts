import { type Action, EAction, GameState } from "@flaghack/domain/schemas"
import { Effect, HashMap, Logger, LogLevel, pipe } from "effect"
import {
  andThen,
  log,
  provide,
  reduce,
  tap,
  withLogSpan
} from "effect/Effect"
import { filter } from "effect/HashMap"
import { match as omatch } from "effect/Option"
// import { Map, Record } from "immutable"
// import type { Verb } from "./actions.js"
import { doAction } from "./actions.js"
import type { PlannedAction } from "./ai/ai.js"
import { allAiPlan } from "./ai/ai.js"
import { player } from "./creatures.js"
import type { TKey } from "./entity.js"
import {
  getEntitiesAtEntity,
  getEntityById,
  getPlayer
} from "./gamestate.js"
import { GameStateStore } from "./GameStateStore.js"
import { logger } from "./log.js"
import type { TPos } from "./position.js"
import {
  CampgroundGenLevel,
  type Entity,
  isItem,
  type World
} from "./world.js"

type TGameState = typeof GameState.Type
const layer = Logger.replace(Logger.defaultLogger, logger)
export type Log = (a: string) => void

const campgroundSpawnAnchor: TPos = { x: 60, y: 24, z: 0 }

const spawnDistanceSquared = (entity: Entity): number =>
  (entity.at.x - campgroundSpawnAnchor.x) ** 2
  + (entity.at.y - campgroundSpawnAnchor.y) ** 2
  + (entity.at.z - campgroundSpawnAnchor.z) ** 2

const selectRequiredSpawnFloor = (world: World): Effect.Effect<TPos> => {
  const spawnFloor = Array.from(world.pipe(HashMap.values))
    .filter((entity) => entity._tag === "floor")
    .reduce<Entity | undefined>(
      (closest, candidate) =>
        closest === undefined
          || spawnDistanceSquared(candidate)
            < spawnDistanceSquared(closest)
          ? candidate
          : closest,
      undefined
    )

  return spawnFloor === undefined
    ? Effect.dieMessage(
      "Initial level generation produced no floor tiles; cannot place player"
    )
    : Effect.succeed(spawnFloor.at)
}

const makeInitialGameState: Effect.Effect<TGameState> = Effect.gen(
  function*() {
    const testLevel: World = yield* CampgroundGenLevel(777, 0).pipe(
      Effect.orDie
    )
    const testLevelPlayerLocation = yield* selectRequiredSpawnFloor(
      testLevel
    )

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

    return GameState.make({
      world: testLevelReady
    })
  }
)

export const DefaultGameStateStoreLive = GameStateStore.Default(
  makeInitialGameState
)

const eGetGameState = pipe(
  GameStateStore,
  andThen((store) => store.get)
)

const eWithGameState = (
  fn: (gs: TGameState) => Effect.Effect<TGameState>
) =>
  pipe(
    GameStateStore,
    andThen((store) =>
      store.modifyEffect((gs) =>
        pipe(
          Effect.succeed(gs),
          tap(() => log("gotgamestate")),
          andThen((gs) => fn(gs)),
          tap(() => log("altered gamestate")),
          tap(() => log("set gamestate")),
          andThen((nextGs) => Effect.succeed([undefined, nextGs] as const))
        )
      )
    ),
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

export const eGetWorld = pipe(
  eGetGameState,
  andThen((gs) => gs.world)
)
export const getInventory = (key: TKey) =>
  pipe(
    eGetWorld,
    andThen((w) => w.pipe(filter(isItem), filter((e) => e.in === key)))
  )

export const getPickupItemsFor = (key: TKey) =>
  pipe(
    eGetWorld,
    tap(() => log("doing get pickup")),
    andThen((w) =>
      omatch(getEntityById(key)(w), {
        onNone: () => HashMap.empty(),
        onSome: (entity) =>
          getEntitiesAtEntity(entity)(w).pipe(
            HashMap.filter(isItem),
            HashMap.filter((e) => e.key !== key)
          )
      })
    )
  )
