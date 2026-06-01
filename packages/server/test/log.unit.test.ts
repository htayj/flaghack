import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { readFileSync } from "node:fs"
import { getLogs } from "../src/log.js"

const logSourcePath = new URL("../src/log.ts", import.meta.url)
const readLogSource = () => readFileSync(logSourcePath, "utf8")

describe("getLogs", () => {
  it("returns a defensive snapshot of the current log entries", () => {
    const first = Effect.runSync(getLogs)
    const baseline = [...first]

    first.push("__mutated_returned_log_snapshot__")

    expect(Effect.runSync(getLogs)).toEqual(baseline)
  })

  it("stores log entries without mutable array push", () => {
    expect(readLogSource()).not.toContain(".push(")
  })
})
