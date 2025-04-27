import {Map} from 'immutable';
import {EntityPositioned, isPositioned} from './entity.ts';
import {Entity, GameState, updateEntity, World} from './gameloop.ts';
import {itemsAt, pickup} from './items.ts';

// export const pickupAtFeet =
// 	(log: (s: string) => void) =>
// 	(gs: GameState) =>
// 	<T extends Entity>(e: T) => {
// 		const toPickup = isPositioned(e)
// 			? itemsAt(log)(gs.get('world'))(e.pos)
// 			: Map();
// 		return toPickup.reduce(
// 			(acc, curr) => updateEntity(acc)(e)(pickup(e)(curr)),
// 			gs,
// 		);
// 	};
