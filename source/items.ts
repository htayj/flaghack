import {Creature} from './creatures.js';
import {genKey, Key, Keyed} from './entity.js';
import {Entity} from './gameloop.js';
import {Pos} from './position.js';

export type ItemBase = Keyed & {kind: 'item'} & {
	in: Pos | Key; // either position or owner
};
export type Flag = ItemBase & {type: 'flag'};
export type Item = Flag;
export const groundFlag = (pos: Pos): Flag => ({
	in: pos,
	type: 'flag',
	kind: 'item',
	key: genKey(),
});

export const isItem = (e: Entity): e is Item => e.kind === 'item';
export const pickup = (item: Item, by: Creature): Item => ({
	...item,
	in: by.key,
});
export const drop = (item: Item, by: Creature): Item => ({...item, in: by.pos});
