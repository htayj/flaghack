import type {
  GameplayEvent as GameplayEventSchema,
  GameplayEventKind as GameplayEventKindSchema,
  GameState as GameStateSchema
} from "@flaghack/domain/schemas"

type GameState = typeof GameStateSchema.Type
type GameplayEvent = typeof GameplayEventSchema.Type
type GameplayEventKind = typeof GameplayEventKindSchema.Type

export const GAMEPLAY_EVENT_LIMIT = 50

export interface AppendGameplayEventOptions {
  readonly interruptsTravel?: boolean
  readonly kind?: GameplayEventKind
}

const latestGameplayEventId = (state: GameState): number =>
  (state.gameplayEvents ?? []).reduce(
    (latest, event) => Math.max(latest, event.id),
    state.nextGameplayEventId ?? 0
  )

export const appendGameplayEvent = (
  state: GameState,
  message: string,
  options: AppendGameplayEventOptions = {}
): GameState => {
  const id = latestGameplayEventId(state) + 1
  const event: GameplayEvent = {
    id,
    message,
    ...(options.interruptsTravel === undefined
      ? {}
      : { interruptsTravel: options.interruptsTravel }),
    ...(options.kind === undefined ? {} : { kind: options.kind })
  }
  const gameplayEvents = [...(state.gameplayEvents ?? []), event].slice(
    -GAMEPLAY_EVENT_LIMIT
  )

  return {
    ...state,
    gameplayEvents,
    nextGameplayEventId: id
  }
}

export const latestGameplayEvent = (
  state: GameState
): GameplayEvent | undefined => state.gameplayEvents?.at(-1)
