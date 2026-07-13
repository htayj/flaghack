import { describe, expect, it } from "@effect/vitest"
import { GameState } from "@flaghack/domain/schemas"
import { HashMap } from "effect"
import {
  appendGameplayEvent,
  GAMEPLAY_EVENT_LIMIT,
  latestGameplayEvent
} from "../src/gameplayEvents.js"

describe("gameplay events", () => {
  it("appends monotonic events and honors existing history ids", () => {
    const initial = GameState.make({
      gameplayEvents: [{ id: 7, message: "older" }],
      world: HashMap.empty()
    })
    const next = appendGameplayEvent(initial, "newer")

    expect(next.nextGameplayEventId).toBe(8)
    expect(latestGameplayEvent(next)).toEqual({ id: 8, message: "newer" })
  })

  it("marks ambience as non-interrupting without changing event defaults", () => {
    const initial = GameState.make({ world: HashMap.empty() })
    const ordinary = appendGameplayEvent(initial, "someone speaks")
    const ambient = appendGameplayEvent(ordinary, "distant laughter", {
      interruptsTravel: false
    })

    expect(ordinary.gameplayEvents?.at(-1)?.interruptsTravel)
      .toBeUndefined()
    expect(ambient.gameplayEvents?.at(-1)).toEqual({
      id: 2,
      interruptsTravel: false,
      message: "distant laughter"
    })
  })

  it("keeps bounded history without resetting the id sequence", () => {
    const initial = GameState.make({ world: HashMap.empty() })
    const next = Array.from(
      { length: GAMEPLAY_EVENT_LIMIT + 5 },
      (_, index) => `event ${index + 1}`
    ).reduce(
      (state, message) => appendGameplayEvent(state, message),
      initial
    )

    expect(next.gameplayEvents).toHaveLength(GAMEPLAY_EVENT_LIMIT)
    expect(next.gameplayEvents?.[0]?.id).toBe(6)
    expect(latestGameplayEvent(next)?.id).toBe(GAMEPLAY_EVENT_LIMIT + 5)
  })
})
