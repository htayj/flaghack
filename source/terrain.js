import { genKey } from './entity.js';
export var isTerrain = function (e) { return e.kind === 'terrain'; };
export var wall = function (x, y) { return ({
    pos: { x: x, y: y },
    type: 'wall',
    kind: 'terrain',
    key: genKey(),
}); };
