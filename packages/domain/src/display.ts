import {
  type DirectionalVariant as DirectionalVariantSchema,
  EEntity,
  type Entity as EntitySchema
} from "./schemas.js"

type Entity = typeof EntitySchema.Type
type WallVariant = typeof DirectionalVariantSchema.Type

const wallVariantChars = {
  vertical: "│",
  horizontal: "─",
  topLeft: "┌",
  topRight: "┐",
  bottomLeft: "└",
  bottomRight: "┘",
  cross: "┼",
  "t-up": "┴",
  "t-down": "┬",
  "t-left": "┤",
  "t-right": "├",
  none: " "
} satisfies Record<WallVariant, string>

const getWallVariantChar = (variant: WallVariant): string =>
  wallVariantChars[variant]

export type Color =
  | "black"
  | "red"
  | "green"
  | "yellow"
  | "blue"
  | "magenta"
  | "cyan"
  | "white"
export type Tile = {
  char: string
  color?: Color
  bright?: boolean
  bg?: boolean
}

const tile = (value: Tile): Tile => value

export const getTile = (e: Entity): Tile =>
  EEntity.$match({
    player: () => tile({ color: "white", char: "@" }),
    ranger: () => tile({ color: "magenta", char: "@" }),
    hippie: () => tile({ color: "yellow", char: "h" }),
    wook: () => tile({ color: "cyan", char: "h" }),
    acidcop: () => tile({ color: "magenta", char: "K" }),
    lesser_egregore: () => tile({ color: "green", char: "e" }),
    greater_egregore: () => tile({ color: "green", char: "E" }),
    collective_egregore: () => tile({ color: "green", char: "E" }),
    flag: () => tile({ color: "yellow", bright: true, char: "F" }),
    water: () => tile({ color: "cyan", char: "!" }),
    booze: () => tile({ color: "yellow", char: "!" }),
    milk: () => tile({ color: "white", char: "!" }),
    acid: () => tile({ color: "green", char: "!" }),
    bacon: () => tile({ color: "red", bright: true, char: "%" }),
    poptart: () => tile({ color: "yellow", bright: true, char: "%" }),
    trailmix: () => tile({ color: "yellow", char: "%" }),
    pancake: () => tile({ color: "white", bright: true, char: "%" }),
    soup: () => tile({ color: "red", char: "%" }),
    hammer: () => tile({ color: "white", bright: true, char: "T" }),
    nails: () => tile({ color: "cyan", bright: true, char: ":" }),
    wall: ({ variant }) =>
      tile({
        color: "white",
        bright: false,
        char: getWallVariantChar(variant)
      }),
    tunnel: () => tile({ color: "white", bright: false, char: "#" }),
    floor: () => tile({ color: "black", bright: true, char: "·" })
  })(e)
