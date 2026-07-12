import { describe, expect, it } from "@effect/vitest"
import { EAction, GameState } from "@flaghack/domain/schemas"
import { Effect, HashMap } from "effect"
import { player } from "../src/creatures.js"
import { GameStateStore } from "../src/GameStateStore.js"
import { makeWaterBottle } from "../src/items.js"
import type { Entity } from "../src/world.js"

const floorAt = (key: string, x: number, y: number): Entity => ({
  _tag: "floor",
  at: { x, y, z: 0 },
  in: "world",
  key
})

const entityByKey = (
  world: HashMap.HashMap<string, Entity>,
  key: string
) => Array.from(HashMap.values(world)).find((entity) => entity.key === key)

const stateFromEntities = (
  entities: ReadonlyArray<Entity>,
  setup?: typeof GameState.Type["setup"]
) =>
  GameState.make({
    ...(setup === undefined ? {} : { setup }),
    world: HashMap.fromIterable(
      entities.map((entity) => [entity.key, entity] as const)
    )
  })

const importGameloop = async () => await import("../src/gameloop.js")

type SetupClientState = {
  readonly inventory: HashMap.HashMap<string, Entity>
  readonly roles: ReadonlyArray<
    { readonly letter: string; readonly name: string }
  >
  readonly setup: {
    readonly phase: "selectRole" | "confirm" | "complete"
    readonly selectedRoleId?: "virgin"
  }
  readonly world: HashMap.HashMap<string, Entity>
}

type SetupGameloopModule = Awaited<ReturnType<typeof importGameloop>> & {
  readonly confirmSetup: (
    confirm: boolean
  ) => Effect.Effect<void, never, GameStateStore>
  readonly getClientState: Effect.Effect<
    SetupClientState,
    never,
    GameStateStore
  >
  readonly selectRoleForSetup: (
    roleId: "virgin"
  ) => Effect.Effect<void, never, GameStateStore>
}

const asSetupModule = (
  module: Awaited<ReturnType<typeof importGameloop>>
): SetupGameloopModule => module as SetupGameloopModule

const runWithState = async <A>(
  state: typeof GameState.Type,
  effectForModule: (
    module: Awaited<ReturnType<typeof importGameloop>>
  ) => Effect.Effect<A, unknown, GameStateStore>
): Promise<A> => {
  const module = await importGameloop()
  const layer = GameStateStore.Default(Effect.succeed(state))

  return Effect.runSync(
    effectForModule(module).pipe(Effect.provide(layer))
  )
}

describe("role setup", () => {
  it("starts fresh default games at role selection with the virgin role", async () => {
    const module = await importGameloop()

    const state = Effect.runSync(
      module.getClientState.pipe(
        Effect.provide(module.DefaultGameStateStoreLive)
      )
    ) as SetupClientState

    expect(state.setup).toEqual({ phase: "selectRole" })
    expect(state.roles.map((role) => `${role.letter} - ${role.name}`))
      .toEqual(["v - virgin"])
  })

  it("treats missing setup state as already complete for existing fixtures", async () => {
    const actor = player(0, 0, 0)
    const state = stateFromEntities([
      floorAt("floor-0", 0, 0),
      floorAt("floor-1", 1, 0),
      actor
    ])

    const world = await runWithState(
      state,
      (module) =>
        Effect.gen(function*() {
          yield* module.actPlayerAction(EAction.move({ dir: "E" }))
          return yield* module.eGetWorld
        })
    )

    expect(entityByKey(world, actor.key)?.at).toEqual({ x: 1, y: 0, z: 0 })
  })

  it("ignores normal actions until setup is complete", async () => {
    const actor = player(0, 0, 0)
    const state = stateFromEntities(
      [floorAt("floor-0", 0, 0), floorAt("floor-1", 1, 0), actor],
      { phase: "selectRole" }
    )

    const world = await runWithState(
      state,
      (module) =>
        Effect.gen(function*() {
          yield* module.actPlayerAction(EAction.move({ dir: "E" }))
          return yield* module.eGetWorld
        })
    )

    expect(entityByKey(world, actor.key)?.at).toEqual(actor.at)
  })

  it("selects a role, returns to selection on no, and preserves rolled attributes with empty inventory on yes", async () => {
    const playerAttributes = {
      charisma: 8,
      constitution: 14,
      dexterity: 12,
      intelligence: 11,
      strength: 15,
      wisdom: 9
    }
    const actor = player(0, 0, 0, playerAttributes)
    const water = makeWaterBottle("starting-water", 0, 0, 0, actor.key)
    const state = stateFromEntities(
      [floorAt("floor-0", 0, 0), actor, water],
      { phase: "selectRole" }
    )

    const result = await runWithState(
      state,
      (module) =>
        Effect.gen(function*() {
          const setupModule = asSetupModule(module)
          yield* setupModule.selectRoleForSetup("virgin")
          yield* setupModule.confirmSetup(false)
          const afterNo = yield* setupModule.getClientState
          yield* setupModule.selectRoleForSetup("virgin")
          yield* setupModule.confirmSetup(true)
          const afterYes = yield* setupModule.getClientState
          const world = yield* module.eGetWorld
          return { afterNo, afterYes, world }
        })
    )

    expect(result.afterNo.setup).toEqual({ phase: "selectRole" })
    expect(result.afterYes.setup).toEqual({
      phase: "complete",
      selectedRoleId: "virgin"
    })
    const updatedPlayer = entityByKey(result.world, actor.key)
    expect(updatedPlayer).toMatchObject({
      _tag: "player",
      role: "virgin",
      attributes: playerAttributes
    })
    expect(
      Array.from(HashMap.values(result.world)).filter((entity) =>
        entity.in === actor.key
      )
    ).toEqual([])
    expect(HashMap.size(result.afterYes.inventory)).toBe(0)
  })
})
