import { describe, expect, it } from "@effect/vitest"
import {
  formatLevelStatusLabel,
  getTile,
  type Tile
} from "@flaghack/domain/display"
import {
  type DirectionalVariant as DirectionalVariantSchema,
  Entity as EntitySchema,
  type Wall as WallSchema
} from "@flaghack/domain/schemas"
import { Either, Schema as S } from "effect"

type WallVariant = typeof DirectionalVariantSchema.Type
type Entity = typeof EntitySchema.Type
type Wall = typeof WallSchema.Type
type ExpectedWallTile = Required<Pick<Tile, "bright" | "char" | "color">>

const expectRight = <A, E>(either: Either.Either<A, E>): A =>
  Either.match(either, {
    onLeft: (error) => {
      throw new Error(
        `Expected schema validation to succeed: ${String(error)}`
      )
    },
    onRight: (value) => value
  })

const expectedWallTiles = {
  vertical: { char: "│", color: "white", bright: false },
  horizontal: { char: "─", color: "white", bright: false },
  topLeft: { char: "┌", color: "white", bright: false },
  topRight: { char: "┐", color: "white", bright: false },
  bottomLeft: { char: "└", color: "white", bright: false },
  bottomRight: { char: "┘", color: "white", bright: false },
  cross: { char: "┼", color: "white", bright: false },
  "t-up": { char: "┴", color: "white", bright: false },
  "t-down": { char: "┬", color: "white", bright: false },
  "t-left": { char: "┤", color: "white", bright: false },
  "t-right": { char: "├", color: "white", bright: false },
  none: { char: " ", color: "white", bright: false }
} satisfies Record<WallVariant, ExpectedWallTile>

const wallVariants = Object.keys(expectedWallTiles) as ReadonlyArray<
  WallVariant
>

const makeWall = (variant: WallVariant): Wall => ({
  _tag: "wall",
  key: `wall-${variant}`,
  in: "world",
  at: { x: 0, y: 0, z: 0 },
  variant
})

const makeTentWall = (variant: WallVariant): Entity => ({
  _tag: "tent-wall",
  key: `tent-wall-${variant}`,
  in: "world",
  at: { x: 0, y: 0, z: 0 },
  variant
})

const tentPost = {
  _tag: "tent-post",
  key: "tent-post-1",
  in: "world",
  at: { x: 0, y: 0, z: 0 }
} satisfies Entity

describe("getTile", () => {
  it("renders every directional wall variant", () => {
    for (const variant of wallVariants) {
      expect(getTile(makeWall(variant))).toEqual(
        expectedWallTiles[variant]
      )
    }
  })

  it("renders campground terrain markers", () => {
    const campgroundMarkers = [
      {
        entity: {
          _tag: "tent",
          key: "tent-1",
          in: "world",
          at: { x: 0, y: 0, z: 0 }
        },
        tile: { char: "^", color: "yellow", bright: true }
      },
      {
        entity: makeTentWall("vertical"),
        tile: { char: "│", color: "yellow", bright: false }
      },
      {
        entity: tentPost,
        tile: { char: "┼", color: "yellow", bright: false }
      },
      {
        entity: {
          _tag: "sign",
          key: "sign-1",
          in: "world",
          at: { x: 1, y: 0, z: 0 },
          name: "Camp Type Safety"
        },
        tile: { char: "?", color: "cyan", bright: true }
      },
      {
        entity: {
          _tag: "effigy",
          key: "effigy-1",
          in: "world",
          at: { x: 2, y: 0, z: 0 }
        },
        tile: { char: "Y", color: "red", bright: true }
      },
      {
        entity: {
          _tag: "temple",
          key: "temple-1",
          in: "world",
          at: { x: 3, y: 0, z: 0 }
        },
        tile: { char: "Ω", color: "magenta", bright: true }
      }
    ] satisfies ReadonlyArray<{
      readonly entity: Entity
      readonly tile: Tile
    }>

    for (const { entity, tile } of campgroundMarkers) {
      expect(getTile(entity)).toEqual(tile)
    }
  })

  it("renders coolers and refrigerated cooler contents", () => {
    const coolerItems = [
      {
        entity: {
          _tag: "cooler",
          key: "cooler-1",
          in: "world",
          at: { x: 0, y: 0, z: 0 }
        },
        tile: { char: "C", color: "cyan", bright: true }
      },
      {
        entity: {
          _tag: "beer",
          key: "beer-1",
          in: "cooler-1",
          at: { x: 0, y: 0, z: 0 }
        },
        tile: { char: "!", color: "yellow", bright: true }
      },
      {
        entity: {
          _tag: "hotdog",
          key: "hotdog-1",
          in: "cooler-1",
          at: { x: 0, y: 0, z: 0 }
        },
        tile: { char: "%", color: "red", bright: true }
      },
      {
        entity: {
          _tag: "cheese",
          key: "cheese-1",
          in: "cooler-1",
          at: { x: 0, y: 0, z: 0 }
        },
        tile: { char: "%", color: "yellow", bright: true }
      },
      {
        entity: {
          _tag: "salsa",
          key: "salsa-1",
          in: "cooler-1",
          at: { x: 0, y: 0, z: 0 }
        },
        tile: { char: "%", color: "red" }
      }
    ] satisfies ReadonlyArray<{
      readonly entity: unknown
      readonly tile: Tile
    }>

    for (const { entity, tile } of coolerItems) {
      const decodedEntity = expectRight(
        S.decodeUnknownEither(EntitySchema)(entity)
      )

      expect(getTile(decodedEntity)).toEqual(tile)
    }
  })
})

describe("formatLevelStatusLabel", () => {
  it("labels the campground level as burn and dungeon levels numerically", () => {
    expect(formatLevelStatusLabel(undefined)).toBe("?")
    expect(formatLevelStatusLabel(0)).toBe("burn")
    expect(formatLevelStatusLabel(2)).toBe("3")
  })
})
