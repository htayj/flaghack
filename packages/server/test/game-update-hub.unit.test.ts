import { describe, expect, it } from "@effect/vitest"
import { ClientStateStreamEventName } from "@flaghack/domain/GameStream"
import { Effect, HashMap, Stream } from "effect"
import {
  encodeClientStateSseEvent,
  GameUpdateHub
} from "../src/GameUpdateHub.js"

const emptyClientState = {
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
    const sse = encodeClientStateSseEvent({
      clientState: emptyClientState,
      previousRevision: 0,
      revision: 1,
      source: "action"
    })

    expect(sse).toContain("id: 1\n")
    expect(sse).toContain(`event: ${ClientStateStreamEventName}\n`)
    expect(sse).toContain("data: ")
    expect(sse.endsWith("\n\n")).toBe(true)
  })
})
