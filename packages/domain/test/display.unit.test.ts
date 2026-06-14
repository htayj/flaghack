import { describe, expect, it } from "@effect/vitest"
import { getTile, type Tile } from "@flaghack/domain/display"
import {
  type DirectionalVariant as DirectionalVariantSchema,
  type Wall as WallSchema
} from "@flaghack/domain/schemas"

type WallVariant = typeof DirectionalVariantSchema.Type
type Wall = typeof WallSchema.Type
type ExpectedWallTile = Required<Pick<Tile, "bright" | "char" | "color">>

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

describe("getTile", () => {
  it("renders every directional wall variant", () => {
    for (const variant of wallVariants) {
      expect(getTile(makeWall(variant))).toEqual(
        expectedWallTiles[variant]
      )
    }
  })
})
