import { Pos } from "@flaghack/domain/schemas"
import { TKey } from "./entity.js"

export type TPos = typeof Pos.Type
export const UV = {
  Left: { x: -1, y: 0 },
  Right: { x: 1, y: 0 },
  Up: { x: 0, y: -1 },
  Down: { x: 0, y: 1 },
  UpLeft: { x: -1, y: -1 },
  UpRight: { x: 1, y: -1 },
  DownRight: { x: 1, y: 1 },
  DownLeft: { x: -1, y: 1 }
} as const
export const collideP =
  (a: TPos, ain: TKey = "world") => (b: TPos, bin: TKey = "world") =>
    ain === bin && a.x === b.x && a.y === b.y
export const shift = (pos: TPos, by: TPos): TPos => ({
  x: pos.x + by.x,
  y: pos.y + by.y
})
