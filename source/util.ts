// import {Pos} from './components/GameBoard.js';
// import {useState} from 'react';
import {List} from 'immutable';
// const boardHeight = 20;
// const boardWidth = 20;

// export const genID = () => (Math.random() * 2 ** 8).toString(16);
export type Matrix<T> = List<List<T>>;

export type UndefOr<T> = T | undefined;
export const defined = <T>(a: UndefOr<T>) => a !== undefined;
export const map =
	<T, R>(a: UndefOr<T>) =>
	(f: (b: T) => UndefOr<R>): UndefOr<R> =>
		defined(a) ? f(a) : undefined;
export const filter =
	<T, R extends T>(a: T) =>
	(f: (p: T) => p is R): UndefOr<R> =>
		f(a) ? a : undefined;

export const nullMatrix = (h: number, w: number): Matrix<null> => {
	const rows = Array<null[]>(h);
	const filled = rows.fill(Array<null>(w).fill(null));
	/* filled.map( row => rownull) */

	return List(filled.map(List));
};

// export const mapMatrix = <T, R>(
// 	matrix: Matrix<T>,
// 	fn: (item: T, x: number, y: number) => R,
// ): Matrix<R> > matrix.map((r, y) => r.map((c, x) => fn(c, x, y)));

// export const fillMatrixEntities = (
// 	matrix: Matrix<null>,
// 	entities: List<Entity>,
// ) =>
// 	mapMatrix(matrix, (_, x, y) =>
// 		entities.filter(({pos}) => pos.x === x && pos.y === y),
// 	);
// // the game state that is sent to the frontend
// type Message = string;

// const entities = List<Entity>([
// 	player(0, 0),
// 	wall(3, 1),
// 	wall(3, 2),
// 	wall(3, 3),
// 	wall(3, 4),
// ]);

// const visibleMap = fillMatrixEntities(
// 	nullMatrix(boardHeight, boardWidth),
// 	entities,
// ); //TODO: visibility
// export const useMap = () => visibleMap;
// export const useMessages = () => useState<Message[]>([]);
// const usePushMessage = (newMessage: string) => {
// 	const [_, setMessages] = useMessages();
// 	setMessages(old => old.concat([newMessage]));
// };
// export const useParseInput = (input: string) => {
// 	usePushMessage(input);
// };

// export const matrixToArray = <T extends any>(matrix: Matrix<T>): T[][] =>
// 	matrix.map(m => m.toArray()).toArray();
