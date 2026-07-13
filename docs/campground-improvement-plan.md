# Campground improvement implementation plan

## Outcome and product boundaries

Turn the campground into a welcoming, legible social hub whose main route
gradually becomes stranger as it approaches the temple. A new player should
understand where they arrived, meet someone quickly, learn how to navigate,
visit camps with distinct identities, and follow a missing-flag story into and
back out of the first dungeon.

This plan keeps the current 360 by 160 seeded rectangular-road campground and
the Charm client. The surface remains mostly safe: social exploration,
wayfinding, favors, and atmosphere are the focus, not surface combat, hunger,
shops, day/night simulation, or resource pressure. Deeper-dungeon generation
is outside the scope except where the return route and missing flag touch the
first dungeon.

The implementation must preserve the current save/restore/quit lifecycle,
revisioned authoritative `ClientState` snapshots, active-region behavior, and
generated-file policy. Schema source changes belong in TypeScript; generated
schema JavaScript, declarations, `build/`, and `dist/` must not be edited.

## Current foundation

The work should extend, rather than replace, these existing systems:

- `world.ts` deterministically builds three connected rectangular road loops,
  connector spokes, 24 camp anchors, tent primitives, 80 surface NPCs, an
  effigy, a temple, and the temple's down stairs.
- The player spawns at the beginning of a reserved horizontal travel corridor.
  That corridor is currently kept clear but is not yet an authored arrival
  experience or a complete arrival-to-temple route.
- Camps currently rotate through 12 names, use a small set of band-based
  layouts, have identical cooler contents, and draw NPC positions from the
  general open field.
- The server sends only the active campground region to the client. The Charm
  client supports coordinate travel inside known terrain, look mode, popups,
  and repeated turn-by-turn actions.
- Gameplay events already carry bounded, monotonically identified messages
  through HTTP/SSE to Charm without snapshot replay. Surface discoveries,
  speech, ambience, and event announcements should use that channel.
- The temple down stairs already enter persistent dungeon level 1. There is no
  return stair yet, so it must be implemented before the flag can be returned.

## Experience contract

### Arrival hub

Build a compact civic plaza around the existing spawn anchor. It contains a
gate silhouette, a directory sign, a water station, a named ranger greeter,
the start of the main processional road, and one nearby flagship camp. The
spawn tile and its eight neighbors remain unblocked.

The greeter introduces talking, describes the three road loops, points out the
effigy, and provides the first missing-flag lead. The directory lists stable
road names and known civic landmarks without revealing every camp.

Acceptance criteria:

- At the default terminal size, the initial board contains the player, a road,
  the directory or gate, and the greeter.
- The greeter is reachable in at most 10 legal moves and cannot spawn on the
  player or block the only route out.
- Arrival, its directory, water, and processional road are connected for every
  tested seed.
- A first-time arrival discovery message is emitted once and persists across
  save/restore.

### Heavy-rain opening

A fresh game begins in persistent heavy rain at an authored mud puddle one
tile off the campground road. After role setup completes, emit exactly one
plain gameplay narration: the player wakes naked and face down in the puddle,
rain hammers around them, and they cannot remember how they arrived. The
inventory is empty. The prose gives no objective, quest, prescribed
destination, or explanation of what happened.

The narration is a semantic gameplay event rather than an untracked string.
Repeated views and confirmations do not append it again. At the restore
boundary, remove only the retained arrival-narration event before publishing
the restored snapshot, leaving other history and the monotonic event ID
untouched. This prevents Charm's retained-history behavior from replaying the
opening on a reconnect.

Heavy rain is authoritative server state. Project it to the client only while
the player is on level zero; the dungeon must not display surface weather.
At least 90 percent of the 80 surface NPCs shelter beneath camp roofs or
small roadside awnings. Only a few travelers and patrols remain exposed, so
the roads feel bleak without making the populated campground inert.
Surface atmosphere chooses deterministic, frequent rain lines (roughly every
6--12 turns), distinguishes open rain from shelter beneath a tent roof or the
arrival gate, never interrupts automatic travel, and shares the existing
one-message-per-turn budget with dialogue, discovery, progress, and public
announcements. Public-event prose should naturally acknowledge canopies,
runoff, mud, or rain without turning the weather into a tracked task.

Acceptance criteria:

- The initial player coordinate contains mud and sits immediately off the
  road; the initial inventory is empty.
- Fresh setup appends one and only one arrival-narration event with all four
  facts (naked, face down in mud, heavy rain, no memory) and no objective text.
- Legacy/partial campground state hydrates to heavy rain, and only a level-zero
  client view exposes that weather.
- Outdoor, tent-roof, and arrival-gate ambience use the correct deterministic
  rain pools; rain is silent underground and never interrupts travel.
- Representative world seeds keep at least 72 of 80 NPCs under tent terrain
  while preserving the exact hippie/ranger population and unobstructed wake
  point.
- Restore strips only the retained arrival narration and does not rewind the
  next gameplay-event ID.

### Landmark spine

Turn the reserved corridor into a named processional route, provisionally
`Lantern Walk`, and connect it through the road graph in this order:

1. arrival plaza;
2. the central effigy;
3. the temple entrance and stairs.

The route may bend and share loop/spoke segments, but it must be continuous and
visually marked by signs or distinctive props. Do not wall off the open playa;
roads become useful through signs, addresses, NPC activity, event placement,
and road-preferring travel rather than through forced corridors.

Acceptance criteria:

- A walkable graph path exists from spawn to the effigy, temple marker, and
  stairs, and the ordered shortest-route milestones are arrival, effigy,
  temple.
- No unsigned stretch of the main landmark route exceeds 35 path steps.
- The route intersects every road loop and has no camp wall, prop, container,
  or creature permanently occupying a required path tile.
- Major landmarks are reachable without diagonal corner cutting.

### Invisible, cryptic story progression

The campground has no quest log, objective tracker, acceptance prompt,
completion banner, exclamation mark, prescribed destination, or automatic
route toward story progress. The player should not be told that a conversation
or favor belongs to a quest. Persistent phases exist only as hidden server
bookkeeping for idempotence and save compatibility.

Story information arrives as ordinary requests, partial recollections,
overheard remarks, environmental details, and occasionally contradictory
rumors. No single line explains the complete flag path. Rangers give truthful
directions only when the player asks about a known place; they do not select a
story destination for the player. The overview lists only personally
discovered places and live public gatherings, never a next step. Natural
thanks, changed dialogue, ownership, and the flag's reappearance in camp are
the only completion feedback.

### Named roads and addresses

Give all three loops and all connector spokes stable authored names. Maintain
a generated coordinate-to-road index rather than turning every road tile into
a larger persisted entity. Intersections may have two names. Every camp and
major landmark receives a canonical address in the form `Loop near Spoke`,
with a sector fallback when it is between spokes. The exact content names live
in one content registry and are not inferred in Charm.

Directions are computed from the actual generated road graph. A ranger should
be able to say the first useful heading, road name, next intersection, and the
destination address; no dialogue may contain hard-coded east/west assumptions
about a jittered layout.

Acceptance criteria:

- Every road tile resolves to at least one road ID, every intersection to all
  applicable IDs, and every camp/landmark to one stable address.
- Every camp entrance is within six path steps of a road.
- Direction text agrees with the first segment of a server-computed route.
- Automatic landmark travel spends at least 70 percent of eligible route steps
  on roads, unless the shortest road-preferring path is unavailable.

### Camps, archetypes, props, and inventories

Replace positional `ThemeCampLayout` assembly with a content-driven camp
registry. Generate 24 unique camp identities without replacement: eight on
each loop, with two in each broad quadrant. At least six are flagship camps
used by dialogue, favors, public events, or the flag story. The catalog should
cover at least these eight visual/gameplay archetypes:

- pancake kitchen;
- maker/workshop;
- dance dome;
- tea or lounge camp;
- ranger/medical outpost;
- art/effigy crew;
- bike repair camp;
- quiet/rest camp.

Each definition supplies a stable ID, unique display name, archetype, layout
template, entrance, prop pattern, cooler inventory profile, resident roles,
dialogue pool, ambient pool, and optional favor/event hooks. Existing funny
camp names can be retained, but no name repeats within one campground.

Add one typed `camp-prop` terrain family with a finite `kind` enum rather than
many unrelated tags. Initial kinds should cover table, speaker, artwork,
workbench, bike rack, lantern, and water station. Passability is explicit per
kind. Every kind needs a no-color-distinguishable Charm glyph and a useful look
description.

Cooler contents are resolved from seeded profiles. Every archetype has a
signature guaranteed item plus bounded seeded variety. Critical favor items
are guaranteed separately and identified by their generated entity key; quest
logic must not accept an arbitrary flag or tool by tag alone.

Acceptance criteria:

- There are exactly 24 camp signs, 24 unique names, eight camps per loop, at
  least eight archetypes, and at least six flagship definitions.
- Each loop has camps in all four broad quadrants; at least two thirds of camps
  are on the inner and middle loops rather than the distant perimeter.
- At least eight normalized camp tile/prop signatures are distinct without
  considering color or sign text.
- At least six cooler inventory profiles are distinct, adjacent camps do not
  have identical sorted contents, and every guaranteed favor item exists once.
- Every structure entrance, cooler, resident home tile, and blocking prop is
  reachable from its camp entrance.

### NPC homes and travelers

Preserve the current total of 64 hippies and 16 rangers, but give every NPC an
assignment instead of sampling the entire open field:

- 48 hippies are two-per-camp residents;
- eight additional hippies host flagship camps;
- eight hippies are road travelers;
- eight rangers staff arrival, civic nodes, or camps;
- eight rangers patrol or travel the named road graph.

Persist assignments by stable creature key. Camp residents wander only inside
their camp footprint and a small entrance radius. Travelers select destinations
from camps, landmarks, and active public events and move only on road/shoulder
tiles. Offscreen stepping must use the existing cursor/budget approach; it must
not scan or route every NPC on every player turn. NPCs avoid the player,
stairs, signs, containers, and other creatures.

Acceptance criteria:

- At generation, at least 80 percent of NPCs are residents or civic staff and
  the remaining minority are assigned road routes.
- A resident remains within its allowed home region over a long deterministic
  simulation; a traveler never leaves the road/shoulder graph except at a
  destination entrance.
- Assignment and movement are deterministic for a fixed seed and saved turn.
- Active and offscreen simulation produce legal, collision-free positions and
  preserve the existing offscreen work budget.

### Talk and generated directions

Add a directional `talk` action to the domain action union and server action
interpreter. In Charm, `t` prompts for one of the eight movement directions.
The server validates that exactly one talkable creature is adjacent on the
same level; the client never authors dialogue or quest transitions. An empty
direction produces a gameplay message and no state change beyond the turn
policy chosen for other no-op actions.

Dialogue has three layers: once-only introductions, contextual lines driven by
camp/event/favor/flag state, and bounded repeat lines. Rangers answer questions
about named, discovered places and derive route instructions from the road
graph; they never infer or announce hidden story progress. Ordinary residents
mention their camp identity and nearby activity. Existing tunnel-hippie proximity dialogue
continues to work and can provide flag hints without duplicating a completed
conversation.

Acceptance criteria:

- Talk works in all eight directions, rejects distant/different-level targets,
  and cannot mutate an unrelated NPC.
- Each authored introduction is emitted once per NPC where specified and that
  fact survives save/restore.
- Rangers name a real next road/intersection and destination address.
- Repeated dialogue is deterministic, bounded, and does not flood one turn
  with multiple gameplay events.

### Discovery, ambient sound, and public events

Discover arrival immediately. Discover other camps and landmarks when the
player reaches their entrance/sign radius; proximity alone must use a small,
documented distance and same-level check. Store stable discovered IDs, emit one
message per new discovery, and expose only discovered destinations in the
client view. Unknown destinations remain entirely absent even when hidden
story progress refers to them.

Extend the turn-based atmosphere scheduler used by the dungeon with surface
zones. Arrival, road, each camp archetype, effigy, open playa, and temple have
small authored sound pools. Choose from the nearest/highest-priority zone,
schedule ordinary ambience sparsely (target interval 12--24 surface turns) and
heavy rain more frequently (target interval 6--12 turns), and suppress
an ambient line when dialogue, discovery, hidden progress, or a public
announcement already used the turn's message budget.
Ambient messages remain visible in the log but do not interrupt automatic
movement; dialogue, discoveries, public announcements, and other consequential
events do.

Add deterministic public events at flagship camps: a meal, workshop, and dance
set are the minimum set. Persist a single scheduler state (`scheduled`,
`active`, or cooldown), host camp ID, start/end turn, and event kind. An active
event becomes an overview/travel destination if its host is discovered,
changes local ambience, and may redirect road travelers; it does not teleport
camp residents. Announce start/end once and schedule the next event after a
long cooldown.

Acceptance criteria:

- Each discovery is emitted once, remains discovered after restore, and does
  not reveal undiscovered camp coordinates in `ClientState`.
- Ambient selection is deterministic for seed/state, location appropriate,
  silent off the campground, and never emits more than one ambient event in a
  turn.
- At least three public event kinds cycle deterministically, no more than one
  is active, and start/end/cooldown survive save/restore.
- Gameplay event history remains bounded by the existing limit and SSE/HTTP
  snapshot replay does not duplicate messages in Charm.

### Small favors

Implement three short, state-machine-driven favors that teach the campground
systems and make multiple camps useful:

1. **Welcome message:** the arrival ranger asks the player to carry a verbal
   message to the pancake kitchen; talking to its host completes it and rewards
   food plus a road introduction.
2. **Tool run:** the effigy crew requests the specifically assigned hammer or
   nails from the maker camp; returning that keyed item transfers it to the
   recipient and rewards a missing-flag clue.
3. **Water run:** a dance or public-event host accepts water for an optional
   repeat-safe favor and rewards food, a rumor, or a newly marked civic
   destination.

Favor transitions occur only on the server during talk/item handoff. They are
idempotent and tolerate early discovery or early possession. The welcome and
tool favors cannot be soft-locked: their host keys and required item keys are
validated at generation/hydration, and a missing essential tool is repaired or
the requirement is safely waived with an explanatory event. The consumable
water favor is optional and can be offered again if water was consumed.

Acceptance criteria:

- Each favor has explicit unavailable, offered, active, ready, and completed
  behavior, with invalid and repeated transitions leaving rewards unique.
- Required people/items are reachable, a player cannot turn in another entity
  with the same tag, and ownership changes are reflected in world/inventory.
- Completing favors in a different order, discovering camps early, or saving
  at every phase produces a coherent result with no duplicate rewards.

### Missing-flag progression

Use one hidden persistent story record with phases equivalent to `not-started`,
`seeking-rumors`, `temple-lead`, `flag-retrieved`, and `returned`. The exact
story path is:

1. the arrival greeter identifies the missing camp flag;
2. the pancake host and effigy crew provide independent clues, so the player is
   not blocked by one optional favor;
3. a ranger can give generated directions to the temple only if the player
   asks about that known place;
4. level 1 contains one specifically keyed missing flag at a reachable tunnel
   dead end, with tunnel hippies providing nearby hints;
5. the player picks it up, ascends, and returns it to its owner at arrival or
   the effigy crew.

The flag may exist before the story begins. Picking it up or presenting it
early advances to the logically valid phase instead of breaking progression.
The server checks the stored flag key, not every `flag` item. Completion moves
the item to its final owner/display location, emits one completion event, and
does not make the temple or dungeon inaccessible.

Acceptance criteria:

- All phases are deterministic, idempotent, persisted, and reachable through
  normal play.
- Exactly one quest flag exists, is reachable from the dungeon arrival, and is
  distinguishable from unrelated flags by its recorded key.
- Early flag pickup, early temple discovery, repeated talk, save/restore in
  every phase, and returning after story completion are all safe.
- The story has at least two independent cryptic surface clue sources. Any
  directions the player explicitly requests use a real route and address.

### Return stairs: prerequisite for flag completion

Add `stairs-up` terrain, an `ascend` action, `<` Charm input, look/render text,
and an upstairs tile at the first-dungeon arrival. Ascending returns the player
to the campground temple's down-stair coordinate or a deterministic adjacent
safe tile. Repeated descent reuses the existing level rather than regenerating
it. This phase must merge before placing or enabling flag turn-in.

For saves made in the dungeon before this feature, runtime state hydration must
insert the missing return stair at the known arrival if it is absent. This is a
targeted safety repair, not a general rewrite of legacy campground geometry.

Acceptance criteria:

- `>` down and `<` up require the matching terrain under the player and do
  nothing elsewhere.
- A down/up/down round trip preserves all entities, item ownership, dungeon
  hippie greeting state, atmosphere schedule, and quest state without duplicate
  level entities.
- A legacy save whose player is already on level 1 gains a reachable way back
  to the campground.

### Landmark overview and travel

Add a compact campground view to `ClientState` containing the current address,
discovered landmark records, and an optional active public event. It contains
no objective, hint, hidden story phase, or suggested destination. A landmark
record contains only a stable ID, display name, kind, coordinate, address, and
travel availability. The full 360 by 160 world remains server-side; the
overview must not defeat active-region transport.

In Charm, `O` opens a schematic overview/list showing the three loops,
discovered destinations, current location, and a no-color legend.
`_` opens a letter-selectable discovered-destination popup, retaining a `map
cursor` choice for current coordinate travel. Selecting a landmark begins
turn-by-turn travel and remains cancellable/interruption-aware.

Because a far landmark is outside the client snapshot, add a server-authorized
single-turn `travelStep` action keyed by landmark ID. Each request validates
that the landmark is discovered/travelable, computes one road-weighted legal
step in the authoritative full world, and advances one normal game turn. Charm
repeats that action using existing stream revision handling until arrival,
interruption, cancellation, or blockage. Never send a hidden full-world path to
the client.

The server may persist a hidden route and cursor after the first step so a long
trip does not rebuild the full-world path every turn. Every cached adjacent
step is revalidated against the active collision window; divergence or a new
blocker discards and recomputes the route. The hidden path is save-safe and is
never part of `ClientState`.

Acceptance criteria:

- Overview and travel expose no undiscovered camp coordinates or names.
- A destination beyond the active region can be reached, cancelled, or safely
  interrupted while every movement remains a normal authoritative turn.
- Travel rejects stale/unknown IDs, recomputes around moving blockers, prefers
  roads, and stops on new important gameplay events or adjacent creatures.
- Existing coordinate travel, look mode, HTTP fallback, and SSE stale-revision
  rejection continue to work.

### Charm readability

Reduce open-playa floor visual weight, keep roads stronger than floor, and make
arrival, camps, props, effigy, temple, both stair directions, NPCs, and quest
flag distinguishable without color. Keep Unicode line-drawing walls where
supported; tests assert semantic glyph choice rather than terminal color.

Add the current road/address to status space. Story guidance appears only as
diegetic dialogue and ambient events, never as an objective line.
Look mode should show a camp's name/archetype/address, a road name, and a prop's
description rather than only its raw tag. Update help text for talk, overview,
landmark travel, and ascend without making the one-line help unreadable; a
secondary help/legend popup may carry detail.

Acceptance criteria:

- Floor is visually quieter than road in monochrome output and all major
  landmark/transition glyphs are distinct.
- Initial arrival remains readable at minimum supported terminal dimensions;
  popups clamp/scroll rather than covering required prompts.
- Status and look text use server-provided semantic metadata and do not derive
  camp identity from coordinates in Go.
- Rendering, gameplay-event deduplication, setup, inventory, loot, and movement
  tests continue to pass.

## State, compatibility, and module design

### Authoritative state

Introduce optional, source-schema fields on `GameState` so old saves continue
to decode. Group the fields under a versioned `campground` record instead of
adding many unrelated top-level options. It should contain:

- generation/content version and stable generated camp/landmark metadata;
- road IDs/addresses or the seed/version needed to rebuild their coordinate
  index without changing the saved world;
- NPC home/traveler assignments;
- discovered landmark IDs and greeted/talked NPC keys;
- favor and missing-flag state, including required entity keys;
- surface ambience and public-event scheduler state.

Expose a separate required `CampgroundView` projection in `ClientState`, with
an empty/default view for non-campground levels and terminal empty state. Do not
expose NPC assignments, hidden camps, future event schedules, or hidden quest
coordinates.

Suggested server modules are `campground/content.ts` for authored immutable
definitions, `campground/layout.ts` for geometry and graph indices,
`campground/state.ts` for hydration/projection, `campground/dialogue.ts`,
`campground/quests.ts`, `campground/atmosphere.ts`, and
`campground/navigation.ts`. Keep generic movement, persistence, and stream code
free of authored camp strings.

### Save compatibility

`normalizeCampgroundState` runs when a campground-aware action/view first
needs the record. For a new game it stores the complete generated metadata. For
an old save it derives conservative metadata from existing signs, temple,
effigy, NPCs, and world entities; it does not regenerate or replace the saved
campground. Old saves may therefore keep their historical camp geometry while
gaining talk, discovery, directions, cryptic story interactions, and safe
level transitions.

All new save fields remain optional at decode boundaries and receive runtime
defaults. Do not broaden the existing legacy migration, whose current purpose
is filling missing creature attributes. The only permitted world repair is
idempotent insertion of safety/quest entities that are provably absent, such as
the return stair for a player already below ground or the keyed quest flag when
the quest requires it. Corrupt saves retain the existing discard behavior.

Compatibility tests need checked-in minimal legacy payloads for: no campground
record on level 0, no campground record while the player is on level 1, an
already-owned flag, and partially populated optional scheduler fields.

## Staged delivery and dependencies

### Stage 0: contracts and baselines

1. Record generation/turn/Charm render benchmark baselines without writing
   generated output.
2. Define stable IDs, content registry types, `CampgroundState`,
   `CampgroundView`, `camp-prop`, `stairs-up`, and the `talk`, `ascend`, and
   `travelStep` action contracts.
3. Add encode/decode and empty-client-state tests before behavior changes.

Exit: schemas type-check, legacy saves decode, all current gates pass, and the
new client view cannot leak hidden landmarks.

### Stage 1: generator and physical legibility

1. Extract campground generation into content/layout modules.
2. Add named road indices, addresses, arrival plaza, landmark spine, signs,
   camp distribution, archetype layouts, props, and inventory profiles.
3. Assign NPC homes/routes at generation, initially retaining existing AI until
   Stage 2.
4. Add property-style generation tests across a fixed seed corpus.

Exit: all arrival, road, camp, inventory, reachability, and distribution
criteria pass; generation remains deterministic.

### Stage 2: social simulation and surface life

1. Constrain residents and implement budgeted road travelers.
2. Implement directional talk and server-authored directions.
3. Implement discovery, surface ambience, and persisted public events.
4. Project current address and discoveries into `ClientState`, explicitly
   excluding hidden story progress.

Exit: long-run AI legality, dialogue/direction, discovery, event scheduler, SSE
serialization, and save/restore tests pass.

### Stage 3: return path and navigation client

These are separable work streams after Stage 0 and may proceed in parallel:

1. Add return stairs, ascent, legacy level-1 safety hydration, and round-trip
   tests.
2. Add Charm overview, landmark popup, authoritative repeated `travelStep`,
   current address display, look text, glyph hierarchy, and help.

Exit: a player can navigate to every discovered landmark and make a persistent
dungeon round trip in the real Charm client. Return stairs must land before
Stage 4 quest completion is enabled.

### Stage 4: favors and missing-flag story

1. Add the three favor state machines and handoff/reward rules.
2. Add the keyed dungeon flag and a cryptic, redundant clue network.
3. Add early/out-of-order reconciliation and final flag return.
4. Add an end-to-end fixture that follows arrival, talk, directions, descent,
   pickup, ascent, and turn-in.

Exit: the complete hidden story and all favor/progress edge cases pass unit,
API, and terminal feature tests with no soft locks, duplicate rewards, or
visible quest tracking.

### Stage 5: hardening and tuning

1. Tune density, road preference, message cadence, public-event intervals, and
   camp silhouettes using deterministic test seeds.
2. Audit active-region/offscreen work, route caches, gameplay-event bounds,
   and snapshot size.
3. Update campground/server docs and the NetHack feature-gap analysis.
4. Run every readiness gate serially where required.

Exit: all quantitative criteria below and all project gates pass.

## Parallel ownership and merge checkpoints

To minimize shared-file conflicts, use bounded work streams:

- **Domain/state agent:** schema/action/view contracts, normalization,
  persistence compatibility fixtures, stream serialization, and empty states.
- **World agent:** content registry, road graph/addressing, arrival/spine,
  camps/props/inventories, quest entity placement, and world tests.
- **Simulation agent:** NPC assignments/AI, talk/directions, atmosphere/public
  events, favors/quest transitions, ascent/travel actions, and server tests.
- **Charm agent:** action input, overview/destination popups, travel loop,
  semantic rendering/look/status/help, Go tests, and tmux scenario support.

Merge at the end of each stage, not only at the end of all work. The domain
contract lands first. The world and Charm streams may then work in parallel;
the simulation stream integrates against the merged IDs/metadata. One owner
resolves `world.ts`, `actions.ts`, `gameloop.ts`, and `main.go` conflicts at
each checkpoint. Do not let multiple agents independently invent camp IDs,
quest phases, action payloads, or client projection shapes.

## Verification strategy

### Unit and property tests

- Domain: all new entities, actions, progress records, client projections, and
  hidden-field omissions encode/decode correctly.
- World: deterministic seed snapshots, unique IDs/names, distribution,
  road/address coverage, landmark ordering, camp signatures, inventories,
  blockers, and flood-fill reachability across at least 32 fixed seeds.
- Actions: talk targeting, item handoffs, ascend/descend, travel validation,
  road-weighted steps, early hidden-story states, and idempotent rewards.
- Simulation: resident bounds, traveler road adherence, collision avoidance,
  offscreen budget, ambience suppression/cadence, event lifecycle, and stable
  randomness.
- Persistence: old payload defaults, level-1 safety repair, exact new-state
  round trips, corrupt-save discard, and consumed-restore semantics.
- Charm: JSON projections, all new key parsers/payloads, popup selection and
  scrolling, hidden destinations, cancellations, event interruption, glyphs,
  look/status text, narrow terminals, HTTP fallback, and snapshot deduplication.

### Integration and terminal scenarios

- API/SSE: every new action advances a monotonic revision and returns an
  authoritative snapshot; invalid actions do not leak state.
- Campground fixture: spawn at arrival, talk to greeter, inspect directory,
  discover a camp, request directions, and landmark-travel beyond the initial
  active region.
- Quest fixture: use deterministic nearby placements to complete a favor,
  follow the temple lead, descend, obtain the exact flag, ascend, and turn it
  in; save/restore at one surface and one dungeon phase.
- Public-event fixture: force a due event, verify one announcement and overview
  destination, travel there, then verify one end announcement.

### Performance and readiness gates

Before Stage 1, collect repeatable baselines for campground generation, a full
campground turn, road routing, client-state encoding, and Charm render/update.
At Stage 5:

- generation, representative turn, and Charm render medians should remain
  within 15 percent of the recorded baseline unless an explicitly reviewed
  measurement explains the increase;
- route indices and static camp metadata are built once per generated/hydrated
  campground, not per NPC per turn;
- offscreen NPC work remains bounded by the existing budget;
- `ClientState` remains active-region-sized plus small metadata, not full-world
  sized;
- at least 80 percent of named road tiles have a camp, landmark, sign, prop, or
  active-event destination within one standard viewport along the road graph.

Run the documented gates before each stage handoff and the full set before
completion:

```sh
pnpm generated:guard
pnpm format:check
pnpm check
pnpm test:unit
pnpm test:charm
pnpm test:perf
pnpm test:api:bot
pnpm test:e2e:tmux:bot
```

Run API and tmux bot gates serially on port 3100. Add a focused
`pnpm test:feature:tmux:bot` scenario for overview/travel and a dedicated quest
scenario when regex-only assertions are not enough. Do not run a build or
codegen command that writes guarded generated artifacts during this work.

## Completion definition

The campground improvement is complete when a fresh Charm player can arrive,
read the place, talk to a nearby person, use truthful road directions, recognize
and visit distinct camps, observe discoveries/ambience/public events, complete
small favors, follow the flag clues through the temple, retrieve the exact flag,
return upstairs, and finish the story; the same sequence remains coherent after
save/restore and on legacy saves; hidden information stays server-side; all
quantitative generation/navigation criteria and readiness gates pass; and no
generated/disposable artifact was edited by hand.
