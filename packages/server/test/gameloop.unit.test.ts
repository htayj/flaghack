import { describe, expect, it } from "@effect/vitest"
import {
  AnyCreature,
  AnyTerrain,
  type ClientState,
  conforms,
  EAction,
  GameState
} from "@flaghack/domain/schemas"
import { balancedAttributes } from "@flaghack/domain/stats"
import { Effect, HashMap, Option } from "effect"
import { readFileSync } from "node:fs"
import { vi } from "vitest"
import { player } from "../src/creatures.js"
import { GameStateStore } from "../src/GameStateStore.js"
import { makeBeer, makeCooler, makeWaterBottle } from "../src/items.js"
import type { CampgroundGenLevel, Entity } from "../src/world.js"

type CampgroundGenLevelFn = typeof CampgroundGenLevel
type WorldModule = Record<string, unknown> & {
  CampgroundGenLevel: CampgroundGenLevelFn
}
type ClientStateValue = typeof ClientState.Type

const readGameloopSource = (): string =>
  readFileSync(new URL("../src/gameloop.ts", import.meta.url), "utf8")

const floorAt = (key: string, x: number, y: number): Entity => ({
  _tag: "floor",
  at: { x, y, z: 0 },
  in: "world",
  key
})

const hippieAt = (key: string, x: number, y: number): Entity => ({
  _tag: "hippie",
  at: { x, y, z: 0 },
  attributes: balancedAttributes,
  in: "world",
  key,
  name: key
})

const entityByKey = (
  world: HashMap.HashMap<string, Entity>,
  key: string
) => Array.from(HashMap.values(world)).find((entity) => entity.key === key)

const importGameloop = async () => await import("../src/gameloop.js")

const runGetWorld = async () => {
  const module = await importGameloop()

  return Effect.runSync(
    module.eGetWorld.pipe(Effect.provide(module.DefaultGameStateStoreLive))
  )
}

const runGetPickupItemsFor = async (key: string) => {
  const module = await importGameloop()

  return Effect.runSync(
    module.getPickupItemsFor(key).pipe(
      Effect.provide(module.DefaultGameStateStoreLive)
    )
  )
}

const runWithWorld = async <A>(
  worldEntities: ReadonlyArray<Entity>,
  effectForModule: (
    module: Awaited<ReturnType<typeof importGameloop>>
  ) => Effect.Effect<A, never, GameStateStore>
): Promise<A> => {
  const module = await importGameloop()
  const testState = GameState.make({
    world: HashMap.fromIterable(
      worldEntities.map((entity) => [entity.key, entity] as const)
    )
  })
  const layer = GameStateStore.Default(Effect.succeed(testState))

  return Effect.runSync(
    effectForModule(module).pipe(Effect.provide(layer))
  )
}

const exportedConstBody = (source: string, constName: string): string => {
  const start = source.indexOf(`export const ${constName}`)

  expect(start).toBeGreaterThanOrEqual(0)

  const nextExport = source.indexOf("\n\nexport const ", start + 1)
  const end = nextExport === -1 ? source.length : nextExport

  return source.slice(start, end)
}

const initialSpawnSetupSource = (source: string): string => {
  const start = source.indexOf("const testLevel")

  expect(start).toBeGreaterThanOrEqual(0)

  const end = source.indexOf("const testPlayer", start)

  expect(end).toBeGreaterThan(start)

  return source.slice(start, end)
}

const sourceBeforeInitialStateInitializer = (source: string): string => {
  const end = source.indexOf("const makeInitialGameState")

  expect(end).toBeGreaterThanOrEqual(0)

  return source.slice(0, end)
}

describe("initial world", () => {
  it("does not generate the initial campground level until world state is read", async () => {
    vi.resetModules()
    let campgroundCalls = 0

    vi.doMock("../src/world.js", async () => {
      const actual = await vi.importActual<WorldModule>("../src/world.js")

      return {
        ...actual,
        CampgroundGenLevel: (
          ...args: Parameters<WorldModule["CampgroundGenLevel"]>
        ) => {
          campgroundCalls += 1
          return actual.CampgroundGenLevel(...args)
        }
      }
    })

    try {
      const module = await importGameloop()

      expect(campgroundCalls).toBe(0)

      Effect.runSync(
        Effect.gen(function*() {
          yield* module.eGetWorld
          yield* module.eGetWorld
        }).pipe(Effect.provide(module.DefaultGameStateStoreLive))
      )

      expect(campgroundCalls).toBe(1)
    } finally {
      vi.doUnmock("../src/world.js")
      vi.resetModules()
    }
  })

  it("places the player on the generated wake-up mud tile", async () => {
    const world = await runGetWorld()
    const entities = Array.from(HashMap.values(world))
    const playerEntityOption = world.pipe(HashMap.get("player"))

    expect(Option.isSome(playerEntityOption)).toBe(true)
    if (Option.isNone(playerEntityOption)) return

    const playerEntity = playerEntityOption.value

    expect(playerEntity._tag).toBe("player")
    if (playerEntity._tag !== "player") return

    const groundAtPlayer = entities.filter(
      (entity) =>
        (
          entity._tag === "floor"
          || entity._tag === "mud"
          || entity._tag === "tunnel"
        )
        && entity.at.x === playerEntity.at.x
        && entity.at.y === playerEntity.at.y
        && entity.at.z === playerEntity.at.z
    )

    expect(playerEntity.at.z).toBe(0)
    expect(groundAtPlayer.map(({ _tag }) => _tag)).toEqual(["mud"])
    for (
      const requiredTag of [
        "tunnel",
        "floor",
        "tent",
        "sign",
        "effigy",
        "temple",
        "stairs-down"
      ] as const
    ) {
      expect(entities.some((entity) => entity._tag === requiredTag)).toBe(
        true
      )
    }
  })

  it("rolls deterministic player attributes for fresh default game states", async () => {
    const firstWorld = await runGetWorld()
    const secondWorld = await runGetWorld()
    const firstPlayer = firstWorld.pipe(HashMap.get("player"))
    const secondPlayer = secondWorld.pipe(HashMap.get("player"))

    expect(Option.isSome(firstPlayer)).toBe(true)
    expect(Option.isSome(secondPlayer)).toBe(true)
    if (Option.isNone(firstPlayer) || Option.isNone(secondPlayer)) return
    expect(firstPlayer.value._tag).toBe("player")
    expect(secondPlayer.value._tag).toBe("player")
    if (
      firstPlayer.value._tag !== "player"
      || secondPlayer.value._tag !== "player"
    ) return

    expect(secondPlayer.value.attributes).toEqual(
      firstPlayer.value.attributes
    )
    expect(firstPlayer.value.attributes).not.toEqual(balancedAttributes)
  })

  it("does not spawn campground NPCs on the player", async () => {
    const world = await runGetWorld()
    const entities = Array.from(HashMap.values(world))
    const playerEntityOption = world.pipe(HashMap.get("player"))
    const isCreature = conforms(AnyCreature)

    expect(Option.isSome(playerEntityOption)).toBe(true)
    if (Option.isNone(playerEntityOption)) return

    const playerEntity = playerEntityOption.value
    const nonPlayerCreaturesAtPlayer = entities.filter((entity) =>
      entity.key !== playerEntity.key
      && isCreature(entity)
      && entity.at.x === playerEntity.at.x
      && entity.at.y === playerEntity.at.y
      && entity.at.z === playerEntity.at.z
    )

    expect(nonPlayerCreaturesAtPlayer).toHaveLength(0)
  })

  it("does not fall back to the origin when selecting the player spawn", () => {
    const gameloopSource = readGameloopSource()
    const initialSpawnSetup = initialSpawnSetupSource(gameloopSource)

    expect(initialSpawnSetup).not.toContain("testLevelFloors.first()?.at")
    expect(initialSpawnSetup).not.toContain("{ x: 0, y: 0, z: 0 }")
    expect(initialSpawnSetup).not.toMatch(
      /(?:\?\?|\|\|)\s*\{\s*x:\s*0,\s*y:\s*0,\s*z:\s*0\s*\}/u
    )
  })

  it("keeps default game state initialization lazy", () => {
    const gameloopSource = readGameloopSource()
    const eagerSource = sourceBeforeInitialStateInitializer(gameloopSource)

    expect(eagerSource).not.toContain("CampgroundGenLevel(")
    expect(eagerSource).not.toContain("GameState.make(")
    expect(gameloopSource).not.toContain("const _state")
    expect(gameloopSource).not.toContain("gameState: undefined")
    expect(gameloopSource).toContain("GameStateStore")
    expect(gameloopSource).toContain("DefaultGameStateStoreLive")
    expect(gameloopSource).toContain("store.modifyEffect")
  })

  it("does not mutate game state from background fibers", () => {
    const gameloopSource = readGameloopSource()

    expect(gameloopSource).not.toContain("Effect.runFork")
    expect(gameloopSource).not.toContain("Effect.fork")
    expect(gameloopSource).not.toContain("Effect.promise")
  })
})

describe("campground active turn region", () => {
  it("processes the player while leaving NPCs without navigable assignments inert", async () => {
    const actor = player(90, 13, 0)
    const nearHippie = hippieAt("hippie-near", 50, 3)
    const farHippie = hippieAt("hippie-far", 70, 50)
    const state = await runWithWorld(
      [
        floorAt("extent-0", 0, 0),
        floorAt("extent-max", 359, 159),
        floorAt("player-floor", 90, 13),
        floorAt("player-target", 91, 13),
        floorAt("near-floor", 50, 3),
        floorAt("near-target", 50, 4),
        floorAt("far-floor", 70, 50),
        floorAt("far-target", 70, 49),
        actor,
        nearHippie,
        farHippie
      ],
      (module) =>
        Effect.gen(function*() {
          yield* module.actPlayerAction(EAction.move({ dir: "E" }))
          const store = yield* GameStateStore
          return yield* store.get
        })
    )
    const world = state.world

    expect(state.turn).toBe(1)
    expect(entityByKey(world, actor.key)?.at).toEqual({
      x: 91,
      y: 13,
      z: 0
    })
    expect(entityByKey(world, nearHippie.key)?.at).toEqual({
      x: 50,
      y: 3,
      z: 0
    })
    expect(entityByKey(world, farHippie.key)?.at).toEqual({
      x: 70,
      y: 50,
      z: 0
    })
  })

  it("does not lazily move an offscreen NPC into the active collision bounds", async () => {
    const actor = player(90, 13, 0)
    const boundaryHippie = hippieAt("hippie-boundary", 70, 29)
    const world = await runWithWorld(
      [
        floorAt("extent-0", 0, 0),
        floorAt("extent-max", 359, 159),
        floorAt("player-floor", 90, 13),
        floorAt("player-target", 91, 13),
        floorAt("boundary-floor", 70, 29),
        floorAt("boundary-target", 70, 28),
        actor,
        boundaryHippie
      ],
      (module) =>
        Effect.gen(function*() {
          yield* module.actPlayerAction(EAction.move({ dir: "E" }))
          return yield* module.eGetWorld
        })
    )

    expect(entityByKey(world, actor.key)?.at).toEqual({
      x: 91,
      y: 13,
      z: 0
    })
    expect(entityByKey(world, boundaryHippie.key)?.at).toEqual(
      boundaryHippie.at
    )
  })

  it("rotates the lazy offscreen budget even when generic NPCs have no AI", async () => {
    const actor = player(90, 13, 0)
    const hippies = Array.from(
      { length: 6 },
      (_, index) => hippieAt(`hippie-${index}`, 70, 50 + index)
    )
    const state = await runWithWorld(
      [
        floorAt("extent-0", 0, 0),
        floorAt("extent-max", 359, 159),
        floorAt("player-floor", 90, 13),
        ...hippies.flatMap((hippie) => [
          floorAt(`${hippie.key}-floor`, hippie.at.x, hippie.at.y),
          floorAt(`${hippie.key}-target`, hippie.at.x, hippie.at.y - 1),
          hippie
        ]),
        actor
      ],
      (module) =>
        Effect.gen(function*() {
          yield* module.actPlayerAction(EAction.noop())
          yield* module.actPlayerAction(EAction.noop())
          const store = yield* GameStateStore
          return yield* store.get
        })
    )

    expect(state.lazyOffscreenCursor).toBe(2)
    const world = state.world
    expect(entityByKey(world, "hippie-4")?.at).toEqual({
      x: 70,
      y: 54,
      z: 0
    })
    expect(entityByKey(world, "hippie-5")?.at).toEqual({
      x: 70,
      y: 55,
      z: 0
    })
  })

  it("returns a bounded client state while preserving the full world", async () => {
    const fullWorld = await runWithWorld(
      [
        floorAt("extent-0", 0, 0),
        floorAt("extent-max", 359, 159),
        floorAt("visible-floor", 90, 13),
        floorAt("far-floor", 250, 120),
        player(90, 13, 0),
        makeBeer("inventory-beer", 90, 13, 0, "player")
      ],
      (module) =>
        Effect.gen(function*() {
          const getClientState = (module as typeof module & {
            readonly getClientState: Effect.Effect<
              ClientStateValue,
              never,
              GameStateStore
            >
          }).getClientState
          const state = yield* getClientState
          const world = yield* module.eGetWorld
          return { state, world }
        })
    )

    expect(HashMap.size(fullWorld.world)).toBe(6)
    expect(HashMap.size(fullWorld.state.world)).toBeLessThan(
      HashMap.size(fullWorld.world)
    )
    expect(entityByKey(fullWorld.state.world, "visible-floor"))
      .toBeDefined()
    expect(entityByKey(fullWorld.state.world, "far-floor")).toBeUndefined()
    expect(HashMap.size(fullWorld.state.inventory)).toBe(1)
    expect(fullWorld.state.campground).toEqual({
      discoveredLandmarks: [],
      weather: { condition: "heavy-rain" }
    })
    expect(fullWorld.state.gameplayEvents).toEqual([])
  })

  it("returns only the current dungeon level when campground bounds do not apply", async () => {
    const result = await runWithWorld(
      [
        floorAt("campground-floor", 1, 1),
        {
          ...floorAt("dungeon-tunnel", 1, 1),
          _tag: "tunnel",
          at: { x: 1, y: 1, z: 1 }
        },
        player(1, 1, 1),
        makeBeer("inventory-beer", 1, 1, 1, "player")
      ],
      (module) => module.getClientState
    )

    expect(entityByKey(result.world, "player")).toBeDefined()
    expect(entityByKey(result.world, "dungeon-tunnel")).toBeDefined()
    expect(entityByKey(result.world, "campground-floor")).toBeUndefined()
    expect(entityByKey(result.world, "inventory-beer")).toBeUndefined()
    expect(HashMap.size(result.inventory)).toBe(1)
    expect(result.campground).toEqual({ discoveredLandmarks: [] })
  })

  it("keeps lazy offscreen processing scoped to the active campground level", async () => {
    const actor = player(90, 13, 0)
    const otherLevelHippie = {
      ...hippieAt("hippie-other-level", 70, 50),
      at: { x: 70, y: 50, z: 1 }
    } satisfies Entity
    const world = await runWithWorld(
      [
        floorAt("extent-0", 0, 0),
        floorAt("extent-max", 359, 159),
        floorAt("player-floor", 90, 13),
        {
          ...floorAt("other-level-floor", 70, 50),
          at: { x: 70, y: 50, z: 1 }
        },
        {
          ...floorAt("other-level-target", 70, 49),
          at: { x: 70, y: 49, z: 1 }
        },
        actor,
        otherLevelHippie
      ],
      (module) =>
        Effect.gen(function*() {
          yield* module.actPlayerAction(EAction.noop())
          return yield* module.eGetWorld
        })
    )

    expect(entityByKey(world, otherLevelHippie.key)?.at).toEqual(
      otherLevelHippie.at
    )
  })

  it("keeps generic non-campground NPCs inert", async () => {
    const actor = player(90, 13, 0)
    const farHippie = hippieAt("hippie-far", 70, 50)
    const world = await runWithWorld(
      [
        floorAt("player-floor", 90, 13),
        floorAt("player-target", 91, 13),
        floorAt("far-floor", 70, 50),
        floorAt("far-target", 70, 49),
        actor,
        farHippie
      ],
      (module) =>
        Effect.gen(function*() {
          yield* module.actPlayerAction(EAction.move({ dir: "E" }))
          return yield* module.eGetWorld
        })
    )

    expect(entityByKey(world, actor.key)?.at).toEqual({
      x: 91,
      y: 13,
      z: 0
    })
    expect(entityByKey(world, farHippie.key)?.at).toEqual({
      x: 70,
      y: 50,
      z: 0
    })
  })
})

describe("getPickupItemsFor", () => {
  it("returns an empty HashMap for a missing entity", async () => {
    const items = await runGetPickupItemsFor("__missing__")

    expect(Array.from(HashMap.values(items))).toHaveLength(0)
  })

  it("excludes terrain and creatures from pickup items at the player", async () => {
    const isTerrain = conforms(AnyTerrain)
    const isCreature = conforms(AnyCreature)
    const items = await runGetPickupItemsFor("player")
    const values = Array.from(HashMap.values(items))

    expect(values.some(isTerrain)).toBe(false)
    expect(values.some(isCreature)).toBe(false)
    expect(values.map((entity) => entity._tag)).not.toContain("floor")
  })

  it("does not handle missing entities through NoSuchElementException catchTag", () => {
    const gameloopSource = readGameloopSource()
    const legacyCatchTag = [
      "catchTag(\"NoSuchElement",
      "Exception\""
    ].join("")

    expect(gameloopSource).not.toContain(legacyCatchTag)
  })

  it("filters inventory and pickup results through the item guard", () => {
    const gameloopSource = readGameloopSource()
    const pickupBody = exportedConstBody(
      gameloopSource,
      "getPickupItemsFor"
    )

    expect(gameloopSource).toContain("const inventoryForWorld")
    expect(gameloopSource).toContain("filter(isItem)")
    expect(pickupBody).toContain("HashMap.filter(isItem)")
  })
})

describe("loot queries", () => {
  it("returns floor containers under the player", async () => {
    const actor = player(2, 3, 0)
    const cooler = makeCooler("cooler-1", 2, 3, 0)
    const offTileCooler = makeCooler("cooler-2", 3, 3, 0)
    const water = makeWaterBottle("water-1", 2, 3, 0)

    const containers = await runWithWorld(
      [actor, cooler, offTileCooler, water],
      (module) => module.getLootContainersFor(actor.key)
    )
    const values = Array.from(HashMap.values(containers))

    expect(values.map((entity) => entity.key)).toEqual([cooler.key])
  })

  it("returns items inside an accessible floor container", async () => {
    const actor = player(2, 3, 0)
    const cooler = makeCooler("cooler-1", 2, 3, 0)
    const beer = makeBeer("beer-1", 2, 3, 0, cooler.key)
    const water = makeWaterBottle("water-1", 2, 3, 0)

    const contents = await runWithWorld(
      [actor, cooler, beer, water],
      (module) => module.getLootItemsFor(actor.key, cooler.key)
    )
    const values = Array.from(HashMap.values(contents))

    expect(values.map((entity) => entity.key)).toEqual([beer.key])
  })

  it("does not return contents for inaccessible containers", async () => {
    const actor = player(2, 3, 0)
    const cooler = makeCooler("cooler-1", 3, 3, 0)
    const beer = makeBeer("beer-1", 3, 3, 0, cooler.key)

    const contents = await runWithWorld(
      [actor, cooler, beer],
      (module) => module.getLootItemsFor(actor.key, cooler.key)
    )

    expect(Array.from(HashMap.values(contents))).toHaveLength(0)
  })
})
