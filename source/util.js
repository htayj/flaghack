// import {Pos} from './components/GameBoard.js';
// import {useState} from 'react';
import { List } from 'immutable';
export var defined = function (a) { return a !== undefined; };
export var map = function (a) {
    return function (f) {
        return defined(a) ? f(a) : undefined;
    };
};
export var filter = function (a) {
    return function (f) {
        return f(a) ? a : undefined;
    };
};
export var nullMatrix = function (h, w) {
    var rows = Array(h);
    var filled = rows.fill(Array(w).fill(null));
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
