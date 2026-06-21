import type { Action } from "@flaghack/domain/schemas"
import { Effect, HashMap, Match, Option } from "effect"
import { type Option as TOption, some } from "effect/Option"
import type { PlannedAction } from "./ai/ai.js"
import type { TKey } from "./entity.js"
import { type GameState, updateEntity } from "./gamestate.js"
import { drop, pickup, putIntoContainer } from "./items.js"
import type { TPos } from "./position.js"
import { collideP, UV } from "./position.js"
import { actPosition, type Entity, isContainer, isItem } from "./world.js"

const moveEntity =
  (gs: GameState) =>
  <T extends Entity>(entity: TOption<T>) =>
  (vec: TPos): GameState =>
    updateEntity(gs)(entity)((c) => actPosition(gs.world)(c, vec))

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

export const doAction = (
  gs: GameState,
  { action, entity }: PlannedAction
) => Effect.succeed(act(gs)(some(entity))(action))

const act =
  (gs: GameState) =>
  (crea: TOption<Entity>) =>
  (action: Action): GameState => {
    switch (action._tag) {
      case "apply":
      case "noop":
        return gs
      case "move":
        return Match.value(action.dir).pipe(
          Match.when("N", () => moveEntity(gs)(crea)(UV.Up)),
          Match.when("E", () => moveEntity(gs)(crea)(UV.Right)),
          Match.when("S", () => moveEntity(gs)(crea)(UV.Down)),
          Match.when("W", () => moveEntity(gs)(crea)(UV.Left)),
          Match.when("NE", () => moveEntity(gs)(crea)(UV.UpRight)),
          Match.when("NW", () => moveEntity(gs)(crea)(UV.UpLeft)),
          Match.when("SE", () => moveEntity(gs)(crea)(UV.DownRight)),
          Match.when("SW", () => moveEntity(gs)(crea)(UV.DownLeft)),
          Match.exhaustive
        )
      case "pickupMulti":
        return pickupItems(gs)(crea)(action.keys)
      case "dropMulti":
        return dropItems(gs)(crea)(action.keys)
      case "lootTakeMulti":
        return lootTakeItems(gs)(crea)(action.containerKey, action.keys)
      case "lootPutMulti":
        return lootPutItems(gs)(crea)(action.containerKey, action.keys)
      default:
        return gs
    }
  }
