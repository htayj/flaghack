import { EEntity, Pos } from "@flaghack/domain/schemas"
import { identity, Match, Option } from "effect"
import { defined } from "effect/Match"
import { List, Map, Set } from "immutable"
import { nullMatrix, UndefOr } from "./util.js"
import { BSPGenLevel, Entity, World } from "./world.js"
console.log("testing bsp")

type Pos = typeof Pos.Type
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

type VEntity = { dist: number; entity: Entity }
export type Tiles = Tile[][]
const getTile = (e: UndefOr<Entity>): Tile =>
  defined(e)
    ? EEntity.$match({
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
      wall: () => ({ color: "white", char: "#" }),
      tunnel: () => ({ color: "black", bright: true, char: "," }),
      floor: () => ({ color: "black", bright: true, char: "." })
    })(e) as Tile
    : { color: "black", char: ".", bright: true }

const tileToText = ({ color, char, bright, bg }: Tile) => `${char}`

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
      .map(
        (v) => ({
          color: "white",
          char: v?.dist === Infinity ? "i" : v?.dist.toString() ?? "?"
        } as Tile)
      )
  )
  return fullmap.map((r) => r.toArray()).toArray()
}
export const simpleDraw = (w: World) =>
  drawWorld(w).map((row) => row.map(tileToText).join("")).join("\n")

export const dijDraw = (w: Set<VEntity>) =>
  drawDij(w).map((row) => row.map(tileToText).join("")).join("\n")
