import { Action, EAction } from "@flaghack/domain/schemas"
import { Match } from "effect"
import type { Creature } from "./creatures.js"
import { player } from "./creatures.js"
import { GameState, getPlayer, updateEntity } from "./gamestate.js"
import { pickup } from "./items.js"
import type { TPos } from "./position.js"
import { UV } from "./position.js"
import { actPosition, Entity } from "./world.js"

const moveCreature =
  (gs: GameState) =>
  <T extends Creature>(entity: T) =>
  (vec: TPos): GameState =>
    updateEntity(gs)(entity)((c) => actPosition(gs.world)(c, vec))

const pickupItem =
  (gs: GameState) =>
  <T extends Entity>(entity: T) =>
  <I extends Entity>(item: I): GameState =>
    updateEntity(gs)(item)((i) => pickup(entity)(i))

export const doAction =
  (gs: GameState) =>
  <C extends Creature>(c?: C) =>
  (action: Action): GameState => {
    const crea = c ?? getPlayer(gs) ?? player(2, 2)
    return act(gs)(crea)(action)
  }

const act =
  (gs: GameState) => (crea: Creature) => (action: Action): GameState =>
    EAction.$match({
      apply: () => gs,
      noop: () => gs,
      move: ({ dir }) =>
        Match.value(dir).pipe(
          Match.when("N", () => moveCreature(gs)(crea)(UV.Up)),
          Match.when("E", () => moveCreature(gs)(crea)(UV.Right)),
          Match.when("S", () => moveCreature(gs)(crea)(UV.Down)),
          Match.when("W", () => moveCreature(gs)(crea)(UV.Left)),
          Match.when("NE", () => moveCreature(gs)(crea)(UV.UpRight)),
          Match.when("NW", () => moveCreature(gs)(crea)(UV.UpLeft)),
          Match.when("SE", () => moveCreature(gs)(crea)(UV.DownRight)),
          Match.when("SW", () => moveCreature(gs)(crea)(UV.DownLeft)),
          Match.exhaustive
        ),
      pickup: ({ object }) => pickupItem(gs)(crea)(object)
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
