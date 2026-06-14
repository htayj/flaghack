import type { Action } from "@flaghack/domain/schemas"
import { Effect, HashMap, Match } from "effect"
import { type Option, some } from "effect/Option"
import type { PlannedAction } from "./ai/ai.js"
import type { TKey } from "./entity.js"
import { type GameState, updateEntity } from "./gamestate.js"
import { drop, pickup } from "./items.js"
import type { TPos } from "./position.js"
import { UV } from "./position.js"
import { actPosition, type Entity } from "./world.js"

const moveEntity =
  (gs: GameState) =>
  <T extends Entity>(entity: Option<T>) =>
  (vec: TPos): GameState =>
    updateEntity(gs)(entity)((c) => actPosition(gs.world)(c, vec))

const dropItems =
  (gs: GameState) =>
  <T extends Entity>(entity: Option<T>) =>
  (keys: ReadonlyArray<TKey>): GameState =>
    keys.reduce(
      (acc, key) =>
        updateEntity(acc)(acc.world.pipe(HashMap.get(key)))((item) =>
          drop(entity)(item)
        ),
      gs
    )
const pickupItems =
  (gs: GameState) =>
  <T extends Entity>(entity: Option<T>) =>
  (keys: ReadonlyArray<TKey>): GameState =>
    keys.reduce(
      (acc, key) =>
        updateEntity(acc)(acc.world.pipe(HashMap.get(key)))((item) =>
          pickup(entity)(item)
        ),
      gs
    )

export const doAction = (
  gs: GameState,
  { action, entity }: PlannedAction
) => Effect.succeed(act(gs)(some(entity))(action))

const act =
  (gs: GameState) =>
  (crea: Option<Entity>) =>
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
      default:
        return gs
    }
  }
