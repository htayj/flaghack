import { Match } from "effect"
import type { Creature } from "./creatures.js"
import { player } from "./creatures.js"
import { updateEntity } from "./gameloop.js"
import { GameState, getPlayer } from "./gamestate.js"
import type { Pos } from "./position.js"
import { UV } from "./position.js"
import { actPosition } from "./world.js"

export enum Action {
  apply,
  noop,
  moveLeft,
  moveDown,
  moveRight,
  moveUp,
  moveDownLeft,
  moveDownRight,
  moveUpRight,
  moveUpLeft,
  pickup
}

const act = (gs: GameState) => (crea: Creature) => (action: Action) =>
  Match.value(action).pipe(
    Match.when(Action.moveUp, () => moveCreature(gs)(crea)(UV.Up)),
    Match.when(Action.moveLeft, () => moveCreature(gs)(crea)(UV.Left)),
    Match.when(Action.moveRight, () => moveCreature(gs)(crea)(UV.Right)),
    Match.when(Action.moveDown, () => moveCreature(gs)(crea)(UV.Down)),
    Match.when(
      Action.moveDownLeft,
      () => moveCreature(gs)(crea)(UV.DownLeft)
    ),
    Match.when(Action.moveUpLeft, () => moveCreature(gs)(crea)(UV.UpLeft)),
    Match.when(
      Action.moveDownRight,
      () => moveCreature(gs)(crea)(UV.DownRight)
    ),
    Match.when(
      Action.moveUpRight,
      () => moveCreature(gs)(crea)(UV.UpRight)
    ),
    Match.when(Action.apply, () => gs),
    Match.when(Action.pickup, () => gs),
    Match.when(Action.noop, () => gs),
    Match.orElse(() => gs)
  )
const moveCreature =
  (gs: GameState) => <T extends Creature>(entity: T) => (vec: Pos) =>
    updateEntity(gs)(entity)((c) => actPosition(gs.get("world"))(c, vec))

export const doAction =
  (gs: GameState) =>
  <C extends Creature>(c?: C) =>
  (action: Action): GameState => {
    const crea = c ?? getPlayer(gs) ?? player(2, 2)

    return act(gs)(crea)(action)
  }
