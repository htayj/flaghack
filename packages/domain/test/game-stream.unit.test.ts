import { describe, expect, it } from "@effect/vitest"
import {
  ClientStateStreamEvent,
  ClientStateStreamEventName,
  GameStateStreamPath
} from "@flaghack/domain/GameStream"
import { HashMap, Schema } from "effect"

const emptyClientState = {
  campground: { discoveredLandmarks: [] },
  gameplayEvents: [],
  inventory: [],
  roles: [],
  setup: { phase: "complete" },
  world: []
} as const

describe("game state stream contract", () => {
  it("uses a stable SSE route and event name", () => {
    expect(GameStateStreamPath).toBe("/client-state/stream")
    expect(ClientStateStreamEventName).toBe("client-state")
  })

  it("encodes revisioned client-state snapshots", () => {
    const campground = {
      currentAddress: "Gate and Main Road",
      discoveredLandmarks: [{
        address: "Gate and Main Road",
        at: { x: 96, y: 120, z: 0 },
        id: "arrival-plaza",
        kind: "civic",
        name: "Arrival Plaza",
        travelAvailable: true
      }],
      weather: { condition: "heavy-rain" as const }
    }
    const gameplayEvents = [{
      id: 7,
      kind: "arrival-narration" as const,
      message: "You wake face down in a puddle of mud."
    }]
    const encoded = Schema.encodeSync(ClientStateStreamEvent)({
      clientState: {
        campground,
        gameplayEvents,
        inventory: HashMap.empty(),
        roles: [],
        setup: { phase: "complete" },
        world: HashMap.empty()
      },
      previousRevision: 0,
      revision: 1,
      source: "action"
    })

    expect(encoded).toEqual({
      clientState: {
        ...emptyClientState,
        campground,
        gameplayEvents
      },
      previousRevision: 0,
      revision: 1,
      source: "action"
    })
    expect(encoded.clientState.gameplayEvents).toEqual(gameplayEvents)
    expect(encoded.clientState.campground).toEqual(campground)
  })
})
