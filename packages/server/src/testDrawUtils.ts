import { EEntity, type Pos as PosSchema } from "@flaghack/domain/schemas"
import { Option } from "effect"
import { defined } from "effect/Match"
import { List, Map, type Set } from "immutable"
import { nullMatrix } from "./util.js"
import type { Entity, World } from "./world.js"

type Pos = typeof PosSchema.Type
type Color =
  | "black"
  | "red"
  | "green"
  | "yellow"
  | "blue"
  | "magenta"
  | "cyan"
  | "white"
type Tile = {
  char: string
  color?: Color
  bright?: boolean
  bg?: boolean
}

const tile = (value: Tile): Tile => value

type VEntity = { dist: number; entity: Entity }
export type Tiles = Array<Array<Tile>>
const getTile = (e: Entity | undefined): Tile =>
  defined(e)
    ? EEntity.$match({
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
      beer: () => tile({ color: "yellow", bright: true, char: "!" }),
      milk: () => tile({ color: "white", char: "!" }),
      acid: () => tile({ color: "green", char: "!" }),
      bacon: () => tile({ color: "red", bright: true, char: "%" }),
      poptart: () => tile({ color: "yellow", bright: true, char: "%" }),
      trailmix: () => tile({ color: "yellow", char: "%" }),
      pancake: () => tile({ color: "white", bright: true, char: "%" }),
      soup: () => tile({ color: "red", char: "%" }),
      hotdog: () => tile({ color: "red", bright: true, char: "%" }),
      cheese: () => tile({ color: "yellow", bright: true, char: "%" }),
      salsa: () => tile({ color: "red", char: "%" }),
      cooler: () => tile({ color: "cyan", bright: true, char: "C" }),
      hammer: () => tile({ color: "white", bright: true, char: "T" }),
      nails: () => tile({ color: "cyan", bright: true, char: ":" }),
      wall: () => tile({ color: "white", char: "#" }),
      "tent-wall": () => tile({ color: "yellow", char: "#" }),
      "tent-post": () => tile({ color: "yellow", char: "┼" }),
      tunnel: () => tile({ color: "black", bright: true, char: "," }),
      floor: () => tile({ color: "black", bright: true, char: "." }),
      tent: () => tile({ color: "yellow", bright: true, char: "^" }),
      sign: () => tile({ color: "cyan", bright: true, char: "?" }),
      effigy: () => tile({ color: "red", bright: true, char: "Y" }),
      temple: () => tile({ color: "magenta", bright: true, char: "Ω" })
    })(e)
    : { color: "black", char: ".", bright: true }

const tileToText = ({ char }: Tile) => `${char}`

const getPosition = (e: Entity): Option.Option<Pos> =>
  e.in === "world" ? Option.some(e.at) : Option.none()
const posKey = (p: Omit<Pos, "z">): string => `${p.x},${p.y}`
const drawWorld = (world: World): Tiles => {
  const emptyMatrix = nullMatrix(20, 78)
  const worldMap = Map(world)
    .valueSeq()
    .groupBy((entity) =>
      Option.getOrNull(
        Option.map(getPosition(entity), (p: Pos) => posKey(p))
      )
    )
    .map((v) => v.valueSeq().toArray())
  const fullmap = emptyMatrix.map((row, y) =>
    row
      .map((_, x) => worldMap.get(posKey({ x, y })))
      .map(List)
      .map((l) => l.first())
      .map(getTile)
  )
  return fullmap.map((r) => r.toArray()).toArray()
}
const drawDij = (world: Set<VEntity>): Tiles => {
  const emptyMatrix = nullMatrix(20, 78)
  const worldMap = world
    .valueSeq()
    .groupBy((entity) =>
      Option.getOrNull(
        Option.map(getPosition(entity.entity), (p: Pos) => posKey(p))
      )
    )
    .map((v) => v.valueSeq().toArray())
  const fullmap = emptyMatrix.map((row, y) =>
    row
      .map((_, x) => worldMap.get(posKey({ x, y })))
      .map(List)
      .map((l) => l.first())
      .map((v) =>
        tile({
          color: "white",
          char: v?.dist === Infinity ? "i" : v?.dist.toString() ?? "?"
        })
      )
  )
  return fullmap.map((r) => r.toArray()).toArray()
}
export const simpleDraw = (w: World) =>
  drawWorld(w).map((row) => row.map(tileToText).join("")).join("\n")

export const dijDraw = (w: Set<VEntity>) =>
  drawDij(w).map((row) => row.map(tileToText).join("")).join("\n")
