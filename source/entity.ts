// import {isCreature} from './creatures.ts';
// import {Entity} from './gameloop.ts';
import {defined} from 'scala-ts/UndefOr.js';
import {isCreature} from './creatures.ts';
import {GameState, World} from './gameloop.ts';
import {collideP, Pos, shift} from './position.ts';
import {isTerrain} from './terrain.ts';

export type Key = string;
export type Keyed = {key: Key};
export const getKey = <T extends Keyed>(a: T) => a.key;
export type Positioned = {pos: Pos};
// export const isPositioned = (a: Entity): a is Positioned=> isCreature(a)
export const isPosition = (e: Pos | Key): e is Pos => typeof e === 'object';
export type Contained = {in: Key};
export type Located = Positioned | Contained;

export const genKey = () => (Math.random() * 2 ** 8).toString(16);

export type EntityBase = Keyed;
export type EntityPositioned = EntityBase & Positioned;
export type EntityContained = EntityBase & Contained;
export type EntityLocated = EntityPositioned | EntityContained;

export const movePosition = <T extends EntityPositioned>(e: T, by: Pos) => ({
	...e,
	pos: shift(e.pos, by),
});

export const actPosition =
	(w: World) =>
	<T extends EntityPositioned>(e: T, by: Pos) => {
		const newPosition = shift(e.pos, by);
		const eCollides = collideP(newPosition);
		const collidedEntity = w
			.filter(e => isCreature(e) || isTerrain(e))
			.find(o => eCollides(o.pos));
		if (!defined(collidedEntity)) return movePosition(e, by);
		if (isTerrain(collidedEntity)) return e;
		return e;
	};
