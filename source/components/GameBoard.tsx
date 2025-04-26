import React from 'react';
import {Box, Text} from 'ink';

/* type GameState = {
 * 	playerPosition: Pos;
 * }; */
type Props = {
	tiles: Tiles;
};
/* type entityBase = {
 * 	tile: Tile;
 * 	pos: Pos;
 * }; */

/* type Player = entityBase & {animate: true};
 * type Wall = entityBase & {animate: false};
 * type Floor = entityBase & {animate: false};
 * type Entity = Player | Wall | Floor | undefined; */
export type Tiles = string[][];

/* const testTiles = Array<string[]>(20).fill(Array<string>(20).fill('.')); */
/* type Tile = '.' | '@'; */
/* const boardHeight = 20;
 * const boardWidth = 20; */
export default function ({tiles}: Props) {
	/* const {playerPosition} = state;
	const drawing = Array<Entity[]>(boardHeight)
		.map(() => Array<Entity>(boardWidth))
		.map((row, y) =>
			row.map((_, x) =>
				playerPosition.y === y && playerPosition.x === x
					? {tile: '@', animate: false}
					: {tile: '.', animate: false},
			),
		)
		.map(r => r.map(c => c.tile));
	console.log('drawing: ', drawing); */
	return (
		<Box
			borderStyle="round"
			height={tiles.length + 2}
			width={(tiles[0]?.length ?? 1) + 2}
		>
			<Text>{tiles.map(row => row.join('')).join('\n')}</Text>
		</Box>
	);
}
