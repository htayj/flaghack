# Future performance ideas

These ideas build on the current baseline: the server streams authoritative full
`ClientState` snapshots over SSE with monotonic revisions, and clients reject
older revisions while retaining HTTP refresh fallback. They may improve
responsiveness further, but need extra design/testing because they can
introduce stale UI, ordering bugs, or gameplay semantic changes if implemented
carelessly.

## Incremental world patches

Replace or complement current full-state stream events with a revision plus
changed entity patches.

Guardrails:

- Keep a monotonically increasing revision and define gap detection explicitly.
- Let clients request a full resync when a patch is missing or the revision is unexpected.
- Add server/client patch-vs-full equivalence tests and reconnect/replay tests.

Risk: stale or divergent client state if patches are dropped, applied out of order, or incomplete.

## Viewport-specific world endpoints

For terminal drawing, the client usually only needs entities in or near the visible viewport.

Guardrails:

- Keep full-world access for pathing/travel/debug clients.
- Treat viewport endpoints as display-only.
- Verify look/travel/autorun behavior still has the data it needs.

Risk: changing gameplay decisions if a client accidentally uses partial world data for pathing or actions.

## Cached derived collections

Cache inventories, creatures, terrain-by-position, items-by-position, and containers-by-position in server state.

Guardrails:

- Update caches atomically with every entity move/container transition/create/delete.
- Add scan-vs-cache equivalence tests for representative worlds.
- Include cache revision/debug assertions in development.

Risk: stale caches can produce incorrect pickup, loot, collision, or AI behavior.

## Client-side optimistic movement

Move the player immediately in the TUI, then reconcile when the server responds.

Guardrails:

- Only use for actions the server can reject predictably.
- Show rollback/reconciliation clearly when blocked.
- Keep the server authoritative.

Risk: briefly showing invalid movement or hiding server-side effects.

## AI cadence or scheduling changes

Run AI less often, in batches, or on a separate cadence.

Guardrails:

- Treat this as a gameplay design change, not just an optimization.
- Write tests around turn order and NPC movement expectations.

Risk: changes game feel and rules.

## Binary or compact wire formats

Use a compact transport for the world payload instead of Effect HashMap JSON.

Guardrails:

- Keep the typed JSON contract for compatibility or version the transport.
- Add decode/encode equivalence tests.

Risk: contract complexity and harder debugging.

## Parallel AI planning or reducers

Plan or execute independent NPC work concurrently.

Guardrails:

- Preserve deterministic turn ordering where gameplay depends on it.
- Ensure entity updates resolve conflicts deterministically.

Risk: nondeterminism and harder replay/debugging.
