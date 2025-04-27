import {Map, Record} from 'immutable';
import {Terrain, testWalls} from './terrain.js';
import {
	Creature,
	hippie,
	isCreature,
	isPlayer,
	Player,
	player,
} from './creatures.js';
import {groundFlag, isItem, Item} from './items.js';
// import {pickupAtFeet} from './actions.js';
import {actPosition, getKey} from './entity.js';
import {map, filter, UndefOr} from 'scala-ts/UndefOr.js';
import {noop} from './util.js';
export enum Action {
	apply,
	noop,
	moveLeft,
	moveDown,
	moveRight,
	moveUp,
	moveDownLeft,
	moveDownRight,
	moveUpRight,
	moveUpLeft,
	pickup,
}

export type Log = (a: string) => void;
export type World = Map<string, Terrain | Creature | Item>;
export type Entity = Terrain | Creature | Item;
export type GameState = Record<{
	world: World;
}>;
const initWorld: Entity[] = [
	player(3, 3),
	...testWalls,
	groundFlag({x: 4, y: 4}),
	hippie(50, 3),
];
const _state: {gameState: GameState; log: (s: string) => void} = {
	gameState: Record({
		world: Map<string, Entity>(
			Object.fromEntries(initWorld.map(e => [e.key, e])),
		),
	})(),
	log: noop,
};

const setGameState = (s: GameState): void => {
	_state.gameState = s;
};

const getGameState = (): GameState => _state.gameState;

const updateGameStateInMemory =
	(log: Log) => (fn: (s: GameState) => GameState) => {
		const oldGameState = getGameState();
		// log(`Old game state: ${JSON.stringify(oldGameState)}`);
		const newGameState = fn(oldGameState);
		// log(`New game state: ${JSON.stringify(newGameState)}`);
		setGameState(newGameState);
	};

const updateWorld = (gs: GameState) => (fn: (w: World) => World) =>
	gs.update('world', fn);

export const updateEntity =
	(gs: GameState) =>
	<T extends Entity>(e: T) =>
	<R extends Entity>(fn: (e: T) => R): GameState =>
		updateWorld(gs)((w: World) => w.update(getKey(e), _ => map(e, fn)));

const getPlayer = (gs: GameState): UndefOr<Player> =>
	filter(gs.get('world').get('player'), isPlayer) as Player;

export const setLog = (l: (a: string) => void) => {
	_state.log = l;
};
export const getLog = () => {
	return _state.log;
};
const ai =
	(gs: GameState) =>
	(e: Creature): Action => {
		if (e.pos.y < 15 && e.pos.x == 50) return Action.moveDown;
		if (e.pos.y == 15 && e.pos.x < 70) return Action.moveRight;
		if (e.pos.y > 5 && e.pos.x == 70) return Action.moveUp;
		if (e.pos.y == 5 && e.pos.x > 50) return Action.moveLeft;
		else return Action.noop;
	};
export const doPlayerAction =
	(log: (s: string) => void) =>
	(action: Action): GameState => {
		updateGameStateInMemory(log)(gs => {
			log(JSON.stringify(gs.get('world').filter(isItem).valueSeq().toArray()));
			const playerActed = doAction(log)(gs)(getPlayer(gs))(action);
			// process creatures
			const creaturesActed = gs
				.get('world')
				.filter(isCreature)
				.filterNot(isPlayer)
				.map(e => [e, ai(gs)(e)] as [Creature, Action])
				.map(s => {
					log(
						`e: ${s[0].name}  (${s[0].pos.x}, ${s[0].pos.y})action: ${
							Action[s[1]]
						}`,
					);
					return s;
				})
				.reduce((acc, [e, act]) => {
					log(`doing action: ${JSON.stringify(act)}`);
					return doAction(log)(acc)(e)(act);
				}, playerActed);

			return creaturesActed;
		});

		return getGameState();
	};

export const getGameStateExtern = () => {
	return _state.gameState;
};
export const doAction =
	(log: (s: string) => void) =>
	(gs: GameState) =>
	<C extends Creature>(c?: C) =>
	(action: Action): GameState => {
		// log(`world: ${JSON.stringify(gs.get('world'))}`);
		// log(`creature: ${JSON.stringify(crea)}`);
		const crea = c ?? getPlayer(gs) ?? player(2, 2);
		log(`creature: ${JSON.stringify(crea)}, action: ${action}`);
		const world = gs.get('world');

		switch (action) {
			case Action.moveLeft: {
				// log(
				// 	`moveposition: ${JSON.stringify(movePosition(crea, {x: -1, y: 0}))}`,
				// );
				return (
					updateEntity(gs)(crea)(c =>
						actPosition(log)(world)(c, {x: -1, y: 0}),
					) ?? c
				);
			}
			case Action.moveRight: {
				return (
					updateEntity(gs)(crea)(c =>
						actPosition(log)(world)(c, {x: 1, y: 0}),
					) ?? c
				);
			}
			case Action.moveUp: {
				return (
					updateEntity(gs)(crea)(c =>
						actPosition(log)(world)(c, {x: 0, y: -1}),
					) ?? c
				);
			}
			case Action.moveDown: {
				log(
					`moveposition: ${JSON.stringify(
						actPosition(log)(world)(crea, {x: -1, y: 0}),
					)}`,
				);
				return (
					updateEntity(gs)(crea)(c =>
						actPosition(log)(world)(c, {x: 0, y: 1}),
					) ?? c
				);
			}
			case Action.moveDownLeft: {
				return (
					updateEntity(gs)(crea)(c =>
						actPosition(log)(world)(c, {x: -1, y: 1}),
					) ?? c
				);
			}
			case Action.moveDownRight: {
				return (
					updateEntity(gs)(crea)(c =>
						actPosition(log)(world)(c, {x: 1, y: 1}),
					) ?? c
				);
			}
			case Action.moveUpLeft: {
				return (
					updateEntity(gs)(crea)(c =>
						actPosition(log)(world)(c, {x: -1, y: -1}),
					) ?? c
				);
			}
			case Action.moveUpRight: {
				return (
					updateEntity(gs)(crea)(c =>
						actPosition(log)(world)(c, {x: 1, y: -1}),
					) ?? c
				);
			}
			// case Action.pickup: {
			// 	return pickupAtFeet(log)(gs)(crea);
			// }
			default:
				log('default case');
				return gs;
		}
	};
