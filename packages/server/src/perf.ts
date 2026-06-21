import { Cause, Effect, Exit } from "effect"
import { appendFileSync } from "node:fs"

export const PERF_KIND = "flaghack-perf" as const
export const PERF_SCHEMA = 1 as const

type PerfScalar = number | string | boolean

export type PerfCounts = Readonly<Record<string, PerfScalar>>

export type PerfRecord = {
  readonly schema: typeof PERF_SCHEMA
  readonly kind: typeof PERF_KIND
  readonly source: string
  readonly suite?: string | undefined
  readonly operation: string
  readonly phase?: string | undefined
  readonly case?: string | undefined
  readonly traceId?: string | undefined
  readonly durationNs?: number | undefined
  readonly cpuUserMicros?: number | undefined
  readonly cpuSystemMicros?: number | undefined
  readonly counts?: PerfCounts | undefined
  readonly ok?: boolean | undefined
  readonly error?: string | undefined
  readonly timestamp?: string | undefined
  readonly runId?: string | undefined
}

export type PerfMeasureOptions<A = unknown> = {
  readonly source?: string | undefined
  readonly suite?: string | undefined
  readonly operation: string
  readonly phase?: string | undefined
  readonly caseName?: string | undefined
  readonly traceId?: string | undefined
  readonly counts?: PerfCounts | ((value: A) => PerfCounts) | undefined
}

let traceCounter = 0

const normalizeEnvValue = (value: string | undefined) => {
  const trimmed = value?.trim()
  return trimmed === "" ? undefined : trimmed
}

const perfFile = () => normalizeEnvValue(process.env.FLAGHACK_PERF_FILE)

const perfStdoutEnabled = () => {
  const value = normalizeEnvValue(process.env.FLAGHACK_PERF_STDOUT)
  return value === "1" || value === "true" || value === "yes"
}

const perfRunId = () => normalizeEnvValue(process.env.FLAGHACK_PERF_RUN_ID)

export const perfEnabled = () =>
  perfFile() !== undefined || perfStdoutEnabled()

export const makePerfTraceId = (prefix = "server") => {
  traceCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${traceCounter}`
}

const completeRecord = (
  record: Omit<PerfRecord, "kind" | "schema">
): PerfRecord => ({
  schema: PERF_SCHEMA,
  kind: PERF_KIND,
  timestamp: new Date().toISOString(),
  ...record,
  runId: record.runId ?? perfRunId()
})

export const recordPerfMeasurement = (
  record: Omit<PerfRecord, "kind" | "schema">
): Effect.Effect<void> =>
  Effect.sync(() => {
    if (!perfEnabled()) return
    const line = `${JSON.stringify(completeRecord(record))}\n`
    const path = perfFile()
    if (path !== undefined) {
      appendFileSync(path, line, "utf8")
    }
    if (perfStdoutEnabled()) {
      process.stdout.write(`FLAGHACK_PERF ${line}`)
    }
  })

const countsForValue = <A>(
  counts: PerfMeasureOptions<A>["counts"],
  value: A
): PerfCounts | undefined =>
  typeof counts === "function" ? counts(value) : counts

const errorMessage = <E>(cause: Cause.Cause<E>) => Cause.pretty(cause)

export const measureEffect = <A, E, R>(
  options: PerfMeasureOptions<A>,
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> =>
  Effect.gen(function*() {
    if (!perfEnabled()) {
      return yield* effect
    }

    const startedAt = process.hrtime.bigint()
    const startedCpu = process.cpuUsage()
    const exit = yield* Effect.exit(effect)
    const cpu = process.cpuUsage(startedCpu)
    const durationNs = Number(process.hrtime.bigint() - startedAt)

    if (Exit.isSuccess(exit)) {
      yield* recordPerfMeasurement({
        case: options.caseName,
        counts: countsForValue(options.counts, exit.value),
        cpuSystemMicros: cpu.system,
        cpuUserMicros: cpu.user,
        durationNs,
        ok: true,
        operation: options.operation,
        phase: options.phase,
        source: options.source ?? "server",
        suite: options.suite,
        traceId: options.traceId
      })
      return exit.value
    }

    yield* recordPerfMeasurement({
      case: options.caseName,
      cpuSystemMicros: cpu.system,
      cpuUserMicros: cpu.user,
      durationNs,
      error: errorMessage(exit.cause),
      ok: false,
      operation: options.operation,
      phase: options.phase,
      source: options.source ?? "server",
      suite: options.suite,
      traceId: options.traceId
    })
    return yield* Effect.failCause(exit.cause)
  })

export const measureSync = <A>(
  options: PerfMeasureOptions<A>,
  fn: () => A
): A => {
  if (!perfEnabled()) return fn()

  const startedAt = process.hrtime.bigint()
  const startedCpu = process.cpuUsage()
  try {
    const value = fn()
    const cpu = process.cpuUsage(startedCpu)
    Effect.runSync(recordPerfMeasurement({
      case: options.caseName,
      counts: countsForValue(options.counts, value),
      cpuSystemMicros: cpu.system,
      cpuUserMicros: cpu.user,
      durationNs: Number(process.hrtime.bigint() - startedAt),
      ok: true,
      operation: options.operation,
      phase: options.phase,
      source: options.source ?? "server",
      suite: options.suite,
      traceId: options.traceId
    }))
    return value
  } catch (error) {
    const cpu = process.cpuUsage(startedCpu)
    Effect.runSync(recordPerfMeasurement({
      case: options.caseName,
      cpuSystemMicros: cpu.system,
      cpuUserMicros: cpu.user,
      durationNs: Number(process.hrtime.bigint() - startedAt),
      error: error instanceof Error ? error.message : String(error),
      ok: false,
      operation: options.operation,
      phase: options.phase,
      source: options.source ?? "server",
      suite: options.suite,
      traceId: options.traceId
    }))
    throw error
  }
}
