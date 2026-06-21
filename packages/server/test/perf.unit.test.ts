import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { existsSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  measureEffect,
  perfEnabled,
  recordPerfMeasurement
} from "../src/perf.js"

const withPerfEnv = <A>(env: NodeJS.ProcessEnv, fn: () => A): A => {
  const previousFile = process.env.FLAGHACK_PERF_FILE
  const previousStdout = process.env.FLAGHACK_PERF_STDOUT
  const previousRunId = process.env.FLAGHACK_PERF_RUN_ID
  if (env.FLAGHACK_PERF_FILE === undefined) {
    delete process.env.FLAGHACK_PERF_FILE
  } else {
    process.env.FLAGHACK_PERF_FILE = env.FLAGHACK_PERF_FILE
  }
  if (env.FLAGHACK_PERF_STDOUT === undefined) {
    delete process.env.FLAGHACK_PERF_STDOUT
  } else {
    process.env.FLAGHACK_PERF_STDOUT = env.FLAGHACK_PERF_STDOUT
  }
  if (env.FLAGHACK_PERF_RUN_ID === undefined) {
    delete process.env.FLAGHACK_PERF_RUN_ID
  } else {
    process.env.FLAGHACK_PERF_RUN_ID = env.FLAGHACK_PERF_RUN_ID
  }
  try {
    return fn()
  } finally {
    if (previousFile === undefined) {
      delete process.env.FLAGHACK_PERF_FILE
    } else {
      process.env.FLAGHACK_PERF_FILE = previousFile
    }
    if (previousStdout === undefined) {
      delete process.env.FLAGHACK_PERF_STDOUT
    } else {
      process.env.FLAGHACK_PERF_STDOUT = previousStdout
    }
    if (previousRunId === undefined) {
      delete process.env.FLAGHACK_PERF_RUN_ID
    } else {
      process.env.FLAGHACK_PERF_RUN_ID = previousRunId
    }
  }
}

const makePerfPath = () =>
  join(mkdtempSync(join(tmpdir(), "flaghack-perf-")), "perf.ndjson")

const readRecords = (path: string) =>
  readFileSync(path, "utf8")
    .trim()
    .split(/\r?\n/u)
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>)

describe("server perf instrumentation", () => {
  it("is disabled unless a perf destination is configured", () => {
    withPerfEnv({}, () => {
      expect(perfEnabled()).toBe(false)
    })
  })

  it("emits successful Effect measurements with wall and CPU time", () => {
    const path = makePerfPath()
    const result = withPerfEnv(
      { FLAGHACK_PERF_FILE: path },
      () =>
        Effect.runPromise(
          measureEffect(
            {
              counts: (value: number) => ({ value }),
              operation: "test.operation",
              phase: "success",
              traceId: "trace-1"
            },
            Effect.succeed(7)
          )
        )
    )

    return result.then((value) => {
      expect(value).toBe(7)
      const [record] = readRecords(path)
      expect(record?.kind).toBe("flaghack-perf")
      expect(record?.schema).toBe(1)
      expect(record?.source).toBe("server")
      expect(record?.operation).toBe("test.operation")
      expect(record?.phase).toBe("success")
      expect(record?.traceId).toBe("trace-1")
      expect(record?.ok).toBe(true)
      expect(record?.durationNs).toEqual(expect.any(Number))
      expect(record?.cpuUserMicros).toEqual(expect.any(Number))
      expect(record?.cpuSystemMicros).toEqual(expect.any(Number))
      expect(record?.counts).toEqual({ value: 7 })
    })
  })

  it("emits failed Effect measurements without swallowing the failure", async () => {
    const path = makePerfPath()
    await expect(
      withPerfEnv({ FLAGHACK_PERF_FILE: path }, () =>
        Effect.runPromise(
          measureEffect(
            { operation: "test.operation", phase: "failure" },
            Effect.fail("boom")
          )
        ))
    ).rejects.toThrow(/boom/)

    const [record] = readRecords(path)
    expect(record?.ok).toBe(false)
    expect(record?.operation).toBe("test.operation")
    expect(record?.phase).toBe("failure")
    expect(String(record?.error)).toContain("boom")
  })

  it("does not create files when recording is disabled", () => {
    const path = makePerfPath()
    withPerfEnv({}, () => {
      Effect.runSync(
        recordPerfMeasurement({ operation: "disabled", source: "server" })
      )
    })
    expect(existsSync(path)).toBe(false)
  })
})
