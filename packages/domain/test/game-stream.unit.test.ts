import { describe, expect, it } from "@effect/vitest"
import {
  ClientStateStreamEvent,
  ClientStateStreamEventName,
  GameStateStreamPath
} from "@flaghack/domain/GameStream"
import { HashMap, Schema } from "effect"

const emptyClientState = {
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
    const encoded = Schema.encodeSync(ClientStateStreamEvent)({
      clientState: {
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
      clientState: emptyClientState,
      previousRevision: 0,
      revision: 1,
      source: "action"
    })
  })
})
