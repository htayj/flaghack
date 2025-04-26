import React from 'react';
import {Box, Text} from 'ink';

type Props = {
	tiles: Tiles;
};
export type Tile = {char: string; color?: string};
// export type Tiles = string[][];
export type Tiles = Tile[][];

const colorToEsc = (color?: string) =>
	color === 'yellow' ? `\x1b[33m` : color === 'grey' ? `\x1b[90m` : `\x1b[37m`;
export default function ({tiles}: Props) {
	const tileToText = (t: Tile) => `${colorToEsc(t.color)}${t.char}`;
	return (
		<Box
			borderStyle="round"
			height={tiles.length + 2}
			width={(tiles[0]?.length ?? 1) + 2}
		>
			<Text>{tiles.map(row => row.map(tileToText).join('')).join('\n')}</Text>
		</Box>
	);
}
