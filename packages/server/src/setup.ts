import {
  type Role,
  roleById,
  type RoleId,
  roles
} from "@flaghack/domain/roles"
import type { RoleSetupState } from "@flaghack/domain/schemas"
import { HashMap, Option } from "effect"
import type { GameState } from "./gamestate.js"
import { type Entity, isPlayer, type World } from "./world.js"

type SetupState = typeof RoleSetupState.Type

export const availableRoles = roles
export const initialSetupState: SetupState = { phase: "selectRole" }
const missingSetupCompleteState: SetupState = { phase: "complete" }

export const setupStateFor = (gs: GameState): SetupState =>
  gs.setup ?? missingSetupCompleteState

export const setupIsComplete = (gs: GameState): boolean =>
  setupStateFor(gs).phase === "complete"

const resetToRoleSelection = (gs: GameState): GameState => ({
  ...gs,
  setup: initialSetupState
})

export const selectRoleForGameState = (
  gs: GameState,
  roleId: RoleId
): GameState => {
  if (setupIsComplete(gs)) return gs

  const role = roleById(roleId)
  return role === undefined
    ? gs
    : {
      ...gs,
      setup: { phase: "confirm", selectedRoleId: role.id }
    }
}

const applyRoleToPlayer = (role: Role) => (world: World): World => {
  const withoutStartingItems = world.pipe(
    HashMap.filter((entity) => entity.in !== "player")
  )
  const maybePlayer = withoutStartingItems.pipe(HashMap.get("player"))

  return Option.match(maybePlayer, {
    onNone: () => withoutStartingItems,
    onSome: (entity) => {
      if (!isPlayer(entity)) return withoutStartingItems

      const updatedPlayer: Entity = {
        ...entity,
        role: role.id
      }
      return HashMap.set(withoutStartingItems, entity.key, updatedPlayer)
    }
  })
}

export const confirmSetupForGameState = (
  gs: GameState,
  confirm: boolean
): GameState => {
  const setup = setupStateFor(gs)
  if (setup.phase === "complete") return gs
  if (!confirm) return resetToRoleSelection(gs)

  if (setup.phase !== "confirm" || setup.selectedRoleId === undefined) {
    return gs
  }

  const role = roleById(setup.selectedRoleId)
  if (role === undefined) return resetToRoleSelection(gs)

  return {
    ...gs,
    setup: { phase: "complete", selectedRoleId: role.id },
    world: applyRoleToPlayer(role)(gs.world)
  }
}
