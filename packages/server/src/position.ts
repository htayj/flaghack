export type Pos = { x: number; y: number }

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
export const collideP = (a: Pos) => (b: Pos) => a.x === b.x && a.y === b.y
export const shift = (pos: Pos, by: Pos): Pos => ({
  x: pos.x + by.x,
  y: pos.y + by.y
})
