import React from 'react';
import {Box, Text} from 'ink';

type Props = {
	tiles: Tiles;
};
export type Tiles = string[][];

export default function ({tiles}: Props) {
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
