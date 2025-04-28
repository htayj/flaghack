import React, {useCallback, useMemo, useState} from 'react';
import {Box, Newline, Text, useStdout, useInput} from 'ink';
import GameBoard, {Tile, Tiles} from './GameBoard.tsx';
import {List, Map} from 'immutable';
import {filterIs, nullMatrix} from '../util.ts';
import {
	apiGetLogs,
	apiDoPlayerAction,
	Entity,
	// setLog,
	World,
	apiGetWorld,
} from '../gameloop.ts';
import {map, UndefOr} from 'scala-ts/UndefOr.js';
import {isPositioned} from '../entity.ts';
import {Pos} from '../position.ts';
import Messages from './Messages.tsx';
import {Action} from '../actions.ts';

type Props = {
	username: string;
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
	map(filterIs(e, isPositioned), c => c.pos);

const getTile = (e: UndefOr<Entity>): Tile => {
	switch (e?.type) {
		case 'flag':
			return {color: 'yellow', bright: true, char: 'F'};
		case 'player':
			return {color: 'white', char: '@'};
		case 'wall':
			return {color: 'white', char: '#'};
		case 'hippie':
			return {color: 'yellow', char: 'h'};
		default:
			return {color: 'black', char: '.', bright: true};
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
type Mode = 'normal' | 'inventory' | 'using' | 'popup';
export default function Playing({username}: Props) {
	const [messages, setMessages] = useState<List<string>>(List());
	const [world, setWorld] = useState<World>(Map());
	if (world === undefined || world.size === 0) {
		apiGetWorld().then(w => setWorld(w));
	}
	const theDrawMatrix = drawWorld(world);
	useInput(input => {
		apiDoPlayerAction(parseInput(input)).then(apiGetWorld).then(setWorld);
		apiGetLogs().then(messages => setMessages(List(messages)));
	});

	return (
		<Box flexDirection="column" margin={2}>
			{/* <Text color="green">
				{name} : {counter} tests passed
			</Text> */}
			<Messages messages={messages} />
			<Newline />
			<GameBoard tiles={theDrawMatrix} />
		</Box>
	);
}
