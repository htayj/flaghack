import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { getLogs } from "../src/log.js"

describe("getLogs", () => {
  it("returns a defensive snapshot of the current log entries", () => {
    const first = Effect.runSync(getLogs)
    const baseline = [...first]

    first.push("__mutated_returned_log_snapshot__")

    expect(Effect.runSync(getLogs)).toEqual(baseline)
  })
})
