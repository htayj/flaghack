import { describe, expect, it } from "@effect/vitest"
import {
  AnyDrink,
  AnyFood,
  AnyItem,
  AnyTerrain,
  conforms,
  Entity,
  ItemCollection,
  Pos,
  SAction,
  World
} from "@flaghack/domain/schemas"
import { Either, HashMap, Schema as S } from "effect"
import { readFileSync } from "node:fs"

const expectRight = <A, E>(either: Either.Either<A, E>): A =>
  Either.match(either, {
    onLeft: (error) => {
      throw new Error(
        `Expected schema validation to succeed: ${String(error)}`
      )
    },
    onRight: (value) => value
  })

const sampleFloor = {
  _tag: "floor" as const,
  key: "floor-1",
  in: "world",
  at: { x: 1, y: 2, z: 0 }
}

const sampleItem = {
  _tag: "flag" as const,
  key: "flag-1",
  in: "world",
  at: { x: 1, y: 2, z: 0 }
}

const sampleCooler = {
  _tag: "cooler" as const,
  key: "cooler-1",
  in: "world",
  at: { x: 5, y: 6, z: 0 }
}

const sampleBeer = {
  _tag: "beer" as const,
  key: "beer-1",
  in: sampleCooler.key,
  at: sampleCooler.at
}

const refrigeratedCampFoodSamples = [
  {
    _tag: "hotdog" as const,
    key: "hotdog-1",
    in: sampleCooler.key,
    at: sampleCooler.at
  },
  {
    _tag: "cheese" as const,
    key: "cheese-1",
    in: sampleCooler.key,
    at: sampleCooler.at
  },
  {
    _tag: "salsa" as const,
    key: "salsa-1",
    in: sampleCooler.key,
    at: sampleCooler.at
  }
]

const readSchemasSource = () =>
  readFileSync(new URL("../src/schemas.ts", import.meta.url), "utf8")

describe("domain source schemas", () => {
  it("documents current location schema intent in source", () => {
    const source = readSchemasSource()

    expect(source).not.toMatch(/\bexport\s+const\s+Location\b/)
    expect(source).toMatch(
      /export\s+const\s+World\s*=\s*S\.HashMap\s*\(\s*\{\s*key\s*:\s*Key\s*,\s*value\s*:\s*Entity\s*\}\s*\)/
    )
    expect(source).not.toMatch(
      /export\s+const\s+World\s*=\s*S\.HashMap\s*\(\s*\{\s*key\s*:\s*S\.String\s*,\s*value\s*:\s*Entity\s*\}\s*\)/
    )
  })

  it("requires current World entity values to include at and in", () => {
    const missingAtWorld = HashMap.fromIterable<string, unknown>([[
      "floor-missing-at",
      {
        _tag: "floor" as const,
        key: "floor-missing-at",
        in: "world"
      }
    ]])
    const missingInWorld = HashMap.fromIterable<string, unknown>([[
      "floor-missing-in",
      {
        _tag: "floor" as const,
        key: "floor-missing-in",
        at: { x: 1, y: 2, z: 0 }
      }
    ]])

    expect(Either.isLeft(S.validateEither(World)(missingAtWorld))).toBe(
      true
    )
    expect(Either.isLeft(S.validateEither(World)(missingInWorld))).toBe(
      true
    )
  })

  it("requires three-dimensional positions", () => {
    expect(Either.isRight(S.validateEither(Pos)(sampleFloor.at))).toBe(
      true
    )
    expect(
      Either.isRight(S.validateEither(Pos)({ x: -1, y: -2, z: -3 }))
    ).toBe(true)
    expect(Either.isLeft(S.validateEither(Pos)({ x: 1, y: 2 }))).toBe(true)

    for (
      const fractionalPosition of [
        { x: 1.5, y: 2, z: 0 },
        { x: 1, y: 2.5, z: 0 },
        { x: 1, y: 2, z: 0.5 }
      ]
    ) {
      expect(Either.isLeft(S.validateEither(Pos)(fractionalPosition)))
        .toBe(
          true
        )
    }
  })

  it("decodes current movement and multi-item actions", () => {
    expectRight(S.decodeUnknownEither(SAction)({ _tag: "move", dir: "N" }))
    expectRight(
      S.decodeUnknownEither(SAction)({
        _tag: "pickupMulti",
        keys: ["floor-1", "flag-1"]
      })
    )
    expectRight(
      S.decodeUnknownEither(SAction)({
        _tag: "dropMulti",
        keys: ["floor-1", "flag-1"]
      })
    )

    expect(
      Either.isLeft(
        S.decodeUnknownEither(SAction)({
          _tag: "pickup",
          object: sampleItem
        })
      )
    ).toBe(true)
  })

  it("validates a tiny world HashMap from source schema", () => {
    const world = HashMap.fromIterable([[sampleFloor.key, sampleFloor]])

    expect(HashMap.size(world)).toBe(1)
    expect(Either.isRight(S.validateEither(World)(world))).toBe(true)
  })

  it("narrows item collections to item HashMap values", () => {
    const itemCollection = HashMap.fromIterable([[
      sampleItem.key,
      sampleItem
    ]])
    const terrainCollection = HashMap.fromIterable([[
      sampleFloor.key,
      sampleFloor
    ]])

    expect(
      Either.isRight(S.validateEither(ItemCollection)(itemCollection))
    )
      .toBe(true)
    expect(
      Either.isLeft(S.validateEither(ItemCollection)(terrainCollection))
    )
      .toBe(true)
  })

  it("validates coolers, beer, and refrigerated camp food as items", () => {
    const coolerItems = [
      sampleCooler,
      sampleBeer,
      ...refrigeratedCampFoodSamples
    ]

    for (const item of coolerItems) {
      expect(Either.isRight(S.validateEither(AnyItem)(item))).toBe(true)
      expect(Either.isRight(S.validateEither(Entity)(item))).toBe(true)
    }

    expect(Either.isRight(S.validateEither(AnyDrink)(sampleBeer))).toBe(
      true
    )
    for (const food of refrigeratedCampFoodSamples) {
      expect(Either.isRight(S.validateEither(AnyFood)(food))).toBe(true)
    }
  })

  it("exposes conforms as a terrain type guard", () => {
    const conformsToTerrain: (u: unknown) => u is typeof AnyTerrain.Type =
      conforms(AnyTerrain)

    expect(conformsToTerrain(sampleFloor)).toBe(true)
    expect(
      conformsToTerrain({
        _tag: "flag",
        key: "flag-1",
        in: "world",
        at: { x: 0, y: 0, z: 0 }
      })
    ).toBe(false)
  })

  it("validates campground terrain markers in worlds", () => {
    const campgroundTerrain = [
      {
        _tag: "tent" as const,
        key: "tent-1",
        in: "world",
        at: { x: 0, y: 0, z: 0 }
      },
      {
        _tag: "sign" as const,
        key: "sign-1",
        in: "world",
        at: { x: 1, y: 0, z: 0 },
        name: "Camp Schema"
      },
      {
        _tag: "effigy" as const,
        key: "effigy-1",
        in: "world",
        at: { x: 2, y: 0, z: 0 }
      },
      {
        _tag: "temple" as const,
        key: "temple-1",
        in: "world",
        at: { x: 3, y: 0, z: 0 }
      }
    ]
    const world = HashMap.fromIterable(
      campgroundTerrain.map((entity) => [entity.key, entity] as const)
    )

    for (const terrain of campgroundTerrain) {
      expect(Either.isRight(S.validateEither(AnyTerrain)(terrain)))
        .toBe(true)
    }
    expect(Either.isRight(S.validateEither(World)(world))).toBe(true)
  })

  it("implements conforms with canonical Schema.is validation", () => {
    const source = readSchemasSource()
    const conformsStart = source.indexOf("export const conforms")
    const worldStart = source.indexOf("export const World", conformsStart)
    const effectImport = source
      .split("\n")
      .find((line) => line.includes("from \"effect\"")) ?? ""

    expect(conformsStart).toBeGreaterThanOrEqual(0)
    expect(worldStart).toBeGreaterThan(conformsStart)
    const implementation = source.slice(conformsStart, worldStart)

    expect(effectImport).not.toContain("Either")
    expect(implementation).toContain("S.is")
    expect(implementation).not.toContain("validateEither")
    expect(implementation).not.toContain("Either.match")
  })
})
