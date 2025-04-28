import React from 'react';
import {Box, Text} from 'ink';
import {Map} from 'immutable';
import {identity} from '../util.ts';
import {getOrElse} from 'scala-ts/UndefOr.js';

type Props = {
	tiles: Tiles;
};
export type Tile = {
	char: string;
	color?: Color;
	bright?: boolean;
	bg?: boolean;
};
// export type Tiles = string[][];
export type Tiles = Tile[][];

// const colorToEsc = (color?: string) =>
// 	color === 'yellow' ? `\x1b[33m` : color === 'grey' ? `\x1b[90m` : `\x1b[37m`;

type Color =
	| 'black'
	| 'red'
	| 'green'
	| 'yellow'
	| 'blue'
	| 'magenta'
	| 'cyan'
	| 'white';
const colorNumMap = Map<Color, number>({
	black: 0,
	red: 1,
	green: 2,
	yellow: 3,
	blue: 4,
	magenta: 5,
	cyan: 6,
	white: 7,
});
const maybeDo =
	(doP?: boolean) =>
	<T extends Function>(fn: T) =>
		!!doP ? fn : identity;
const fgColor = (num: number) => num + 30;
const bgColor = (num: number) => num + 10;
const brightenColor = (num: number) => num + 60;
// const bfgColor = (num: number) => num + 90;
// const bbgColor = (num: number) => num + 100;
const escColor = (num: number) => `\x1b[${num}m`;
const ecolor = (color: Color = 'white', bright?: boolean, bg?: boolean) =>
	escColor(
		maybeDo(bg)(bgColor)(
			maybeDo(bright)(brightenColor)(
				fgColor(getOrElse(colorNumMap.get(color), () => 7)),
			),
		),
	);
// const colorEscMap = colorNumMap
// 	.map(fgColor)
// 	.merge(colorNumMap.mapKeys(s => 'bright_' + s).map(bfgColor))
// 	.merge(colorNumMap.mapKeys(s => 'bg_' + s).map(bgColor));
// const colorToEsc = (color?: string) => {
// 	switch (color) {
// 		case 'yellow':
// 			return `\x1b[33m`;
// 		case 'grey':
// 			return `\x1b[33m`;
// 	}
// };
// color === 'yellow' ? `\x1b[33m` : color === 'grey' ? `\x1b[90m` : `\x1b[37m`;
export default function ({tiles}: Props) {
	const tileToText = ({color, char, bright, bg}: Tile) =>
		`${ecolor(color, bright, bg)}${char}`;
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

// <Text>{tiles.map(row => row.map(tileToText).join('')).join('\n')}</Text>

// FIXME: why is this way of doing it slow?
// <Text>
// 	{tiles.map((row, i) => (
// 		<Text key={i}>{row.map(tileToText).join('')}</Text>
// 	))}
// </Text>
