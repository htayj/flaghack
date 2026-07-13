import type { GameState as GameStateSchema } from "@flaghack/domain/schemas"
import { Effect, HashMap, Random } from "effect"
import { campgroundCamps } from "./campground.js"
import { advanceCampgroundAtmosphere } from "./campgroundAtmosphere.js"
import { appendGameplayEvent } from "./gameplayEvents.js"

type GameState = typeof GameStateSchema.Type

const FIRST_DUNGEON_LEVEL = 1
const TUNNEL_HIPPIE_SPEECH_DISTANCE = 3
const FIRST_AMBIENT_DELAY_MIN = 6
const FIRST_AMBIENT_DELAY_MAX = 12
const AMBIENT_DELAY_MIN = 10
const AMBIENT_DELAY_MAX = 18
const DUNGEON_ATMOSPHERE_SEED = 77_013

export const firstDungeonAmbientSounds = [
  "You hear hippies grumbling in the tunnels.",
  "You hear distant hippies talking.",
  "You hear hippies laughing somewhere in the tunnels."
] as const

export const tunnelHippieFlagDialogue =
  "The hippie says, \"Have you seen my flag? I think I left it somewhere down here.\""

export const tunnelHippieWrongTurnDialogue = (campName: string): string =>
  `The hippie says, "I think I took a wrong turn. Do you know where ${campName} is?"`

const fallbackCampName = "Camp Type Safety"

const positionKey = ({
  x,
  y,
  z
}: {
  readonly x: number
  readonly y: number
  readonly z: number
}): string => `${x},${y},${z}`

const manhattanDistance = (
  left: { readonly x: number; readonly y: number; readonly z: number },
  right: { readonly x: number; readonly y: number; readonly z: number }
): number =>
  left.z === right.z
    ? Math.abs(left.x - right.x) + Math.abs(left.y - right.y)
    : Number.POSITIVE_INFINITY

const clearDungeonAmbientSchedule = (state: GameState): GameState => {
  const { nextDungeonAmbientTurn, ...withoutSchedule } = state
  return nextDungeonAmbientTurn === undefined ? state : withoutSchedule
}

const randomIntInclusive = (
  min: number,
  max: number
): Effect.Effect<number> => Random.nextIntBetween(min, max + 1)

const dungeonEntities = (state: GameState) =>
  Array.from(state.world.pipe(HashMap.values))

const generatedCampNames = (state: GameState): ReadonlyArray<string> => {
  const signNames = new Set(
    dungeonEntities(state)
      .flatMap((entity) =>
        entity._tag === "sign"
          && entity.in === "world"
          && entity.at.z === 0
          && entity.name.trim().length > 0
          ? [entity.name]
          : []
      )
  )
  const names = campgroundCamps.filter((camp) =>
    [...signNames].some((signName) =>
      signName === camp.name || signName.startsWith(`${camp.name} —`)
    )
  ).map(({ name }) => name).sort((a, b) => a.localeCompare(b))

  return names.length === 0 ? [fallbackCampName] : names
}

const nearbyUngreetedTunnelHippies = (state: GameState) => {
  const entities = dungeonEntities(state)
  const player = entities.find((entity) =>
    entity._tag === "player" && entity.in === "world"
  )
  if (player === undefined || player.at.z !== FIRST_DUNGEON_LEVEL) {
    return { candidates: [], player }
  }

  const tunnelPositions = new globalThis.Set(
    entities.filter((entity) =>
      entity._tag === "tunnel"
      && entity.in === "world"
      && entity.at.z === FIRST_DUNGEON_LEVEL
    ).map((entity) => positionKey(entity.at))
  )
  const greetedKeys = new globalThis.Set(
    state.greetedTunnelHippieKeys ?? []
  )
  const candidates = entities.filter((entity) =>
    entity._tag === "hippie"
    && entity.in === "world"
    && entity.at.z === FIRST_DUNGEON_LEVEL
    && tunnelPositions.has(positionKey(entity.at))
    && !greetedKeys.has(entity.key)
    && manhattanDistance(player.at, entity.at)
      <= TUNNEL_HIPPIE_SPEECH_DISTANCE
  ).sort((left, right) => {
    const distanceDifference = manhattanDistance(player.at, left.at)
      - manhattanDistance(player.at, right.at)
    return distanceDifference === 0
      ? left.key.localeCompare(right.key)
      : distanceDifference
  })

  return { candidates, player }
}

const advanceFirstDungeonAtmosphere = (
  state: GameState,
  turn: number
): Effect.Effect<GameState> =>
  Effect.gen(function*() {
    const { candidates, player } = nearbyUngreetedTunnelHippies(state)
    if (player === undefined || player.at.z !== FIRST_DUNGEON_LEVEL) {
      return clearDungeonAmbientSchedule(state)
    }

    const nearbyHippie = candidates.at(0)
    if (nearbyHippie !== undefined) {
      const dialogueIndex = yield* randomIntInclusive(0, 1)
      const camps = generatedCampNames(state)
      const campIndex = yield* randomIntInclusive(0, camps.length - 1)
      const campName = camps.at(campIndex) ?? fallbackCampName
      const message = dialogueIndex === 0
        ? tunnelHippieFlagDialogue
        : tunnelHippieWrongTurnDialogue(campName)
      const greetedTunnelHippieKeys = [
        ...(state.greetedTunnelHippieKeys ?? []),
        nearbyHippie.key
      ]
      const nextDungeonAmbientTurn = Math.max(
        state.nextDungeonAmbientTurn ?? 0,
        turn + FIRST_AMBIENT_DELAY_MIN
      )

      return appendGameplayEvent(
        {
          ...state,
          greetedTunnelHippieKeys,
          nextDungeonAmbientTurn
        },
        message
      )
    }

    if (state.nextDungeonAmbientTurn === undefined) {
      const delay = yield* randomIntInclusive(
        FIRST_AMBIENT_DELAY_MIN,
        FIRST_AMBIENT_DELAY_MAX
      )
      return { ...state, nextDungeonAmbientTurn: turn + delay }
    }

    if (turn < state.nextDungeonAmbientTurn) return state

    const soundIndex = yield* randomIntInclusive(
      0,
      firstDungeonAmbientSounds.length - 1
    )
    const delay = yield* randomIntInclusive(
      AMBIENT_DELAY_MIN,
      AMBIENT_DELAY_MAX
    )
    const sound = firstDungeonAmbientSounds.at(soundIndex)
      ?? firstDungeonAmbientSounds[0]

    return appendGameplayEvent(
      { ...state, nextDungeonAmbientTurn: turn + delay },
      sound,
      { interruptsTravel: false }
    )
  }).pipe(
    Effect.withRandom(Random.make(DUNGEON_ATMOSPHERE_SEED + turn))
  )

export const advanceWorldAtmosphere = (
  state: GameState
): Effect.Effect<GameState> => {
  const turn = (state.turn ?? 0) + 1
  const advanced = { ...state, turn }
  const player = dungeonEntities(advanced).find((entity) =>
    entity._tag === "player" && entity.in === "world"
  )

  if (player?.at.z === 0) {
    return Effect.succeed(
      advanceCampgroundAtmosphere(
        clearDungeonAmbientSchedule(advanced),
        turn
      )
    )
  }
  if (player?.at.z === FIRST_DUNGEON_LEVEL) {
    return advanceFirstDungeonAtmosphere(advanced, turn)
  }
  return Effect.succeed(clearDungeonAmbientSchedule(advanced))
}

/** Compatibility alias for callers that have not adopted the world dispatcher. */
export const advanceDungeonAtmosphere = advanceWorldAtmosphere
