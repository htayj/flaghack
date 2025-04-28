import {Data, Match, pipe} from 'effect';
import {all, andThen, Effect, promise, succeed} from 'effect/Effect';
import {Action} from '../actions.ts';
import {Creature, isHippie, isPlayer, Player} from '../creatures.ts';
import {
	creaturesFrom,
	GameState,
	notPlayerFrom,
	worldFrom,
} from '../gameloop.ts';

class ErrPlayerAi extends Data.TaggedError('ErrPlayerAi') {}

export type PlannedAction = {entity: Creature; action: Action};
const hippieAi = (gs: GameState) => (e: Creature) => {
	if (e.pos.y < 15 && e.pos.x == 50) return Action.moveDown;
	if (e.pos.y == 15 && e.pos.x < 70) return Action.moveRight;
	if (e.pos.y > 5 && e.pos.x == 70) return Action.moveUp;
	if (e.pos.y == 5 && e.pos.x > 50) return Action.moveLeft;
	else return Action.noop;
};
const playerAi = (_: GameState) => (_: Player) => Action.noop;

const ai = (gs: GameState) =>
	Match.type<Creature>().pipe(
		Match.when(isHippie, hippieAi(gs)),
		Match.when(isPlayer, playerAi(gs)),
		Match.exhaustive,
	);
const eAi = (gs: GameState) => (e: Creature) =>
	promise(async () => ({entity: e, action: ai(gs)(e)}));
export const allAiPlan = (gs: GameState): Effect<PlannedAction[]> =>
	pipe(
		succeed(gs),
		andThen(worldFrom),
		andThen(creaturesFrom),
		andThen(notPlayerFrom),
		andThen(w => w.map(e => eAi(gs)(e))),
		andThen(w => w.valueSeq().toArray()),
		andThen(all), // todo: set concurrency
	);
