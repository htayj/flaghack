import { DirectionalVariant, EEntity, Entity } from "./schemas.js"
type Entity = typeof Entity.Type
const getWallVariantChar = (v: typeof DirectionalVariant.Type) => {
  switch (v) {
    case "vertical":
      return "│"
    case "horizontal":
      return "─"
    case "topLeft":
      return "┌"
    case "topRight":
      return "┐"
    case "bottomLeft":
      return "└"
    case "bottomRight":
      return "┘"
    case "cross":
      return "┼"
    case "t-up":
      return "┴"
    case "t-down":
      return "┬"
    case "t-left":
      return "┤"
    case "t-right":
      return "├"
    default:
      return " "
  }
}
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
export const getTile = (e: Entity): Tile =>
  EEntity.$match({
    player: () => ({ color: "white", char: "@" }),
    ranger: () => ({ color: "magenta", char: "@" }),
    hippie: () => ({ color: "yellow", char: "h" }),
    wook: () => ({ color: "cyan", char: "h" }),
    acidcop: () => ({ color: "magenta", char: "K" }),
    lesser_egregore: () => ({ color: "green", char: "e" }),
    greater_egregore: () => ({ color: "green", char: "E" }),
    collective_egregore: () => ({ color: "green", char: "E" }),
    flag: () => ({ color: "yellow", bright: true, char: "F" }),
    water: () => ({ color: "cyan", char: "!" }),
    booze: () => ({ color: "yellow", char: "!" }),
    milk: () => ({ color: "white", char: "!" }),
    acid: () => ({ color: "green", char: "!" }),
    bacon: () => ({ color: "red", bright: true, char: "%" }),
    poptart: () => ({ color: "yellow", bright: true, char: "%" }),
    trailmix: () => ({ color: "yellow", char: "%" }),
    pancake: () => ({ color: "white", bright: true, char: "%" }),
    soup: () => ({ color: "red", char: "%" }),
    wall: ({ variant }) => ({
      color: "white",
      bright: false,
      char: getWallVariantChar(variant)
    }),
    tunnel: () => ({ color: "white", bright: false, char: "#" }),
    floor: () => ({ color: "black", bright: true, char: "·" })
  })(e) as Tile
