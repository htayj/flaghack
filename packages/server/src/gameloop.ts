import type { RoleId } from "@flaghack/domain/roles"
import {
  type Action,
  EAction,
  GameState,
  type ItemCollection
} from "@flaghack/domain/schemas"
import { Cache, Effect, HashMap, Logger, LogLevel, pipe } from "effect"
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
import {
  type ActiveRegionBounds,
  type CampgroundActiveRegion,
  campgroundActiveRegionForWorld,
  campgroundStaticMetadata,
  filterWorldToBounds,
  syncEntityIntoBoundedWorld
} from "./activeRegion.js"
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
import {
  applyLazyOffscreenStep,
  DEFAULT_LAZY_OFFSCREEN_OPTIONS
} from "./offscreen.js"
import { makePerfTraceId, measureEffect } from "./perf.js"
import type { TPos } from "./position.js"
import {
  availableRoles,
  confirmSetupForGameState,
  initialSetupState,
  selectRoleForGameState,
  setupIsComplete,
  setupStateFor
} from "./setup.js"
import { makeDoor, makeFloor } from "./terrain.js"
import {
  CampgroundGenLevel,
  campgroundReservedTravelCorridorCoordinates,
  containersAt,
  type Entity,
  isItem,
  type World
} from "./world.js"

type TGameState = typeof GameState.Type
type TItemCollection = typeof ItemCollection.Type
const layer = Logger.replace(Logger.defaultLogger, logger)
export type Log = (a: string) => void

const campgroundReservedTravelStart =
  campgroundReservedTravelCorridorCoordinates()[0]
const campgroundSpawnAnchor: TPos = {
  x: campgroundReservedTravelStart?.x ?? 96,
  y: campgroundReservedTravelStart?.y ?? 120,
  z: 0
}

const spawnDistanceSquared = (entity: Entity): number =>
  (entity.at.x - campgroundSpawnAnchor.x) ** 2
  + (entity.at.y - campgroundSpawnAnchor.y) ** 2
  + (entity.at.z - campgroundSpawnAnchor.z) ** 2

const doorFixtureRequested = (): boolean =>
  process.env.FLAGHACK_GAME_FIXTURE === "door"
  || process.env.FLAGHACK_DOOR_FIXTURE === "1"

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
    if (doorFixtureRequested()) {
      return yield* makeDoorFixtureGameState()
    }

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
      setup: initialSetupState,
      world: testLevelReady
    })
  }
)

const makeDoorFixtureGameState = (): Effect.Effect<TGameState> =>
  Effect.sync(() => {
    const testPlayer = player(0, 0, 0)
    const entities: Array<Entity> = [
      testPlayer,
      makeFloor("door-fixture-floor-0", 0, 0, 0),
      makeFloor("door-fixture-floor-1", 1, 0, 0),
      makeFloor("door-fixture-floor-2", 2, 0, 0),
      makeDoor("door-fixture-door-1", 1, 0, 0, false, "vertical")
    ]

    return GameState.make({
      setup: { phase: "complete" },
      world: HashMap.fromIterable(entities.map((entity) =>
        [
          entity.key,
          entity
        ] as const
      ))
    })
  })

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

type ExecutePlansContext = {
  readonly movementWorld?: World | undefined
  readonly movementBounds?: ActiveRegionBounds | undefined
}

type ExecutePlansAccumulator = {
  readonly state: TGameState
  readonly movementWorld: World | undefined
}

const executePlans = (
  gs: TGameState,
  traceId?: string,
  context: ExecutePlansContext = {}
) =>
(acts: Array<PlannedAction>) => {
  let actionIndex = 0
  const initialAccumulator: ExecutePlansAccumulator = {
    movementWorld: context.movementWorld,
    state: gs
  }
  return reduce(acts, initialAccumulator, (acc, curr) => {
    const currentActionIndex = actionIndex
    actionIndex += 1
    const effect = doAction(acc.state, curr, {
      movementWorld: acc.movementWorld
    })
    const measuredEffect = traceId === undefined
      ? effect
      : measureEffect(
        {
          counts: (nextGs) => ({
            actionIndex: currentActionIndex,
            movementWorldSize: acc.movementWorld === undefined
              ? HashMap.size(acc.state.world)
              : HashMap.size(acc.movementWorld),
            nextWorldSize: HashMap.size(nextGs.world)
          }),
          operation: "backend.turn",
          phase: "doAction",
          traceId
        },
        effect
      )

    return Effect.map(measuredEffect, (nextState) => ({
      movementWorld: acc.movementWorld === undefined
          || context.movementBounds === undefined
        ? acc.movementWorld
        : syncEntityIntoBoundedWorld(
          acc.movementWorld,
          context.movementBounds,
          curr.entity.key,
          nextState.world
        ),
      state: nextState
    }))
  }).pipe(Effect.map((acc) => acc.state))
}

const turnMeasureOptions = (
  action: Action,
  traceId: string,
  phase: string
) => ({
  counts: { actionTag: action._tag },
  operation: "backend.turn",
  phase,
  traceId
} as const)

const appendPlayerAction = (
  gs: TGameState,
  action: Action
) =>
(plannedActions: Array<PlannedAction>) =>
  omatch(
    getPlayer(gs),
    {
      onNone: () => plannedActions, // todo: throw some kind of error, this isnt right
      onSome: (player) =>
        plannedActions.concat({
          entity: player,
          action
        })
    }
  )

const campgroundStaticMetadataCache = Effect.runSync(
  Cache.make({
    capacity: 8,
    lookup: (_z: number) => Effect.succeed(campgroundStaticMetadata()),
    timeToLive: "1 hour"
  })
)

const activeRegionForGameState = (
  gs: TGameState
): Effect.Effect<CampgroundActiveRegion | undefined> =>
  omatch(getPlayer(gs), {
    onNone: () =>
      Effect.succeed(undefined as CampgroundActiveRegion | undefined),
    onSome: (player) =>
      campgroundStaticMetadataCache.get(player.at.z).pipe(
        Effect.map((metadata) =>
          campgroundActiveRegionForWorld(gs.world, player, metadata)
        )
      )
  })

// advances the game loop
export const actPlayerAction = (
  action: Action
) => {
  const traceId = makePerfTraceId(`turn.${action._tag}`)
  return measureEffect(
    turnMeasureOptions(action, traceId, "total"),
    measureEffect(
      turnMeasureOptions(action, traceId, "state.modifyEffect"),
      eWithGameState((gs) =>
        Effect.gen(function*() {
          if (!setupIsComplete(gs)) {
            return gs
          }

          const activeRegion = yield* activeRegionForGameState(gs)
          const planningWorld = activeRegion?.actorWorld ?? gs.world
          const movementWorld = activeRegion?.collisionWorld

          return yield* pipe(
            // figure out what the AI wants to do
            measureEffect(
              {
                counts: (plannedActions) => ({
                  actionTag: action._tag,
                  fullWorldSize: HashMap.size(gs.world),
                  plannedActionCount: plannedActions.length,
                  planningWorldSize: HashMap.size(planningWorld)
                }),
                operation: "backend.turn",
                phase: "allAiPlan",
                traceId
              },
              allAiPlan(gs, planningWorld)
            ),
            tap(() => log("planned ai actions")),
            // also append the player's plans
            andThen((plannedActions) =>
              measureEffect(
                {
                  counts: (withPlayerAction) => ({
                    actionTag: action._tag,
                    plannedActionCount: withPlayerAction.length
                  }),
                  operation: "backend.turn",
                  phase: "appendPlayerAction",
                  traceId
                },
                Effect.sync(() =>
                  appendPlayerAction(gs, action)(plannedActions)
                )
              )
            ),
            tap(() => log("added player action ", action)),
            andThen((plannedActions) =>
              measureEffect(
                {
                  counts: (filteredActions) => ({
                    actionTag: action._tag,
                    plannedActionCount: plannedActions.length,
                    runnableActionCount: filteredActions.length
                  }),
                  operation: "backend.turn",
                  phase: "filterNoops",
                  traceId
                },
                Effect.sync(() =>
                  plannedActions.filter((pa) =>
                    !EAction.$is("noop")(pa.action)
                  )
                )
              )
            ), // todo: change the filter to Option.reduceCompact once everything is options
            tap((actions) =>
              log("filtered noops for a result of : ", actions)
            ),
            // execute the plans
            andThen((plannedActions) =>
              measureEffect(
                {
                  counts: (nextGs) => ({
                    actionTag: action._tag,
                    collisionWorldSize: movementWorld === undefined
                      ? HashMap.size(gs.world)
                      : HashMap.size(movementWorld),
                    executedActionCount: plannedActions.length,
                    nextWorldSize: HashMap.size(nextGs.world)
                  }),
                  operation: "backend.turn",
                  phase: "executePlans",
                  traceId
                },
                executePlans(gs, traceId, {
                  movementBounds: activeRegion?.collisionBounds,
                  movementWorld
                })(plannedActions)
              )
            ),
            andThen((nextGs) =>
              activeRegionForGameState(nextGs).pipe(
                Effect.flatMap((nextActiveRegion) =>
                  nextActiveRegion === undefined
                    ? Effect.succeed(nextGs)
                    : measureEffect(
                      {
                        counts: (result) => ({
                          actionTag: action._tag,
                          ...result.stats
                        }),
                        operation: "backend.turn",
                        phase: "lazyOffscreen",
                        traceId
                      },
                      applyLazyOffscreenStep(
                        nextGs,
                        nextActiveRegion,
                        DEFAULT_LAZY_OFFSCREEN_OPTIONS
                      )
                    ).pipe(Effect.map((result) => result.state))
                )
              )
            ),
            tap(() => log("finished action")),
            withLogSpan(`playeract.${action._tag}`)
          )
        })
      )
    )
  )
}

export const eGetWorld = pipe(
  eGetGameState,
  andThen((gs) => gs.world)
)

const clientWorldForState = (
  gs: TGameState
): Effect.Effect<World, never, never> =>
  activeRegionForGameState(gs).pipe(
    Effect.map((activeRegion) =>
      activeRegion === undefined
        ? gs.world
        : filterWorldToBounds(gs.world, activeRegion.viewport)
    )
  )

const inventoryForWorld = (key: TKey) => (w: World): TItemCollection =>
  w.pipe(filter(isItem), filter((e) => e.in === key))

export const getClientState = pipe(
  eGetGameState,
  andThen((gs) =>
    clientWorldForState(gs).pipe(
      Effect.map((world) => ({
        inventory: inventoryForWorld("player")(gs.world),
        roles: [...availableRoles],
        setup: setupStateFor(gs),
        world
      }))
    )
  )
)

export const selectRoleForSetup = (roleId: RoleId) =>
  eWithGameState((gs) =>
    Effect.succeed(selectRoleForGameState(gs, roleId))
  )

export const confirmSetup = (confirm: boolean) =>
  eWithGameState((gs) =>
    Effect.succeed(confirmSetupForGameState(gs, confirm))
  )

export const getInventory = (key: TKey) =>
  pipe(
    eGetWorld,
    andThen((w) => inventoryForWorld(key)(w))
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
            HashMap.filter((e) => e.in === "world"),
            HashMap.filter((e) => e.key !== key)
          )
      })
    )
  )

export const getLootContainersFor = (key: TKey) =>
  pipe(
    eGetWorld,
    tap(() => log("doing get loot containers")),
    andThen((w) =>
      omatch(getEntityById(key)(w), {
        onNone: () => HashMap.empty(),
        onSome: (entity) => containersAt(w)(entity.at)
      })
    )
  )

export const getLootItemsFor = (key: TKey, containerKey: TKey) =>
  pipe(
    eGetWorld,
    tap(() => log("doing get loot items")),
    andThen((w) =>
      omatch(getEntityById(key)(w), {
        onNone: () => HashMap.empty(),
        onSome: (entity) => {
          const accessibleContainer = containersAt(w)(entity.at).pipe(
            HashMap.get(containerKey)
          )
          return omatch(accessibleContainer, {
            onNone: () => HashMap.empty(),
            onSome: (container) =>
              w.pipe(
                HashMap.filter(isItem),
                HashMap.filter((item) => item.in === container.key)
              )
          })
        }
      })
    )
  )
