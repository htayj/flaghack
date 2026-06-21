# Performance instrumentation

Flag Hack performance measurements are opt-in and machine-readable. They are emitted as newline-delimited JSON records so scripts can parse timings without scraping logs or terminal output.

## Enable metrics

Set one or both destinations before running a server, CLI, API smoke, or tmux gate:

```sh
perf_file=$(mktemp)
FLAGHACK_PERF_FILE=$perf_file pnpm test:api:bot
pnpm exec tsx scripts/validate-perf-output.ts "$perf_file" --require source=server,operation=backend.turn,phase=total
```

Environment variables:

- `FLAGHACK_PERF_FILE`: append raw NDJSON records to this file.
- `FLAGHACK_PERF_STDOUT=1`: also write records to stdout prefixed with `FLAGHACK_PERF`.
- `FLAGHACK_PERF_RUN_ID`: optional run identifier copied into each record.

The gameplay `/logs` endpoint is intentionally not the metrics transport. It is capped and human-oriented; perf consumers should read only records whose `kind` is `"flaghack-perf"`.

## Record schema

Each line is a single JSON object:

```json
{
  "schema": 1,
  "kind": "flaghack-perf",
  "source": "server",
  "suite": "api-smoke",
  "operation": "backend.turn",
  "phase": "total",
  "case": "move",
  "traceId": "turn.move-...",
  "durationNs": 123456,
  "cpuUserMicros": 120,
  "cpuSystemMicros": 4,
  "counts": { "worldSize": 5811 },
  "ok": true,
  "timestamp": "2026-06-15T00:00:00.000Z",
  "runId": "optional"
}
```

Stable fields:

- `schema`: currently `1`.
- `kind`: always `"flaghack-perf"`.
- `source`: producer, for example `server`, `api-smoke`, or `charm`.
- `suite`: optional gate/benchmark name.
- `operation`: stable operation family, for example `backend.turn`, `backend.api`, `client.api`, `frontend.component`, or `frontend.response_to_redraw_finished`.
- `phase`: segment within the operation, for example `allAiPlan`, `executePlans`, `board`, or `status`.
- `case`: optional scenario such as `move`, `lootTakeMulti`, or request path.
- `traceId`: correlates segments produced by the same turn or frontend response.
- `durationNs`: wall-clock duration in nanoseconds.
- `cpuUserMicros` / `cpuSystemMicros`: process CPU deltas in microseconds where the runtime exposes them. Treat these as process-level compute hints, not isolated fiber/thread CPU.
- `counts`: cheap contextual counts, such as world size, item count, or planned action count.
- `ok` / `error`: success flag and failure detail.

## Backend segmentation

Server-side metrics wrap API/repository calls and the player-turn pipeline. A single move turn emits correlated `source: "server"`, `operation: "backend.turn"` records sharing a `traceId`, including:

- `phase: "total"`
- `phase: "state.modifyEffect"`
- `phase: "allAiPlan"`
- `phase: "appendPlayerAction"`
- `phase: "filterNoops"`
- `phase: "executePlans"`
- `phase: "doAction"` for each executed plan

This allows a gate to assert the total turn exists, then inspect phases when a slowdown appears.

## Frontend segmentation

The default Charm CLI writes app-side metrics when `FLAGHACK_PERF_FILE` is set. It records:

- HTTP and API wrapper durations (`source: "charm"`, `operation: "frontend.http"` / `frontend.api`).
- Component/view render segments (`operation: "frontend.component"`, phases such as `board`, `sidebar`, `event`, `status`, `popup`).
- Response-to-redraw latency (`operation: "frontend.response_to_redraw_finished"`) after a successful async response mutates model state and the next `View()` returns.

This measures completion of the app render function, not the terminal emulator's physical paint.

## Validation helpers

Use the validator to ensure required records exist:

```sh
pnpm exec tsx scripts/validate-perf-output.ts "$perf_file" \
  --require source=api-smoke,operation=client.api,phase=doAction.move \
  --require source=server,operation=backend.turn,phase=total \
  --require source=charm,operation=frontend.component,phase=board
```

The validator rejects malformed JSON, non-perf records, invalid required fields, non-positive timed records, and missing filters.

## Benchmarks

`pnpm test:perf` runs the existing Vitest benchmarks plus Charm Go benchmarks. These are smoke baselines only; do not add pass/fail thresholds until stable performance baselines are collected on target hardware.
