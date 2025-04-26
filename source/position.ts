export type Pos = {x: number; y: number};

export const collideP = (a: Pos) => (b: Pos) => a.x === b.x && a.y === b.y;
export const shift = (pos: Pos, by: Pos): Pos => ({
	x: pos.x + by.x,
	y: pos.y + by.y,
});
