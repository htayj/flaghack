#!/usr/bin/env tsx

import { readFileSync } from "node:fs"
import { PERF_KIND, PERF_SCHEMA, type PerfRecord } from "./perf-output.js"

type Requirement = Readonly<Record<string, string>>

const usage = () =>
  "usage: tsx scripts/validate-perf-output.ts <perf.ndjson> [--require key=value[,key=value...]]..."

const parseRequirement = (raw: string): Requirement => {
  const entries = raw.split(",").filter((entry) => entry.trim() !== "")
    .map(
      (entry) => {
        const [key, ...valueParts] = entry.split("=")
        const value = valueParts.join("=")
        if (
          key === undefined || key.trim() === "" || value.trim() === ""
        ) {
          throw new Error(
            `invalid --require filter ${raw}; expected key=value pairs`
          )
        }
        return [key.trim(), value.trim()] as const
      }
    )
  if (entries.length === 0) {
    throw new Error("--require needs at least one key=value filter")
  }
  return Object.fromEntries(entries)
}

const parseArgs = (argv: ReadonlyArray<string>) => {
  const [file, ...rest] = argv
  if (file === undefined || file === "--help" || file === "-h") {
    throw new Error(usage())
  }
  const requirements: Array<Requirement> = []
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index]
    if (arg !== "--require") {
      throw new Error(`unknown argument ${arg}\n${usage()}`)
    }
    const value = rest[index + 1]
    if (value === undefined) {
      throw new Error(`missing value for --require\n${usage()}`)
    }
    requirements.push(parseRequirement(value))
    index += 1
  }
  return { file, requirements } as const
}

const valueAtPath = (record: PerfRecord, key: string): unknown =>
  key.split(".").reduce<unknown>((current, part) => {
    if (current === null || typeof current !== "object") return undefined
    return (current as Record<string, unknown>)[part]
  }, record)

const matchesRequirement = (
  record: PerfRecord,
  requirement: Requirement
) =>
  Object.entries(requirement).every(([key, value]) =>
    String(valueAtPath(record, key)) === value
  )

const assertPerfRecord = (
  record: unknown,
  lineNumber: number
): PerfRecord => {
  if (record === null || typeof record !== "object") {
    throw new Error(`line ${lineNumber}: expected JSON object`)
  }
  const candidate = record as Partial<PerfRecord>
  if (candidate.schema !== PERF_SCHEMA) {
    throw new Error(`line ${lineNumber}: expected schema ${PERF_SCHEMA}`)
  }
  if (candidate.kind !== PERF_KIND) {
    throw new Error(`line ${lineNumber}: expected kind ${PERF_KIND}`)
  }
  if (typeof candidate.source !== "string" || candidate.source === "") {
    throw new Error(
      `line ${lineNumber}: source must be a non-empty string`
    )
  }
  if (
    typeof candidate.operation !== "string" || candidate.operation === ""
  ) {
    throw new Error(
      `line ${lineNumber}: operation must be a non-empty string`
    )
  }
  if (
    candidate.durationNs !== undefined
    && (!Number.isFinite(candidate.durationNs) || candidate.durationNs < 0)
  ) {
    throw new Error(
      `line ${lineNumber}: durationNs must be a non-negative number`
    )
  }
  if (
    candidate.durationNs !== undefined
    && candidate.operation !== "frontend.response_received"
    && candidate.durationNs === 0
  ) {
    throw new Error(
      `line ${lineNumber}: timed records must have positive durationNs`
    )
  }
  if (
    candidate.cpuUserMicros !== undefined
    && (!Number.isFinite(candidate.cpuUserMicros)
      || candidate.cpuUserMicros < 0)
  ) {
    throw new Error(
      `line ${lineNumber}: cpuUserMicros must be a non-negative number`
    )
  }
  if (
    candidate.cpuSystemMicros !== undefined
    && (!Number.isFinite(candidate.cpuSystemMicros)
      || candidate.cpuSystemMicros < 0)
  ) {
    throw new Error(
      `line ${lineNumber}: cpuSystemMicros must be a non-negative number`
    )
  }
  return candidate as PerfRecord
}

const run = () => {
  const { file, requirements } = parseArgs(process.argv.slice(2))
  const lines = readFileSync(file, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim() !== "")
  const records = lines.map((line, index) => {
    try {
      return assertPerfRecord(JSON.parse(line), index + 1)
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(
          `line ${index + 1}: malformed JSON: ${error.message}`
        )
      }
      throw error
    }
  })

  for (const requirement of requirements) {
    if (
      !records.some((record) => matchesRequirement(record, requirement))
    ) {
      throw new Error(
        `missing required perf record: ${JSON.stringify(requirement)}`
      )
    }
  }

  console.log(
    `validated ${records.length} perf records from ${file}${
      requirements.length === 0
        ? ""
        : ` (${requirements.length} requirements)`
    }`
  )
}

try {
  run()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
