import { describe, expect, it } from "@effect/vitest"
import { GameState } from "@flaghack/domain/schemas"
import { Effect, HashMap } from "effect"
import { makeHippie, player } from "../src/creatures.js"
import {
  advanceDungeonAtmosphere,
  firstDungeonAmbientSounds,
  tunnelHippieFlagDialogue,
  tunnelHippieWrongTurnDialogue
} from "../src/sounds.js"
import { makeSign, makeTunnel } from "../src/terrain.js"
import type { Entity } from "../src/world.js"

type GameStateValue = typeof GameState.Type

const makeState = (
  entities: ReadonlyArray<Entity>,
  fields: Partial<Omit<GameStateValue, "world">> = {}
): GameStateValue =>
  GameState.make({
    ...fields,
    world: HashMap.fromIterable(
      entities.map((entity) => [entity.key, entity] as const)
    )
  })

const advance = (state: GameStateValue): GameStateValue =>
  Effect.runSync(advanceDungeonAtmosphere(state))

const dungeonPlayerAndTunnel = (x = 0, y = 0): ReadonlyArray<Entity> => [
  player(x, y, 1),
  makeTunnel("player-tunnel", x, y, 1)
]

describe("first dungeon atmosphere", () => {
  it("greets nearby tunnel hippies once in deterministic distance and key order", () => {
    const initial = makeState([
      ...dungeonPlayerAndTunnel(),
      makeHippie("hippie-b", 0, 3, 1, "B"),
      makeTunnel("hippie-b-tunnel", 0, 3, 1),
      makeHippie("hippie-a", 3, 0, 1, "A"),
      makeTunnel("hippie-a-tunnel", 3, 0, 1),
      makeSign(
        "camp-sign",
        10,
        10,
        0,
        "The Dusty Spoon — N-1, Lantern Road"
      )
    ])

    const first = advance(initial)
    const repeat = advance(initial)

    expect(repeat).toEqual(first)
    expect(first.turn).toBe(1)
    expect(first.greetedTunnelHippieKeys).toEqual(["hippie-a"])
    expect(first.gameplayEvents).toHaveLength(1)
    expect(first.gameplayEvents?.[0]?.id).toBe(1)
    expect(first.gameplayEvents?.[0]?.message).toBe(
      tunnelHippieWrongTurnDialogue("The Dusty Spoon")
    )

    const second = advance(first)
    const third = advance(second)

    expect(second.greetedTunnelHippieKeys).toEqual([
      "hippie-a",
      "hippie-b"
    ])
    expect(second.gameplayEvents).toHaveLength(2)
    expect(second.gameplayEvents?.[1]?.message).toBe(
      tunnelHippieFlagDialogue
    )
    expect(third.greetedTunnelHippieKeys).toEqual([
      "hippie-a",
      "hippie-b"
    ])
    expect(third.gameplayEvents).toEqual(second.gameplayEvents)
  })

  it("requires the hippie to be within three steps and standing in a tunnel", () => {
    const atBoundary = advance(makeState([
      ...dungeonPlayerAndTunnel(),
      makeHippie("hippie-boundary", 2, 1, 1),
      makeTunnel("hippie-boundary-tunnel", 2, 1, 1)
    ]))
    const tooFar = advance(makeState([
      ...dungeonPlayerAndTunnel(),
      makeHippie("hippie-far", 3, 1, 1),
      makeTunnel("hippie-far-tunnel", 3, 1, 1)
    ]))
    const offTunnel = advance(makeState([
      ...dungeonPlayerAndTunnel(),
      makeHippie("hippie-off-tunnel", 1, 0, 1)
    ]))

    expect(atBoundary.greetedTunnelHippieKeys).toEqual([
      "hippie-boundary"
    ])
    expect(atBoundary.gameplayEvents).toHaveLength(1)
    expect(tooFar.greetedTunnelHippieKeys).toBeUndefined()
    expect(tooFar.gameplayEvents).toBeUndefined()
    expect(offTunnel.greetedTunnelHippieKeys).toBeUndefined()
    expect(offTunnel.gameplayEvents).toBeUndefined()
  })

  it("emits a deterministic ambient sound when due and schedules a cooldown", () => {
    const initial = makeState(
      dungeonPlayerAndTunnel(),
      { nextDungeonAmbientTurn: 5, turn: 4 }
    )

    const due = advance(initial)
    const repeat = advance(initial)

    expect(repeat).toEqual(due)
    expect(due.turn).toBe(5)
    expect(due.gameplayEvents).toHaveLength(1)
    expect(firstDungeonAmbientSounds).toContain(
      due.gameplayEvents?.[0]?.message
    )
    expect(due.nextDungeonAmbientTurn).toBeGreaterThanOrEqual(15)
    expect(due.nextDungeonAmbientTurn).toBeLessThanOrEqual(23)

    const coolingDown = advance(due)

    expect(coolingDown.turn).toBe(6)
    expect(coolingDown.gameplayEvents).toEqual(due.gameplayEvents)
    expect(coolingDown.nextDungeonAmbientTurn).toBe(
      due.nextDungeonAmbientTurn
    )
  })

  it("does not run first-dungeon atmosphere on the campground or deeper levels", () => {
    for (const z of [0, 2]) {
      const initial = makeState(
        [player(0, 0, z), makeTunnel(`tunnel-${z}`, 0, 0, z)],
        {
          gameplayEvents: [{ id: 4, message: "existing event" }],
          nextDungeonAmbientTurn: 1,
          nextGameplayEventId: 4,
          turn: 3
        }
      )

      const next = advance(initial)

      expect(next.turn).toBe(4)
      expect(next.nextDungeonAmbientTurn).toBeUndefined()
      expect(next.gameplayEvents).toEqual(initial.gameplayEvents)
      expect(next.nextGameplayEventId).toBe(4)
    }
  })

  it("bounds retained gameplay events while keeping event ids monotonic", () => {
    const gameplayEvents = Array.from({ length: 50 }, (_, index) => ({
      id: index + 1,
      message: `event ${index + 1}`
    }))
    const initial = makeState(
      dungeonPlayerAndTunnel(),
      {
        gameplayEvents,
        nextDungeonAmbientTurn: 1,
        nextGameplayEventId: 50,
        turn: 0
      }
    )

    const next = advance(initial)

    expect(next.gameplayEvents).toHaveLength(50)
    expect(next.gameplayEvents?.[0]?.id).toBe(2)
    expect(next.gameplayEvents?.at(-1)?.id).toBe(51)
    expect(next.nextGameplayEventId).toBe(51)
  })
})
