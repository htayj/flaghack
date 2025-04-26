import React, {useCallback, useMemo, useState} from 'react';
import {Box, Newline, Text, useInput} from 'ink';
import GameBoard, {Tile, Tiles} from './components/GameBoard.tsx';
import {List, Map} from 'immutable';
import {filterIs, noop, nullMatrix} from './util.js';
import {
	Action,
	doPlayerAction,
	Entity,
	GameState,
	setLog,
	World,
} from './gameloop.ts';
import {Creature, isCreature} from './creatures.ts';
import {map, UndefOr} from 'scala-ts/UndefOr.js';
import {isItem, Item} from './items.ts';
import {isPosition} from './entity.ts';
import {Pos} from './position.ts';
import {isTerrain, Terrain} from './terrain.ts';

type Props = {
	name: string | undefined;
};

const parseInput = (input: any) => {
	switch (input) {
		case 'j':
			return Action.moveDown;
		case 'h':
			return Action.moveLeft;
		case 'k':
			return Action.moveUp;
		case 'l':
			return Action.moveRight;
		case 'y':
			return Action.moveUpLeft;
		case 'u':
			return Action.moveUpRight;
		case 'b':
			return Action.moveDownLeft;
		case 'n':
			return Action.moveDownRight;
		default:
			return Action.noop;
	}
};

const getPosition = (e: Entity): UndefOr<Pos> =>
	map(filterIs(e, isCreature), (c: Creature) => c.pos) ??
	map(filterIs(e, isTerrain), (t: Terrain) => t.pos) ??
	map(filterIs(e, isItem), (i: Item) => filterIs(i.in, isPosition));

const getTile = (e: UndefOr<Entity>): Tile => {
	switch (e?.type) {
		case 'flag':
			return {color: 'white', char: 'F'};
		case 'player':
			return {color: 'white', char: '@'};
		case 'wall':
			return {color: 'white', char: '#'};
		case 'hippie':
			return {color: 'yellow', char: 'h'};
		default:
			return {color: 'grey', char: '.'};
	}
};

const posKey = (p: Pos): string => `${p.x},${p.y}`;
const drawWorld = (world: World): Tiles => {
	const emptyMatrix = nullMatrix(20, 80);
	const worldMap = world
		.valueSeq()
		.groupBy(entity => map(getPosition(entity), (p: Pos) => posKey(p)))
		.map(v => v.valueSeq().toArray());
	const fullmap = emptyMatrix.map((row, y) =>
		row
			.map((_, x) => worldMap.get(posKey({x, y})))
			.map(List)
			.map(l => l.first())
			.map(getTile),
	);
	return fullmap.map(r => r.toArray()).toArray();
};
export default function App({name = 'DEV'}: Props) {
	const [messages, setMessages] = useState<List<string>>(List());
	const log = useCallback(
		(line: string) => setMessages(old => old.push(line)),
		[setMessages],
	);
	setLog(log);
	const [gameState, setGameState] = useState<GameState>(
		doPlayerAction(noop)(Action.noop),
	);
	const world = useMemo(() => gameState.get('world'), [gameState]);
	const doActionWithLog = doPlayerAction(log);
	const theDrawMatrix = drawWorld(world);

	useInput(input => setGameState(doActionWithLog(parseInput(input))));

	return (
		<Box flexDirection="column" margin={2}>
			{/* <Text color="green">
				{name} : {counter} tests passed
			</Text> */}
			<Box borderStyle="round" height={30} width={100}>
				<Text>{name}</Text>
				<Text>
					{messages.map((message, i) => (
						<Text key={i}>
							$ {message} {'\n'}
						</Text>
					))}
				</Text>
			</Box>
			<Newline />
			<GameBoard tiles={theDrawMatrix} />
		</Box>
	);
}
