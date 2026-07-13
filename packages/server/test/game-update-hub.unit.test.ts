import { describe, expect, it } from "@effect/vitest"
import {
  ClientStateStreamEvent,
  ClientStateStreamEventName
} from "@flaghack/domain/GameStream"
import { Effect, HashMap, Schema, Stream } from "effect"
import {
  encodeClientStateSseEvent,
  GameUpdateHub
} from "../src/GameUpdateHub.js"

const emptyClientState = {
  campground: { discoveredLandmarks: [] },
  gameplayEvents: [],
  inventory: HashMap.empty(),
  roles: [],
  setup: { phase: "complete" as const },
  world: HashMap.empty()
}

describe("GameUpdateHub", () => {
  it("starts at revision zero and publishes ordered revisioned snapshots", async () => {
    const program = Effect.gen(function*() {
      const hub = yield* GameUpdateHub
      const updates = hub.clientStateEvents
      const collect = Stream.runCollect(Stream.take(updates, 2))

      const fiber = yield* Effect.fork(collect)
      yield* Effect.yieldNow()
      const initialRevision = yield* hub.currentRevision
      const first = yield* hub.publishClientState(
        "action",
        emptyClientState
      )
      const second = yield* hub.publishClientState(
        "restore",
        emptyClientState
      )
      const received = yield* Effect.fromFiber(fiber)
      const finalRevision = yield* hub.currentRevision

      return {
        finalRevision,
        first,
        initialRevision,
        received: Array.from(received),
        second
      }
    })

    const result = await Effect.runPromise(
      program.pipe(Effect.provide(GameUpdateHub.Default))
    )

    expect(result.initialRevision).toBe(0)
    expect(result.finalRevision).toBe(2)
    expect(result.first).toMatchObject({
      previousRevision: 0,
      revision: 1,
      source: "action"
    })
    expect(result.second).toMatchObject({
      previousRevision: 1,
      revision: 2,
      source: "restore"
    })
    expect(result.received.map((event) => event.revision)).toEqual([1, 2])
  })

  it("formats snapshots as SSE events", () => {
    const gameplayEvents = [{
      id: 3,
      message: "You hear distant hippies talking."
    }]
    const sse = encodeClientStateSseEvent({
      clientState: { ...emptyClientState, gameplayEvents },
      previousRevision: 0,
      revision: 1,
      source: "action"
    })

    expect(sse).toContain("id: 1\n")
    expect(sse).toContain(`event: ${ClientStateStreamEventName}\n`)
    expect(sse).toContain("data: ")
    expect(sse.endsWith("\n\n")).toBe(true)

    const dataLine = sse.split("\n").find((line) =>
      line.startsWith("data: ")
    )
    expect(dataLine).toBeDefined()
    const payload = JSON.parse(
      dataLine?.slice("data: ".length) ?? "{}"
    ) as {
      clientState?: { campground?: unknown; gameplayEvents?: unknown }
    }
    expect(payload.clientState?.campground).toEqual({
      discoveredLandmarks: []
    })
    expect(payload.clientState?.gameplayEvents).toEqual(gameplayEvents)
  })

  it("matches the domain schema wire encoding for nonempty snapshots", () => {
    const carriedWater = {
      _tag: "water" as const,
      at: { x: 2, y: 3, z: 0 },
      in: "player",
      key: "water-1"
    }
    const floor = {
      _tag: "floor" as const,
      at: { x: 2, y: 3, z: 0 },
      in: "world",
      key: "floor-2-3"
    }
    const event: typeof ClientStateStreamEvent.Type = {
      clientState: {
        ...emptyClientState,
        inventory: HashMap.make([carriedWater.key, carriedWater]),
        world: HashMap.make([floor.key, floor])
      },
      previousRevision: 6,
      revision: 7,
      source: "quit",
      terminal: "quit"
    }
    const sse = encodeClientStateSseEvent(event)
    const dataLine = sse.split("\n").find((line) =>
      line.startsWith("data: ")
    )

    expect(dataLine).toBeDefined()
    expect(JSON.parse(dataLine?.slice("data: ".length) ?? "{}"))
      .toEqual(Schema.encodeSync(ClientStateStreamEvent)(event))
  })
})
