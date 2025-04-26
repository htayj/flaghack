var __read = (this && this.__read) || function (o, n) {
    var m = typeof Symbol === "function" && o[Symbol.iterator];
    if (!m) return o;
    var i = m.call(o), r, ar = [], e;
    try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    }
    catch (error) { e = { error: error }; }
    finally {
        try {
            if (r && !r.done && (m = i["return"])) m.call(i);
        }
        finally { if (e) throw e.error; }
    }
    return ar;
};
import React, { useState } from 'react';
import { Box, Newline, Text, useInput } from 'ink';
import GameBoard from "./components/GameBoard.js";
import { List, Map } from 'immutable';
import { nullMatrix,
// Entity,
// drawMatrix,
// useEntityMatrix,
// matrixToArray,
// parseInput,
// useMap,
// matrixToArray,
// useMessages,
// useParseInput,
 } from './util.js';
import { Action, doAction } from "./gameloop.js";
import { isCreature } from "./creatures.js";
import { map } from 'scala-ts/UndefOr.js';
import { isItem } from "./items.js";
import { isPosition } from "./entity.js";
import { isTerrain } from "./terrain.js";
// const drawMatrix = (matrix: Matrix<List<Entity> | null>): Matrix<string> =>
// 	mapMatrix(matrix, cell => (cell === null ? '.' : cell?.first()?.char ?? '.'));
// const drawWorld = (entities: Matrix<List<Entity> | null>): Matrix<string> =>
// 	mapMatrix(matrix, cell => (cell === null ? '.' : cell?.first()?.char ?? '.'));
// type world = {}
/* const placePlayer = (tiles: string[][], {x, y }: Pos): string[][] =>{
 * 	return tiles.map((row, r) => r=== y? row.map((col, c) => c===x ? "@" : col) : row)
 * } */
var parseInput = function (input) {
    switch (input) {
        case 'j':
            return Action.moveDown;
        case 'h':
            return Action.moveLeft;
        case 'k':
            return Action.moveUp;
        case 'l':
            return Action.moveRight;
        default:
            return Action.noop;
    }
};
export var filterIs = function (u, f) { return (f(u) ? u : undefined); };
var getPosition = function (e) {
    var _a, _b;
    return (_b = (_a = map(filterIs(e, isCreature), function (c) { return c.pos; })) !== null && _a !== void 0 ? _a : map(filterIs(e, isTerrain), function (t) { return t.pos; })) !== null && _b !== void 0 ? _b : map(filterIs(e, isItem), function (i) { return filterIs(i.in, isPosition); });
};
var getTile = function (e) {
    switch (e === null || e === void 0 ? void 0 : e.type) {
        case 'flag':
            return 'F';
        case 'player':
            return '@';
        case 'wall':
            return '#';
        case 'npc':
            return 'h';
        default:
            return '.';
    }
};
var posKey = function (p) { return "".concat(p.x, ",").concat(p.y); };
var drawWorld = function (world) {
    var emptyMatrix = nullMatrix(80, 80);
    var worldMap = world
        .valueSeq()
        .groupBy(function (entity) { return map(getPosition(entity), function (p) { return posKey(p); }); })
        .map(function (v) { return v.valueSeq().toArray(); });
    var fullmap = emptyMatrix.map(function (row, y) {
        return row
            .map(function (cell, x) { return worldMap.get(posKey({ x: x, y: y })); })
            .map(List)
            .map(function (l) { return l.first(); })
            .map(getTile);
    });
    return fullmap.map(function (r) { return r.toArray(); }).toArray();
};
export default function App(_a) {
    var _b = _a.name, name = _b === void 0 ? 'DEV' : _b;
    // const entityMatrix = useMap();
    // const [ messages ] = useMessages()
    var _c = __read(useState(Map()), 2), world = _c[0], setWorld = _c[1];
    var _d = __read(useState(List()), 2), messages = _d[0], setMessages = _d[1];
    // const [messages, setMessages] = useMessages();
    // const theDrawMatrix = matrixToArray(drawMatrix(entityMatrix));
    var theDrawMatrix = drawWorld(world);
    useInput(function (input) { return doAction(parseInput(input)); });
    return (React.createElement(Box, { flexDirection: "column", margin: 2 },
        React.createElement(Box, { borderStyle: "round", height: 10, width: 20 },
            React.createElement(Text, null, name),
            React.createElement(Text, null, messages.map(function (message) { return (React.createElement(Text, null,
                "$ ",
                message,
                " ",
                '\n')); }))),
        React.createElement(Newline, null),
        React.createElement(GameBoard, { tiles: theDrawMatrix })));
}
