import type {
  CampgroundFavorState as CampgroundFavorStateSchema,
  GameState as GameStateSchema
} from "@flaghack/domain/schemas"
import { HashMap, Option } from "effect"
import {
  formatCampgroundAddress,
  getCampgroundCamp
} from "./campground.js"
import { suppressCampgroundAtmosphere } from "./campgroundAtmosphere.js"
import {
  CAMPGROUND_BORROWED_TOOL_KEY,
  CAMPGROUND_MISSING_FLAG_KEY,
  CAMPGROUND_WATER_REWARD_KEY,
  CAMPGROUND_WELCOME_REWARD_KEY
} from "./campgroundQuestContent.js"
import {
  markCampgroundDiscovery,
  normalizeCampgroundState
} from "./campgroundState.js"
import { appendGameplayEvent } from "./gameplayEvents.js"
import { makeGroundFlag, makeGroundHammer } from "./items.js"
import type { Entity } from "./world.js"

export {
  CAMPGROUND_BORROWED_TOOL_KEY,
  CAMPGROUND_MISSING_FLAG_KEY,
  CAMPGROUND_WATER_REWARD_KEY,
  CAMPGROUND_WELCOME_REWARD_KEY
} from "./campgroundQuestContent.js"

type GameState = typeof GameStateSchema.Type
type CampgroundFavorState = typeof CampgroundFavorStateSchema.Type
type CampgroundState = NonNullable<GameState["campground"]>
export type CampgroundNpcAssignment = NonNullable<
  CampgroundState["npcAssignments"]
>[number]

export type CampgroundFavorTransition =
  | "offer"
  | "activate"
  | "ready"
  | "complete"

export interface CampgroundConversationProgress {
  readonly handled: boolean
  readonly message?: string
  readonly state: GameState
}

export interface ReconcileCampgroundProgressOptions {
  readonly emitMessages?: boolean
}

const WELCOME_CAMP_ID = "dusty-spoon"
const TOOL_SOURCE_CAMP_ID = "patch-bay"
const WATER_CAMP_ID = "pulse-dome"

const entityByKey = (state: GameState, key: string): Entity | undefined =>
  Option.getOrUndefined(HashMap.get(state.world, key))

const playerFrom = (state: GameState): Entity | undefined => {
  const player = entityByKey(state, "player")
  return player?._tag === "player" ? player : undefined
}

const assignmentFor = (
  campground: CampgroundState,
  npcKey: string
): CampgroundNpcAssignment | undefined =>
  campground.npcAssignments?.find((assignment) =>
    assignment.npcKey === npcKey
  )

const greeterAssignment = (
  campground: CampgroundState
): CampgroundNpcAssignment | undefined =>
  campground.npcAssignments?.find((assignment) =>
    assignment.role === "civic"
    && assignment.landmarkId === "arrival-plaza"
  )

const favorPhaseOrder = [
  "unavailable",
  "offered",
  "active",
  "ready",
  "completed"
] as const

const transitionTarget = (
  transition: CampgroundFavorTransition
): CampgroundFavorState["phase"] => {
  switch (transition) {
    case "offer":
      return "offered"
    case "activate":
      return "active"
    case "ready":
      return "ready"
    case "complete":
      return "completed"
  }
}

/** Advances only forward and preserves all keyed favor metadata. */
export const transitionCampgroundFavor = (
  favor: CampgroundFavorState,
  transition: CampgroundFavorTransition,
  fields: Partial<Omit<CampgroundFavorState, "phase">> = {}
): CampgroundFavorState => {
  const target = transitionTarget(transition)
  const currentIndex = favorPhaseOrder.indexOf(favor.phase)
  const targetIndex = favorPhaseOrder.indexOf(target)
  return {
    ...favor,
    ...fields,
    phase: targetIndex > currentIndex ? target : favor.phase
  }
}

const withCampground = (
  state: GameState,
  campground: CampgroundState
): GameState => ({ ...state, campground })

const withEntity = (state: GameState, entity: Entity): GameState => ({
  ...state,
  world: state.world.pipe(
    HashMap.set<string, Entity>(entity.key, entity)
  )
})

const transferEntity = (
  state: GameState,
  entity: Entity,
  recipient: Entity
): GameState =>
  withEntity(state, {
    ...entity,
    at: recipient.at,
    in: recipient.key
  })

const heldEntity = (
  state: GameState,
  predicate: (entity: Entity) => boolean
): Entity | undefined => {
  const player = playerFrom(state)
  if (player === undefined) return undefined
  let held: Entity | undefined
  for (const entity of state.world.pipe(HashMap.values)) {
    if (
      entity.in === player.key
      && predicate(entity)
      && (held === undefined || entity.key.localeCompare(held.key) < 0)
    ) {
      held = entity
    }
  }
  return held
}

const heldEntityByKey = (
  state: GameState,
  key: string,
  predicate: (entity: Entity) => boolean
): Entity | undefined => {
  const player = playerFrom(state)
  const entity = entityByKey(state, key)
  return player !== undefined
      && entity?.in === player.key
      && predicate(entity)
    ? entity
    : undefined
}

const makeHeldReward = (
  key: string,
  tag: "pancake" | "trailmix",
  player: Entity
): Entity => ({
  _tag: tag,
  at: { x: 0, y: 0, z: 0 },
  in: player.key,
  key
})

const grantUniqueReward = (
  state: GameState,
  key: string,
  tag: "pancake" | "trailmix"
): GameState => {
  if (HashMap.has(state.world, key)) return state
  const player = playerFrom(state)
  return player === undefined
    ? state
    : withEntity(state, makeHeldReward(key, tag, player))
}

const appendProgressMessage = (
  state: GameState,
  message: string
): GameState =>
  suppressCampgroundAtmosphere(appendGameplayEvent(state, message))

const withStableProgressKeys = (state: GameState): GameState => {
  const campground = state.campground
  if (campground === undefined) return state
  const greeter = greeterAssignment(campground)
  const hasFlag = HashMap.has(state.world, CAMPGROUND_MISSING_FLAG_KEY)
  const hasTool = HashMap.has(state.world, CAMPGROUND_BORROWED_TOOL_KEY)

  return withCampground(state, {
    ...campground,
    ...(campground.missingFlagKey !== undefined || !hasFlag
      ? {}
      : { missingFlagKey: CAMPGROUND_MISSING_FLAG_KEY }),
    ...(campground.missingFlagOwnerNpcKey !== undefined
        || greeter === undefined
      ? {}
      : { missingFlagOwnerNpcKey: greeter.npcKey }),
    toolFavor: {
      ...(campground.toolFavor ?? { phase: "unavailable" }),
      ...((campground.toolFavor?.requiredItemKey !== undefined || !hasTool)
        ? {}
        : { requiredItemKey: CAMPGROUND_BORROWED_TOOL_KEY })
    }
  })
}

const cardinalPositionKeys = (
  position: Entity["at"]
): ReadonlyArray<string> => [
  `${position.x + 1},${position.y},${position.z}`,
  `${position.x - 1},${position.y},${position.z}`,
  `${position.x},${position.y + 1},${position.z}`,
  `${position.x},${position.y - 1},${position.z}`
]

const positionKey = (position: Entity["at"]): string =>
  `${position.x},${position.y},${position.z}`

const firstDungeonFlagPosition = (
  state: GameState
): Entity["at"] | undefined => {
  const tunnels = Array.from(state.world.pipe(HashMap.values)).filter(
    (entity) =>
      entity.in === "world" && entity._tag === "tunnel"
      && entity.at.z === 1
  )
  const tunnelByPosition = new Map(
    tunnels.map((tunnel) => [positionKey(tunnel.at), tunnel] as const)
  )
  const arrivalKey = "1,1,1"
  const startKey = tunnelByPosition.has(arrivalKey)
    ? arrivalKey
    : [...tunnelByPosition.keys()].sort().at(0)
  if (startKey === undefined) return undefined

  const distances = new Map<string, number>([[startKey, 0]])
  const queue = [startKey]
  while (queue.length > 0) {
    const currentKey = queue.shift()
    if (currentKey === undefined) continue
    const current = tunnelByPosition.get(currentKey)
    if (current === undefined) continue
    for (const neighborKey of cardinalPositionKeys(current.at)) {
      if (
        tunnelByPosition.has(neighborKey) && !distances.has(neighborKey)
      ) {
        distances.set(neighborKey, (distances.get(currentKey) ?? 0) + 1)
        queue.push(neighborKey)
      }
    }
  }

  const occupied = new Set(
    Array.from(state.world.pipe(HashMap.values)).filter((entity) =>
      entity.in === "world"
      && entity.at.z === 1
      && entity._tag !== "tunnel"
      && entity._tag !== "floor"
    ).map((entity) => positionKey(entity.at))
  )
  return [...distances].flatMap(([key, distance]) => {
    const tunnel = tunnelByPosition.get(key)
    if (tunnel === undefined || occupied.has(key) || key === arrivalKey) {
      return []
    }
    const reachableNeighbors = cardinalPositionKeys(tunnel.at).filter(
      (neighborKey) => distances.has(neighborKey)
    ).length
    return reachableNeighbors === 1 ? [{ distance, tunnel }] : []
  }).sort((left, right) =>
    right.distance - left.distance
    || left.tunnel.at.y - right.tunnel.at.y
    || left.tunnel.at.x - right.tunnel.at.x
    || left.tunnel.key.localeCompare(right.tunnel.key)
  ).at(0)?.tunnel.at
}

interface ProgressEntityRepair {
  readonly message?: string
  readonly state: GameState
}

const repairMissingFlag = (state: GameState): GameState => {
  const campground = state.campground
  if (
    campground === undefined
    || campground.missingFlagPhase === "returned"
  ) return state
  const registeredFlagKey = campground.missingFlagKey
  if (registeredFlagKey === undefined && playerFrom(state)?.at.z !== 1) {
    return state
  }
  const flagKey = registeredFlagKey ?? CAMPGROUND_MISSING_FLAG_KEY
  if (HashMap.has(state.world, flagKey)) return state
  const position = firstDungeonFlagPosition(state)
  if (position === undefined) return state
  const flag: Entity = makeGroundFlag(flagKey, position)
  return withCampground(withEntity(state, flag), {
    ...campground,
    missingFlagKey: flagKey
  })
}

const repairBorrowedTool = (state: GameState): ProgressEntityRepair => {
  const campground = state.campground
  if (campground === undefined) return { state }
  const favor = campground.toolFavor ?? { phase: "unavailable" as const }
  if (favor.phase === "completed") return { state }
  const toolKey = favor.requiredItemKey ?? CAMPGROUND_BORROWED_TOOL_KEY
  if (HashMap.has(state.world, toolKey)) return { state }
  const patchBay = campground.campPlacements?.find(({ id }) =>
    id === TOOL_SOURCE_CAMP_ID
  )
  if (patchBay !== undefined) {
    const cooler = Array.from(state.world.pipe(HashMap.values)).filter(
      (entity) =>
        entity.in === "world" && entity._tag === "cooler"
        && entity.at.z === patchBay.signAt.z
    ).sort((left, right) =>
      Math.abs(left.at.x - patchBay.signAt.x)
        + Math.abs(left.at.y - patchBay.signAt.y)
        - Math.abs(right.at.x - patchBay.signAt.x)
        - Math.abs(right.at.y - patchBay.signAt.y)
      || left.key.localeCompare(right.key)
    ).at(0)
    const position = cooler?.at ?? patchBay.entranceAt
    const hammer: Entity = {
      ...makeGroundHammer(toolKey, position),
      in: cooler?.key ?? "world"
    }
    return {
      state: withCampground(withEntity(state, hammer), {
        ...campground,
        toolFavor: { ...favor, requiredItemKey: toolKey }
      })
    }
  }

  const hasEffigyWorker =
    campground.npcAssignments?.some((assignment) =>
      assignment.landmarkId === "central-effigy"
    ) ?? false
  if (!hasEffigyWorker) return { state }
  return {
    message:
      "An effigy worker shrugs at the empty tool loop. “Patch Bay already wrote that hammer off. The blue-notched one may never have made it here.”",
    state: withCampground(state, {
      ...campground,
      toolFavor: transitionCampgroundFavor(favor, "complete", {
        requiredItemKey: toolKey,
        rewardGranted: true
      })
    })
  }
}

const repairProgressEntities = (
  state: GameState
): ProgressEntityRepair => {
  const flagRepaired = repairMissingFlag(state)
  return repairBorrowedTool(flagRepaired)
}

const reconcileHeldItems = (
  state: GameState
): { readonly recoveredFlag: boolean; readonly state: GameState } => {
  const campground = state.campground
  if (campground === undefined) return { recoveredFlag: false, state }
  let next = state
  let nextCampground = campground

  const toolFavor = campground.toolFavor
  const toolCanAdvance = toolFavor?.phase === "offered"
    || toolFavor?.phase === "active"
  const requiredToolKey = toolFavor?.requiredItemKey
  const heldTool = !toolCanAdvance || requiredToolKey === undefined
    ? undefined
    : heldEntityByKey(
      state,
      requiredToolKey,
      (entity) =>
        entity.key === requiredToolKey && entity._tag === "hammer"
    )
  if (
    heldTool !== undefined
    && toolFavor !== undefined
  ) {
    nextCampground = {
      ...nextCampground,
      toolFavor: transitionCampgroundFavor(
        toolFavor,
        "ready"
      )
    }
  }

  const waterFavor = campground.waterFavor
  const waterCanAdvance = waterFavor?.phase === "offered"
    || waterFavor?.phase === "active"
  const heldWater = waterCanAdvance
    ? heldEntity(state, ({ _tag }) => _tag === "water")
    : undefined
  if (
    heldWater !== undefined
    && waterFavor !== undefined
  ) {
    nextCampground = {
      ...nextCampground,
      waterFavor: transitionCampgroundFavor(
        waterFavor,
        "ready"
      )
    }
  }

  const flagKey = campground.missingFlagKey
  const flagCanAdvance = campground.missingFlagPhase !== "flag-retrieved"
    && campground.missingFlagPhase !== "returned"
  const heldFlag = !flagCanAdvance || flagKey === undefined
    ? undefined
    : heldEntityByKey(
      state,
      flagKey,
      (entity) => entity.key === flagKey && entity._tag === "flag"
    )
  const recoveredFlag = heldFlag !== undefined
  if (recoveredFlag) {
    nextCampground = {
      ...nextCampground,
      missingFlagPhase: "flag-retrieved"
    }
  }

  next = withCampground(next, nextCampground)
  return { recoveredFlag, state: next }
}

export const reconcileCampgroundProgress = (
  state: GameState,
  options: ReconcileCampgroundProgressOptions = {}
): GameState => {
  const normalized = withStableProgressKeys(
    normalizeCampgroundState(state)
  )
  const repaired = repairProgressEntities(normalized)
  const reconciled = reconcileHeldItems(repaired.state)
  const message = reconciled.recoveredFlag
    ? "The folded flag has the same worn stitching people have been whispering about."
    : repaired.message
  return message !== undefined && options.emitMessages !== false
    ? appendProgressMessage(
      reconciled.state,
      message
    )
    : reconciled.state
}

const completeWelcomeFavor = (
  state: GameState,
  npc: Entity
): CampgroundConversationProgress => {
  const campground = state.campground
  const welcome = campground?.welcomeFavor
  if (
    campground === undefined
    || welcome === undefined
    || welcome.phase === "unavailable"
    || welcome.phase === "completed"
  ) return { handled: false, state }

  let next = grantUniqueReward(
    state,
    CAMPGROUND_WELCOME_REWARD_KEY,
    "pancake"
  )
  next = markCampgroundDiscovery(next, WELCOME_CAMP_ID)
  const nextCampground = next.campground
  if (nextCampground === undefined) return { handled: false, state }
  next = withCampground(next, {
    ...nextCampground,
    missingFlagPhase: nextCampground.missingFlagPhase === "seeking-rumors"
      ? "temple-lead"
      : nextCampground.missingFlagPhase,
    welcomeFavor: transitionCampgroundFavor(welcome, "complete", {
      recipientNpcKey: npc.key,
      rewardGranted: true
    })
  })
  const camp = getCampgroundCamp(WELCOME_CAMP_ID)
  const address = camp === undefined
    ? "the camp sign"
    : formatCampgroundAddress(camp.address)
  return {
    handled: true,
    message:
      `“So the gate lantern is lit again. Good.” The host passes you a pancake, then adds quietly, “The flag talk started near the temple.” ${address} is painted on the sign beside you.`,
    state: next
  }
}

const handleToolFavor = (
  state: GameState,
  npc: Entity
): CampgroundConversationProgress => {
  const campground = state.campground
  if (campground === undefined) return { handled: false, state }
  const original = campground.toolFavor
    ?? { phase: "unavailable" as const }
  if (original.phase === "completed") return { handled: false, state }

  let favor = transitionCampgroundFavor(original, "activate", {
    giverNpcKey: original.giverNpcKey ?? npc.key,
    recipientNpcKey: original.recipientNpcKey ?? npc.key,
    requiredItemKey: original.requiredItemKey
      ?? CAMPGROUND_BORROWED_TOOL_KEY
  })
  let next = withCampground(state, { ...campground, toolFavor: favor })
  next = reconcileCampgroundProgress(next, { emitMessages: false })
  favor = next.campground?.toolFavor ?? favor
  const required = entityByKey(next, favor.requiredItemKey ?? "")
  const player = playerFrom(next)
  if (
    player !== undefined
    && required?._tag === "hammer"
    && required.in === player.key
  ) {
    next = transferEntity(next, required, npc)
    const current = next.campground
    if (current !== undefined) {
      next = withCampground(next, {
        ...current,
        missingFlagPhase: current.missingFlagPhase === "seeking-rumors"
          ? "temple-lead"
          : current.missingFlagPhase,
        toolFavor: transitionCampgroundFavor(favor, "complete", {
          recipientNpcKey: npc.key,
          rewardGranted: true
        })
      })
    }
    return {
      handled: true,
      message:
        "The effigy worker turns the battered hammer over once. “That is Patch Bay's, all right. Funny—the same dust was on the temple steps after the flags vanished.”",
      state: next
    }
  }

  return {
    handled: true,
    message:
      "An effigy worker squints at an empty tool loop. “Patch Bay's borrowed hammer never wandered back. It has two blue notches in the handle.”",
    state: next
  }
}

const handleWaterFavor = (
  state: GameState,
  npc: Entity
): CampgroundConversationProgress => {
  const campground = state.campground
  if (campground === undefined) return { handled: false, state }
  const original = campground.waterFavor
    ?? { phase: "unavailable" as const }
  if (original.phase === "completed") return { handled: false, state }

  let favor = transitionCampgroundFavor(original, "activate", {
    giverNpcKey: original.giverNpcKey ?? npc.key,
    recipientNpcKey: original.recipientNpcKey ?? npc.key
  })
  let next = withCampground(state, { ...campground, waterFavor: favor })
  next = reconcileCampgroundProgress(next, { emitMessages: false })
  favor = next.campground?.waterFavor ?? favor
  const water = heldEntity(next, ({ _tag }) => _tag === "water")
  if (water !== undefined) {
    next = transferEntity(next, water, npc)
    next = grantUniqueReward(
      next,
      CAMPGROUND_WATER_REWARD_KEY,
      "trailmix"
    )
    const current = next.campground
    if (current !== undefined) {
      next = withCampground(next, {
        ...current,
        waterFavor: transitionCampgroundFavor(favor, "complete", {
          recipientNpcKey: npc.key,
          rewardGranted: true
        })
      })
    }
    return {
      handled: true,
      message:
        "“Perfect timing.” The Pulse Dome host takes the water and presses a packet of trail mix into your hand. “People keep laughing about flags underground. I am not sure it is a joke.”",
      state: next
    }
  }

  return {
    handled: true,
    message:
      "The Pulse Dome host shakes an empty bottle. “The speakers are louder than thirst, unfortunately.”",
    state: next
  }
}

const returnMissingFlag = (
  state: GameState,
  npc: Entity
): CampgroundConversationProgress | undefined => {
  const campground = state.campground
  const player = playerFrom(state)
  const flagKey = campground?.missingFlagKey
  if (
    campground === undefined
    || player === undefined
    || flagKey === undefined
    || campground.missingFlagOwnerNpcKey !== npc.key
  ) return undefined
  const flag = entityByKey(state, flagKey)
  if (flag?._tag !== "flag" || flag.in !== player.key) return undefined

  const transferred = transferEntity(state, flag, npc)
  const current = transferred.campground
  if (current === undefined) return undefined
  return {
    handled: true,
    message:
      "The ranger recognizes the stitching immediately. “There you are. I wondered whether that flag would surface again.”",
    state: withCampground(transferred, {
      ...current,
      missingFlagPhase: "returned"
    })
  }
}

const greetAndStartRumors = (
  state: GameState,
  npc: Entity
): CampgroundConversationProgress => {
  const campground = state.campground
  if (campground === undefined) return { handled: false, state }
  const welcome = campground.welcomeFavor
    ?? { phase: "unavailable" as const }
  const alreadyStarted = campground.missingFlagPhase !== "not-started"
    && welcome.phase !== "unavailable"
    && welcome.phase !== "offered"
  if (alreadyStarted) return { handled: false, state }

  return {
    handled: true,
    message:
      "The ranger studies the mud plastered to you and winces. “You're alive. That's the good news. No, I don't know how you got here. If you can stand, tell The Dusty Spoon the gate lantern is lit again. And—some finished flags never came back from the temple side.”",
    state: withCampground(state, {
      ...campground,
      missingFlagOwnerNpcKey: campground.missingFlagOwnerNpcKey ?? npc.key,
      missingFlagPhase: campground.missingFlagPhase === "not-started"
        ? "seeking-rumors"
        : campground.missingFlagPhase,
      welcomeFavor: transitionCampgroundFavor(welcome, "activate", {
        giverNpcKey: welcome.giverNpcKey ?? npc.key
      })
    })
  }
}

export const progressCampgroundConversation = (
  state: GameState,
  player: Entity,
  npc: Entity,
  suppliedAssignment?: CampgroundNpcAssignment
): CampgroundConversationProgress => {
  const reconciled = reconcileCampgroundProgress(state, {
    emitMessages: false
  })
  const campground = reconciled.campground
  if (player._tag !== "player" || campground === undefined) {
    return { handled: false, state: reconciled }
  }
  const assignment = suppliedAssignment
    ?? assignmentFor(campground, npc.key)
  const returned = returnMissingFlag(reconciled, npc)
  if (returned !== undefined) return returned

  if (
    assignment?.role === "civic"
    && assignment.landmarkId === "arrival-plaza"
  ) return greetAndStartRumors(reconciled, npc)
  if (
    assignment?.role === "host" && assignment.campId === WELCOME_CAMP_ID
  ) {
    return completeWelcomeFavor(reconciled, npc)
  }
  if (
    assignment?.role === "civic"
    && assignment.landmarkId === "central-effigy"
  ) return handleToolFavor(reconciled, npc)
  if (assignment?.role === "host" && assignment.campId === WATER_CAMP_ID) {
    return handleWaterFavor(reconciled, npc)
  }
  return { handled: false, state: reconciled }
}
