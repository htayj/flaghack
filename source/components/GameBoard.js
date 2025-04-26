import React from 'react';
import { Box, Text } from 'ink';
/* const testTiles = Array<string[]>(20).fill(Array<string>(20).fill('.')); */
/* type Tile = '.' | '@'; */
/* const boardHeight = 20;
 * const boardWidth = 20; */
export default function (_a) {
    var _b, _c;
    var tiles = _a.tiles;
    /* const {playerPosition} = state;
    const drawing = Array<Entity[]>(boardHeight)
        .map(() => Array<Entity>(boardWidth))
        .map((row, y) =>
            row.map((_, x) =>
                playerPosition.y === y && playerPosition.x === x
                    ? {tile: '@', animate: false}
                    : {tile: '.', animate: false},
            ),
        )
        .map(r => r.map(c => c.tile));
    console.log('drawing: ', drawing); */
    return (React.createElement(Box, { borderStyle: "round", height: tiles.length + 2, width: ((_c = (_b = tiles[0]) === null || _b === void 0 ? void 0 : _b.length) !== null && _c !== void 0 ? _c : 1) + 2 },
        React.createElement(Text, null, tiles.map(function (row) { return row.join(''); }).join('\n'))));
}
