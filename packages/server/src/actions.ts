import type {
  Action,
  Direction as DirectionSchema
} from "@flaghack/domain/schemas"
import { Effect, HashMap, Match, Option } from "effect"
import { type Option as TOption, some } from "effect/Option"
import type { PlannedAction } from "./ai/ai.js"
import {
  talkCampgroundAction,
  travelStepCampgroundAction
} from "./campgroundActions.js"
import { reconcileCampgroundProgress } from "./campgroundProgress.js"
import { CAMPGROUND_MISSING_FLAG_KEY } from "./campgroundQuestContent.js"
import type { TKey } from "./entity.js"
import { type GameState, updateEntity, updateWorld } from "./gamestate.js"
import { drop, pickup, putIntoContainer } from "./items.js"
import type { TPos } from "./position.js"
import { collideP, shift, UV } from "./position.js"
import {
  actPosition,
  BSPGenLevel,
  type Entity,
  FIRST_DUNGEON_LEVEL,
  firstDungeonArrivalCoordinate,
  isContainer,
  isCreature,
  isDrinkItem,
  isFoodItem,
  isItem,
  type World
} from "./world.js"

export type ActionExecutionContext = {
  readonly movementWorld?: World | undefined
}

type Direction = typeof DirectionSchema.Type

const FIRST_DUNGEON_SEED = 777

const firstDungeonArrival: TPos = {
  ...firstDungeonArrivalCoordinate,
  z: FIRST_DUNGEON_LEVEL
}

const directionVector = (direction: Direction): TPos =>
  Match.value(direction).pipe(
    Match.when("N", () => UV.Up),
    Match.when("E", () => UV.Right),
    Match.when("S", () => UV.Down),
    Match.when("W", () => UV.Left),
    Match.when("NE", () => UV.UpRight),
    Match.when("NW", () => UV.UpLeft),
    Match.when("SE", () => UV.DownRight),
    Match.when("SW", () => UV.DownLeft),
    Match.exhaustive
  )

const moveEntity =
  (gs: GameState, context: ActionExecutionContext = {}) =>
  <T extends Entity>(entity: TOption<T>) =>
  (vec: TPos): GameState =>
    updateEntity(gs)(entity)((c) =>
      actPosition(context.movementWorld ?? gs.world)(c, vec)
    )

const doorAt = (world: World, position: TPos): TOption<Entity> =>
  Option.fromNullable(
    Array.from(world.pipe(HashMap.values)).find((entity) =>
      entity._tag === "door"
      && entity.in === "world"
      && collideP(position)(entity.at)
    )
  )

const adjacentDoor =
  (world: World) => (actor: Entity) => (direction: Direction) =>
    actor.in === "world"
      ? doorAt(world, shift(actor.at, directionVector(direction)))
      : Option.none()

const setDoorOpen = (
  gs: GameState,
  door: Entity,
  open: boolean
): GameState =>
  updateWorld(gs)(
    HashMap.modify(door.key, (entity) =>
      entity._tag === "door" ? { ...entity, open } : entity)
  )

const hasCreatureAt = (world: World, position: TPos): boolean =>
  Array.from(world.pipe(HashMap.values)).some((entity) =>
    entity.in === "world"
    && isCreature(entity)
    && collideP(position)(entity.at)
  )

const canSetDoorOpen = (
  gs: GameState,
  door: Entity,
  open: boolean
): boolean => open || !hasCreatureAt(gs.world, door.at)

const applyDoorAction =
  (gs: GameState, context: ActionExecutionContext = {}) =>
  <T extends Entity>(entity: TOption<T>) =>
  (direction: Direction, open: boolean): GameState =>
    Option.match(entity, {
      onNone: () => gs,
      onSome: (actor) =>
        Option.match(
          adjacentDoor(context.movementWorld ?? gs.world)(actor)(
            direction
          ),
          {
            onNone: () => gs,
            onSome: (door) =>
              canSetDoorOpen(gs, door, open)
                ? setDoorOpen(gs, door, open)
                : gs
          }
        )
    })

const moveEntityOrOpenDoor =
  (gs: GameState, context: ActionExecutionContext = {}) =>
  <T extends Entity>(entity: TOption<T>) =>
  (direction: Direction): GameState =>
    Option.match(entity, {
      onNone: () => gs,
      onSome: (actor) => {
        const door = adjacentDoor(context.movementWorld ?? gs.world)(
          actor
        )(direction)
        if (Option.isSome(door) && door.value._tag === "door") {
          return door.value.open
            ? moveEntity(gs, context)(entity)(directionVector(direction))
            : setDoorOpen(gs, door.value, true)
        }

        return moveEntity(gs, context)(entity)(
          directionVector(direction)
        )
      }
    })

const itemIsAtActor = (actor: Entity) => (item: Entity): boolean =>
  isItem(item)
  && item.in === "world"
  && item.key !== actor.key
  && collideP(actor.at)(item.at)

const itemIsHeldByActor = (actor: Entity) => (item: Entity): boolean =>
  isItem(item) && item.in === actor.key

const accessibleContainer =
  (gs: GameState) =>
  (actor: Entity) =>
  (containerKey: TKey): TOption<Entity> =>
    gs.world.pipe(
      HashMap.get(containerKey),
      Option.filter((container) =>
        isContainer(container)
        && container.in === "world"
        && collideP(actor.at)(container.at)
      )
    )

const itemIsInContainer = (container: Entity) => (item: Entity): boolean =>
  isItem(item) && item.in === container.key

const dropItems =
  (gs: GameState) =>
  <T extends Entity>(entity: TOption<T>) =>
  (keys: ReadonlyArray<TKey>): GameState =>
    keys.reduce(
      (acc, key) =>
        updateEntity(acc)(
          acc.world.pipe(
            HashMap.get(key),
            Option.filter((item) =>
              Option.match(entity, {
                onNone: () => false,
                onSome: (actor) => itemIsHeldByActor(actor)(item)
              })
            )
          )
        )((item) => drop(entity)(item)),
      gs
    )
const pickupItems =
  (gs: GameState) =>
  <T extends Entity>(entity: TOption<T>) =>
  (keys: ReadonlyArray<TKey>): GameState =>
    keys.reduce(
      (acc, key) =>
        updateEntity(acc)(
          acc.world.pipe(
            HashMap.get(key),
            Option.filter((item) =>
              Option.match(entity, {
                onNone: () => false,
                onSome: (actor) => itemIsAtActor(actor)(item)
              })
            )
          )
        )((item) => pickup(entity)(item)),
      gs
    )

const lootTakeItems =
  (gs: GameState) =>
  <T extends Entity>(entity: TOption<T>) =>
  (containerKey: TKey, keys: ReadonlyArray<TKey>): GameState =>
    Option.match(entity, {
      onNone: () => gs,
      onSome: (actor) => {
        const container = accessibleContainer(gs)(actor)(containerKey)
        if (Option.isNone(container)) return gs

        return keys.reduce(
          (acc, key) =>
            updateEntity(acc)(
              acc.world.pipe(
                HashMap.get(key),
                Option.filter(itemIsInContainer(container.value))
              )
            )((item) => pickup(some(actor))(item)),
          gs
        )
      }
    })

const lootPutItems =
  (gs: GameState) =>
  <T extends Entity>(entity: TOption<T>) =>
  (containerKey: TKey, keys: ReadonlyArray<TKey>): GameState =>
    Option.match(entity, {
      onNone: () => gs,
      onSome: (actor) => {
        const container = accessibleContainer(gs)(actor)(containerKey)
        if (Option.isNone(container)) return gs

        return keys.reduce(
          (acc, key) =>
            updateEntity(acc)(
              acc.world.pipe(
                HashMap.get(key),
                Option.filter(itemIsHeldByActor(actor))
              )
            )((item) => putIntoContainer(container)(item)),
          gs
        )
      }
    })

const consumeHeldItems =
  (gs: GameState) =>
  <T extends Entity>(entity: TOption<T>) =>
  (
    keys: ReadonlyArray<TKey>,
    canConsume: (item: Entity) => boolean
  ): GameState =>
    Option.match(entity, {
      onNone: () => gs,
      onSome: (actor) =>
        keys.reduce((acc, key) => {
          const item = acc.world.pipe(
            HashMap.get(key),
            Option.filter((item) =>
              itemIsHeldByActor(actor)(item) && canConsume(item)
            )
          )

          return Option.isSome(item)
            ? updateWorld(acc)(HashMap.remove(key))
            : acc
        }, gs)
    })

const playerIsOnDownStairs = (
  world: World,
  entity: Entity
): boolean =>
  entity._tag === "player"
  && entity.in === "world"
  && entity.at.z === FIRST_DUNGEON_LEVEL - 1
  && Array.from(world.pipe(HashMap.values)).some((candidate) =>
    candidate._tag === "stairs-down"
    && candidate.in === "world"
    && collideP(entity.at)(candidate.at)
  )

const playerIsOnUpStairs = (
  world: World,
  entity: Entity
): boolean =>
  entity._tag === "player"
  && entity.in === "world"
  && entity.at.z === FIRST_DUNGEON_LEVEL
  && Array.from(world.pipe(HashMap.values)).some((candidate) =>
    candidate._tag === "stairs-up"
    && candidate.in === "world"
    && collideP(entity.at)(candidate.at)
  )

const campgroundDownStairs = (world: World): Entity | undefined =>
  Array.from(world.pipe(HashMap.values)).find((candidate) =>
    candidate._tag === "stairs-down"
    && candidate.in === "world"
    && candidate.at.z === FIRST_DUNGEON_LEVEL - 1
  )

const hasFirstDungeonArrival = (world: World): boolean =>
  Array.from(world.pipe(HashMap.values)).some((entity) =>
    entity._tag === "tunnel"
    && entity.in === "world"
    && collideP(firstDungeonArrival)(entity.at)
  )

const collisionSafeDungeonEntities = (
  existingWorld: World,
  generatedWorld: World
): ReadonlyArray<Entity> => {
  const occupiedKeys = new globalThis.Set(
    Array.from(existingWorld.pipe(HashMap.values)).map(({ key }) => key)
  )
  const keyMap = new globalThis.Map<string, string>()
  const generatedEntities = Array.from(
    generatedWorld.pipe(HashMap.values)
  ).sort((left, right) => left.key.localeCompare(right.key))

  for (const entity of generatedEntities) {
    const preserveQuestKey = entity.key === CAMPGROUND_MISSING_FLAG_KEY
      && !occupiedKeys.has(entity.key)
    const baseKey = preserveQuestKey
      ? entity.key
      : `dungeon-${FIRST_DUNGEON_LEVEL}-${entity.key}`
    let key = baseKey
    let suffix = 1
    while (occupiedKeys.has(key)) {
      key = `${baseKey}-${suffix}`
      suffix += 1
    }
    occupiedKeys.add(key)
    keyMap.set(entity.key, key)
  }

  return generatedEntities.map((entity) => ({
    ...entity,
    in: entity.in === "world"
      ? "world"
      : keyMap.get(entity.in) ?? entity.in,
    key: keyMap.get(entity.key) ?? entity.key
  }))
}

const mergeFirstDungeon = (
  existingWorld: World,
  generatedWorld: World
): World =>
  collisionSafeDungeonEntities(existingWorld, generatedWorld).reduce(
    (world, entity) => world.pipe(HashMap.set(entity.key, entity)),
    existingWorld
  )

const descendPlayer = (
  gs: GameState,
  entity: Entity
): Effect.Effect<GameState> => {
  if (!playerIsOnDownStairs(gs.world, entity)) {
    return Effect.succeed(gs)
  }

  const worldWithDungeon = hasFirstDungeonArrival(gs.world)
    ? Effect.succeed(gs.world)
    : BSPGenLevel(FIRST_DUNGEON_SEED, FIRST_DUNGEON_LEVEL).pipe(
      Effect.orDie,
      Effect.map((generatedWorld) =>
        mergeFirstDungeon(gs.world, generatedWorld)
      )
    )

  return worldWithDungeon.pipe(
    Effect.map((world) => ({
      ...gs,
      world: world.pipe(
        HashMap.set(entity.key, {
          ...entity,
          at: firstDungeonArrival
        })
      )
    }))
  )
}

const ascendPlayer = (
  gs: GameState,
  entity: Entity
): GameState => {
  if (!playerIsOnUpStairs(gs.world, entity)) return gs

  const destination = campgroundDownStairs(gs.world)
  return destination === undefined
    ? gs
    : {
      ...gs,
      world: gs.world.pipe(
        HashMap.set(entity.key, {
          ...entity,
          at: destination.at
        })
      )
    }
}

export const doAction = (
  gs: GameState,
  { action, entity }: PlannedAction,
  context: ActionExecutionContext = {}
) =>
  action._tag === "descend"
    ? descendPlayer(gs, entity)
    : action._tag === "ascend"
    ? Effect.succeed(ascendPlayer(gs, entity))
    : action._tag === "talk"
    ? Effect.succeed(talkCampgroundAction(gs, entity, action.dir))
    : action._tag === "travelStep"
    ? Effect.succeed(
      travelStepCampgroundAction(
        gs,
        entity,
        action.landmarkId,
        context.movementWorld
      )
    )
    : Effect.succeed(act(gs, context)(some(entity))(action)).pipe(
      Effect.map((next) =>
        action._tag === "pickupMulti"
          || action._tag === "lootTakeMulti"
          ? reconcileCampgroundProgress(next)
          : next
      )
    )

const act =
  (gs: GameState, context: ActionExecutionContext = {}) =>
  (crea: TOption<Entity>) =>
  (action: Action): GameState => {
    switch (action._tag) {
      case "apply":
      case "noop":
      case "descend":
      case "ascend":
      case "talk":
      case "travelStep":
        return gs
      case "move":
        return moveEntityOrOpenDoor(gs, context)(crea)(action.dir)
      case "open":
        return applyDoorAction(gs, context)(crea)(action.dir, true)
      case "close":
        return applyDoorAction(gs, context)(crea)(action.dir, false)
      case "pickupMulti":
        return pickupItems(gs)(crea)(action.keys)
      case "dropMulti":
        return dropItems(gs)(crea)(action.keys)
      case "lootTakeMulti":
        return lootTakeItems(gs)(crea)(action.containerKey, action.keys)
      case "lootPutMulti":
        return lootPutItems(gs)(crea)(action.containerKey, action.keys)
      case "eatMulti":
        return consumeHeldItems(gs)(crea)(action.keys, isFoodItem)
      case "quaffMulti":
        return consumeHeldItems(gs)(crea)(action.keys, isDrinkItem)
      default:
        return gs
    }
  }
