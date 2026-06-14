import { describe, expect, it } from "@effect/vitest"
import { Effect, Logger } from "effect"
import { readFileSync } from "node:fs"
import { getLogs, logger, MAX_LOG_ENTRIES } from "../src/log.js"

const logSourcePath = new URL("../src/log.ts", import.meta.url)
const readLogSource = () => readFileSync(logSourcePath, "utf8")
const writeServerLog = (message: string): void => {
  Effect.runSync(
    Effect.log(message).pipe(
      Effect.provide(Logger.replace(Logger.defaultLogger, logger))
    )
  )
}

describe("getLogs", () => {
  it("returns a defensive snapshot of the current log entries", () => {
    const first = Effect.runSync(getLogs)
    const baseline = [...first]

    first.push("__mutated_returned_log_snapshot__")

    expect(Effect.runSync(getLogs)).toEqual(baseline)
  })

  it("keeps only the newest bounded log entries", () => {
    const markers = Array.from(
      { length: MAX_LOG_ENTRIES + 2 },
      (_, index) => `__bounded_server_log_entry_${index}__`
    )

    for (const marker of markers) {
      writeServerLog(marker)
    }

    const retainedNewestFirst = markers.slice(2).reverse()
    const snapshot = Effect.runSync(getLogs)

    expect(snapshot).toHaveLength(MAX_LOG_ENTRIES)
    expect(snapshot[0]).toBe(markers.at(-1))
    expect(snapshot).toEqual(retainedNewestFirst)
    expect(snapshot).not.toContain(markers[0])
    expect(snapshot).not.toContain(markers[1])
  })

  it("stores log entries without mutable array push", () => {
    expect(readLogSource()).not.toContain(".push(")
  })
})
