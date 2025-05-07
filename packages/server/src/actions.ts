import { Action, EAction } from "@flaghack/domain/schemas"
import { Effect, Match } from "effect"
import { Option, some } from "effect/Option"
import { PlannedAction } from "./ai/ai.js"
import { GameState, updateEntity } from "./gamestate.js"
import { pickup } from "./items.js"
import type { TPos } from "./position.js"
import { UV } from "./position.js"
import { actPosition, Entity } from "./world.js"

const moveEntity =
  (gs: GameState) =>
  <T extends Entity>(entity: Option<T>) =>
  (vec: TPos): GameState =>
    updateEntity(gs)(entity)((c) => actPosition(gs.world)(c, vec))

const pickupItem =
  (gs: GameState) =>
  <T extends Entity>(entity: Option<T>) =>
  <I extends Entity>(item: Option<I>): GameState =>
    updateEntity(gs)(item)((i) => pickup(entity)(i))

export const doAction = (
  gs: GameState,
  { action, entity }: PlannedAction
) => Effect.succeed(act(gs)(some(entity))(action))

const act =
  (gs: GameState) =>
  (crea: Option<Entity>) =>
  (action: Action): GameState =>
    EAction.$match({
      apply: () => gs,
      noop: () => gs,
      move: ({ dir }) =>
        Match.value(dir).pipe(
          Match.when("N", () => moveEntity(gs)(crea)(UV.Up)),
          Match.when("E", () => moveEntity(gs)(crea)(UV.Right)),
          Match.when("S", () => moveEntity(gs)(crea)(UV.Down)),
          Match.when("W", () => moveEntity(gs)(crea)(UV.Left)),
          Match.when("NE", () => moveEntity(gs)(crea)(UV.UpRight)),
          Match.when("NW", () => moveEntity(gs)(crea)(UV.UpLeft)),
          Match.when("SE", () => moveEntity(gs)(crea)(UV.DownRight)),
          Match.when("SW", () => moveEntity(gs)(crea)(UV.DownLeft)),
          Match.exhaustive
        ),
      pickup: ({ object }) => pickupItem(gs)(crea)(some(object))
    })(action)
// Match.value(verb).pipe(
//   Match.when(Verb.moveUp, () => moveCreature(gs)(crea)(UV.Up)),
//   Match.when(Verb.moveLeft, () => moveCreature(gs)(crea)(UV.Left)),
//   Match.when(Verb.moveRight, () => moveCreature(gs)(crea)(UV.Right)),
//   Match.when(Verb.moveDown, () => moveCreature(gs)(crea)(UV.Down)),
//   Match.when(
//     Verb.moveDownLeft,
//     () => moveCreature(gs)(crea)(UV.DownLeft)
//   ),
//   Match.when(Verb.moveUpLeft, () => moveCreature(gs)(crea)(UV.UpLeft)),
//   Match.when(
//     Verb.moveDownRight,
//     () => moveCreature(gs)(crea)(UV.DownRight)
//   ),
//   Match.when(
//     Verb.moveUpRight,
//     () => moveCreature(gs)(crea)(UV.UpRight)
//   ),
//   Match.when(Verb.apply, () => gs),
//   Match.when(
//     Verb.pickup,
//     () => object ? pickupItem(gs)(crea)(object) : gs
//   ),
//   Match.when(Verb.noop, () => gs),
//   Match.orElse(() => gs)
// )
